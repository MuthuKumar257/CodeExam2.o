/**
 * Supabase Synchronization & Concurrency Diagnostics Logging Layer
 * 
 * Provides deep auditing of:
 * 1. Request Payloads: serialization, size, circular references, undefined fields, key structures.
 * 2. Request Headers: Content-Type, Authorization tokens, API keys, tracing IDs, JWT expiry.
 * 3. Concurrent Write Operations: in-flight tracker, peak concurrency, collision/race condition detection.
 * 4. Error Identification: classifies failures across Payload Validation, Header Inspection,
 *    Client Dispatch, Backend Proxy, and Supabase PostgREST (e.g. PGRST205, RLS, 401/403/409/429).
 */

import { supabase, safeGetSession } from './supabase';

export type SyncAction = 'UPSERT' | 'DELETE' | 'SYNC_ALL' | 'TEST_PROBE' | 'AUTH_SYNC';

export type FailureStage =
  | 'PAYLOAD_VALIDATION'
  | 'HEADER_INSPECTION'
  | 'NETWORK_DISPATCH'
  | 'BACKEND_PROXY'
  | 'SUPABASE_POSTGREST'
  | 'CONCURRENCY_RACE'
  | 'TIMEOUT';

export interface PayloadAuditReport {
  byteSize: number;
  keyCount: number;
  keys: string[];
  hasCircular: boolean;
  hasUndefined: boolean;
  undefinedKeys: string[];
  preview: string;
  isTruncated: boolean;
  validationErrors: string[];
  payloadValid: boolean;
}

export interface HeaderAuditReport {
  hasContentType: boolean;
  contentType: string;
  hasAuthorization: boolean;
  authScheme: 'Bearer' | 'Basic' | 'None' | 'Malformed';
  tokenSnippet: string;
  jwtPayloadPreview?: Record<string, any> | null;
  jwtExpired?: boolean;
  hasApiKey: boolean;
  requestId: string;
  concurrencyIndex: number;
  activeConcurrency: number;
  clientTimestamp: string;
  customHeaders: Record<string, string>;
  headerWarnings: string[];
  headersValid: boolean;
}

export interface SyncExecutionResult {
  startTime: number;
  endTime?: number;
  durationMs: number;
  status: 'QUEUED' | 'IN_FLIGHT' | 'SUCCESS' | 'FAILED' | 'RETRYING';
  httpStatus?: number;
  httpStatusText?: string;
  supabaseStatus?: number;
  supabaseError?: {
    code?: string;
    message: string;
    details?: string | null;
    hint?: string | null;
  } | null;
  failureStage?: FailureStage;
  errorMessage?: string;
  retryAttempt: number;
}

export interface SyncLogEntry {
  id: string;
  traceId: string;
  timestamp: string;
  table: string;
  resolvedTable?: string;
  recordId: string;
  action: SyncAction;
  concurrencyCountAtStart: number;
  isConcurrent: boolean;
  payloadAudit: PayloadAuditReport;
  headerAudit: HeaderAuditReport;
  execution: SyncExecutionResult;
}

export interface SyncLoggerStats {
  totalWrites: number;
  successfulWrites: number;
  failedWrites: number;
  activeConcurrentWrites: number;
  peakConcurrency: number;
  payloadErrorsCount: number;
  headerErrorsCount: number;
  supabasePostgrestErrorsCount: number;
  averageLatencyMs: number;
}

type SyncLoggerListener = (logs: SyncLogEntry[], stats: SyncLoggerStats) => void;

class SupabaseSyncLogger {
  private logs: SyncLogEntry[] = [];
  private maxLogs = 200;
  private listeners: Set<SyncLoggerListener> = new Set();
  
  // Concurrency tracking
  private activeWritesCount = 0;
  private peakConcurrency = 0;
  private writeSequence = 0;
  private inFlightMap: Map<string, { table: string; id: string; startTime: number; traceId: string }> = new Map();

  constructor() {
    // Attempt to rehydrate recent diagnostic logs from sessionStorage if present
    if (typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem('codeguard_supabase_sync_logs');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.logs = parsed.slice(-100);
          }
        }
      } catch {}
    }
  }

  public subscribe(listener: SyncLoggerListener): () => void {
    this.listeners.add(listener);
    setTimeout(() => {
      if (this.listeners.has(listener)) {
        listener([...this.logs], this.getStats());
      }
    }, 0);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyTimer: any = null;

  private notify() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      const logsCopy = [...this.logs];
      const stats = this.getStats();
      this.listeners.forEach((cb) => {
        try {
          cb(logsCopy, stats);
        } catch (err) {
          console.error('[SupabaseSyncLogger] Listener notification error:', err);
        }
      });

      // Save recent logs to sessionStorage for diagnosis
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('codeguard_supabase_sync_logs', JSON.stringify(this.logs.slice(-50)));
        } catch {}
      }
    }, 0);
  }

  public getLogs(): SyncLogEntry[] {
    return [...this.logs];
  }

  public getStats(): SyncLoggerStats {
    const total = this.logs.length;
    const successful = this.logs.filter((l) => l.execution.status === 'SUCCESS').length;
    const failed = this.logs.filter((l) => l.execution.status === 'FAILED').length;
    
    let payloadErrors = 0;
    let headerErrors = 0;
    let supabaseErrors = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    this.logs.forEach((l) => {
      if (l.execution.failureStage === 'PAYLOAD_VALIDATION' || !l.payloadAudit.payloadValid) payloadErrors++;
      if (l.execution.failureStage === 'HEADER_INSPECTION' || !l.headerAudit.headersValid) headerErrors++;
      if (l.execution.failureStage === 'SUPABASE_POSTGREST' || l.execution.supabaseError) supabaseErrors++;
      if (l.execution.durationMs > 0) {
        totalLatency += l.execution.durationMs;
        latencyCount++;
      }
    });

    return {
      totalWrites: total,
      successfulWrites: successful,
      failedWrites: failed,
      activeConcurrentWrites: this.activeWritesCount,
      peakConcurrency: this.peakConcurrency,
      payloadErrorsCount: payloadErrors,
      headerErrorsCount: headerErrors,
      supabasePostgrestErrorsCount: supabaseErrors,
      averageLatencyMs: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
    };
  }

  public clearLogs() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem('codeguard_supabase_sync_logs');
      } catch {}
    }
    this.notify();
  }

  /**
   * Deeply inspects and audits a write payload for serialization, undefineds, and circular refs
   */
  public auditPayload(data: any): PayloadAuditReport {
    const validationErrors: string[] = [];
    const undefinedKeys: string[] = [];
    let hasCircular = false;
    let hasUndefined = false;
    let byteSize = 0;
    let keys: string[] = [];

    if (data === undefined) {
      return {
        byteSize: 0,
        keyCount: 0,
        keys: [],
        hasCircular: false,
        hasUndefined: true,
        undefinedKeys: ['<root>'],
        preview: 'undefined',
        isTruncated: false,
        validationErrors: ['Payload data is undefined. Cannot serialize to JSON for Supabase.'],
        payloadValid: false,
      };
    }

    if (data === null) {
      return {
        byteSize: 4,
        keyCount: 0,
        keys: [],
        hasCircular: false,
        hasUndefined: false,
        undefinedKeys: [],
        preview: 'null',
        isTruncated: false,
        validationErrors: ['Payload data is null.'],
        payloadValid: false,
      };
    }

    if (typeof data === 'object') {
      keys = Object.keys(data);
      for (const k of keys) {
        if (data[k] === undefined) {
          hasUndefined = true;
          undefinedKeys.push(k);
        }
      }
    }

    // Detect circular references
    let jsonString = '';
    try {
      const seen = new WeakSet();
      const checkCircular = (obj: any): boolean => {
        if (typeof obj === 'object' && obj !== null) {
          if (seen.has(obj)) return true;
          seen.add(obj);
          for (const key of Object.keys(obj)) {
            if (checkCircular(obj[key])) return true;
          }
        }
        return false;
      };

      hasCircular = checkCircular(data);
      if (hasCircular) {
        validationErrors.push('Circular reference detected in payload. Cannot be serialized with standard JSON.stringify.');
      } else {
        jsonString = JSON.stringify(data);
        byteSize = new TextEncoder().encode(jsonString).length;
      }
    } catch (err: any) {
      hasCircular = true;
      validationErrors.push(`JSON serialization exception: ${err.message || String(err)}`);
    }

    if (hasUndefined && undefinedKeys.length > 0) {
      validationErrors.push(`Payload contains undefined values in keys: [${undefinedKeys.slice(0, 5).join(', ')}${undefinedKeys.length > 5 ? '...' : ''}]. JSON serialization will omit these fields.`);
    }

    if (byteSize > 4 * 1024 * 1024) {
      validationErrors.push(`Payload size ${(byteSize / (1024 * 1024)).toFixed(2)} MB exceeds recommended PostgREST HTTP limit.`);
    }

    const preview = jsonString ? (jsonString.length > 250 ? jsonString.slice(0, 250) + '...' : jsonString) : '<non-serializable>';

    return {
      byteSize,
      keyCount: keys.length,
      keys,
      hasCircular,
      hasUndefined,
      undefinedKeys,
      preview,
      isTruncated: jsonString.length > 250,
      validationErrors,
      payloadValid: !hasCircular && validationErrors.length === 0,
    };
  }

  /**
   * Deeply inspects and audits outgoing request headers, JWT tokens, and metadata
   */
  public auditHeaders(
    headers: Record<string, string>,
    activeConcurrency: number,
    concurrencyIndex: number,
    traceId: string
  ): HeaderAuditReport {
    const headerWarnings: string[] = [];
    const normalized: Record<string, string> = {};

    Object.entries(headers).forEach(([k, v]) => {
      normalized[k.toLowerCase()] = String(v);
    });

    const contentType = normalized['content-type'] || '';
    const hasContentType = contentType.includes('application/json');
    if (!hasContentType) {
      headerWarnings.push(`Missing or non-JSON Content-Type ("${contentType || 'none'}"). Supabase PostgREST requires 'application/json'.`);
    }

    const authHeader = normalized['authorization'] || '';
    let authScheme: 'Bearer' | 'Basic' | 'None' | 'Malformed' = 'None';
    let tokenSnippet = '';
    let jwtPayloadPreview: Record<string, any> | null = null;
    let jwtExpired: boolean | undefined = undefined;

    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        authScheme = 'Bearer';
        const token = authHeader.slice(7).trim();
        tokenSnippet = token.length > 14 ? `${token.slice(0, 6)}...${token.slice(-4)}` : token;

        // Inspect JWT payload without secret
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
            jwtPayloadPreview = JSON.parse(payloadJson);
            if (jwtPayloadPreview && typeof jwtPayloadPreview.exp === 'number') {
              const expMs = jwtPayloadPreview.exp * 1000;
              if (Date.now() >= expMs) {
                jwtExpired = true;
                headerWarnings.push(`Bearer token expired at ${new Date(expMs).toLocaleTimeString()}. Concurrent write will fail with 401 Unauthorized.`);
              } else {
                jwtExpired = false;
              }
            }
          }
        } catch {
          // Non-standard token structure
        }
      } else {
        authScheme = 'Malformed';
        headerWarnings.push(`Malformed Authorization header: Scheme must be 'Bearer <token>'.`);
      }
    } else {
      // Backend proxy will use server credentials, but noted for client direct calls
      tokenSnippet = '<proxy-fallback>';
    }

    const hasApiKey = Boolean(normalized['apikey'] || normalized['x-api-key']);

    return {
      hasContentType,
      contentType,
      hasAuthorization: Boolean(authHeader),
      authScheme,
      tokenSnippet,
      jwtPayloadPreview,
      jwtExpired,
      hasApiKey,
      requestId: traceId,
      concurrencyIndex,
      activeConcurrency,
      clientTimestamp: new Date().toISOString(),
      customHeaders: normalized,
      headerWarnings,
      headersValid: hasContentType && authScheme !== 'Malformed' && !jwtExpired,
    };
  }

  /**
   * Main Monitored Write Pipeline:
   * Executes a write to Supabase / Backend with full pre-flight payload & header auditing,
   * in-flight concurrency tracking, race detection, and detailed post-flight error diagnostics.
   */
  public async executeMonitoredWrite<T = any>(
    table: string,
    recordId: string,
    data: any,
    options: {
      action?: SyncAction;
      maxRetries?: number;
      customHeaders?: Record<string, string>;
    } = {}
  ): Promise<{ success: boolean; data?: T; error?: string; logEntry: SyncLogEntry }> {
    const action = options.action || 'UPSERT';
    const maxRetries = options.maxRetries ?? 1;
    const traceId = `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const concurrencyIdx = ++this.writeSequence;
    
    // Concurrency tracking
    this.activeWritesCount++;
    if (this.activeWritesCount > this.peakConcurrency) {
      this.peakConcurrency = this.activeWritesCount;
    }
    const currentConcurrency = this.activeWritesCount;
    const isConcurrent = currentConcurrency > 1;

    // Detect race conditions (overlapping concurrent write to same record ID)
    const flightKey = `${table}:${recordId}`;
    const previousInFlight = this.inFlightMap.get(flightKey);
    const hasCollision = Boolean(previousInFlight);

    this.inFlightMap.set(flightKey, {
      table,
      id: recordId,
      startTime: Date.now(),
      traceId,
    });

    // 1. Audit Payload
    const payloadAudit = this.auditPayload(data);

    // 2. Prepare & Audit Headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-request-id': traceId,
      'x-concurrency-index': String(concurrencyIdx),
      'x-active-concurrency': String(currentConcurrency),
      'x-client-timestamp': new Date().toISOString(),
      ...(options.customHeaders || {}),
    };

    // Attach active session token if available
    try {
      if (supabase) {
        const session = await safeGetSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }
    } catch {}

    const headerAudit = this.auditHeaders(headers, currentConcurrency, concurrencyIdx, traceId);

    if (hasCollision && previousInFlight) {
      headerAudit.headerWarnings.push(
        `CONCURRENCY RACE DETECTED: Write for [${table}:${recordId}] overlaps with in-flight write ${previousInFlight.traceId} (started ${Date.now() - previousInFlight.startTime}ms ago).`
      );
    }

    const logEntry: SyncLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      traceId,
      timestamp: new Date().toISOString(),
      table,
      recordId,
      action,
      concurrencyCountAtStart: currentConcurrency,
      isConcurrent,
      payloadAudit,
      headerAudit,
      execution: {
        startTime: Date.now(),
        durationMs: 0,
        status: 'IN_FLIGHT',
        retryAttempt: 0,
      },
    };

    // Append to in-memory ring buffer
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    this.notify();

    // Pretty console group header
    const logTag = `[Supabase Sync Monitor]`;
    const concurrencyLabel = isConcurrent ? `🔥 [CONCURRENT #${concurrencyIdx} (${currentConcurrency} in-flight)]` : `[WRITE #${concurrencyIdx}]`;
    console.groupCollapsed(`${logTag} ${concurrencyLabel} 🚀 Starting ${action} on [${table}:${recordId}]`);
    console.log(`Trace ID:`, traceId);
    console.log(`Payload Audit:`, {
      bytes: `${(payloadAudit.byteSize / 1024).toFixed(2)} KB`,
      keysCount: payloadAudit.keyCount,
      valid: payloadAudit.payloadValid,
      errors: payloadAudit.validationErrors,
      preview: payloadAudit.preview,
    });
    console.log(`Header Audit:`, {
      authScheme: headerAudit.authScheme,
      tokenSnippet: headerAudit.tokenSnippet,
      warnings: headerAudit.headerWarnings,
      customHeaders: headerAudit.customHeaders,
    });
    console.groupEnd();

    // Pre-flight validation gate
    if (payloadAudit.hasCircular) {
      logEntry.execution.status = 'FAILED';
      logEntry.execution.durationMs = Date.now() - logEntry.execution.startTime;
      logEntry.execution.failureStage = 'PAYLOAD_VALIDATION';
      logEntry.execution.errorMessage = 'Payload failed pre-flight circular reference inspection.';
      this.finishWrite(flightKey, logEntry, false);
      return { success: false, error: logEntry.execution.errorMessage, logEntry };
    }

    // 3. Dispatch to Backend DB Save proxy (which synchronizes with Supabase & WebSockets)
    let attempt = 0;
    let finalSuccess = false;
    let finalError: string | undefined;

    while (attempt <= maxRetries && !finalSuccess) {
      attempt++;
      logEntry.execution.retryAttempt = attempt - 1;

      try {
        let backendSuccess = false;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s backend timeout

          const response = await fetch('/api/db/save', {
            method: 'POST',
            headers,
            body: JSON.stringify({ table, id: recordId, data }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          logEntry.execution.httpStatus = response.status;
          logEntry.execution.httpStatusText = response.statusText;

          const contentType = response.headers.get('content-type') || '';
          if (response.ok && contentType.includes('application/json')) {
            const resJson = await response.json().catch(() => null);
            logEntry.resolvedTable = resJson?.resolvedTable || table;
            logEntry.execution.supabaseStatus = resJson?.supabaseStatus;
            logEntry.execution.supabaseError = resJson?.supabaseError;

            // Check if Supabase returned a PostgREST error
            if (resJson?.supabaseError) {
              logEntry.execution.failureStage = 'SUPABASE_POSTGREST';
              logEntry.execution.errorMessage = `Supabase PostgREST Error [${resJson.supabaseError.code || 'UNKNOWN'}]: ${resJson.supabaseError.message}`;
              finalError = logEntry.execution.errorMessage;
            } else {
              backendSuccess = true;
            }
          }
        } catch {
          // Backend server /api/db/save is not running (e.g. static hosting on Vercel)
        }

        // Direct Supabase PostgREST fallback (for static/serverless Vercel deployments)
        if (!backendSuccess && supabase) {
          let resolvedTable = table;
          if (table === 'sessions' || table === 'candidate_sessions') {
            resolvedTable = 'attempts';
          } else if (table === 'results') {
            resolvedTable = 'attempts';
          } else if (table === 'auditLogs') {
            resolvedTable = 'audit_logs';
          } else if (table === 'systemSettings' || table === 'facultySettings' || table === 'studentSettings') {
            resolvedTable = 'institutions';
          }

          if (action === 'DELETE') {
            const { error: sbDelErr } = await supabase.from(resolvedTable).delete().eq('id', recordId);
            if (!sbDelErr) {
              finalSuccess = true;
              logEntry.execution.status = 'SUCCESS';
              logEntry.resolvedTable = `${resolvedTable} (direct)`;
            } else {
              finalError = sbDelErr.message;
            }
          } else {
            let rowToUpsert: any = {
              id: recordId,
              data,
              updated_at: new Date().toISOString(),
            };
            if (table === 'results') {
              rowToUpsert = {
                id: `res-${recordId}`,
                data: { ...data, isResultRecord: true },
                updated_at: new Date().toISOString(),
              };
            } else if (table.includes('Settings') || table.includes('settings')) {
              rowToUpsert = {
                id: `setting-${table}`,
                data: { settingKey: table, data, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString(),
              };
            }

            const { error: sbUpErr } = await supabase.from(resolvedTable).upsert(rowToUpsert, { onConflict: 'id' });
            if (!sbUpErr) {
              finalSuccess = true;
              logEntry.execution.status = 'SUCCESS';
              logEntry.resolvedTable = `${resolvedTable} (direct)`;
            } else {
              finalError = sbUpErr.message;
            }
          }
        } else if (backendSuccess) {
          finalSuccess = true;
          logEntry.execution.status = 'SUCCESS';
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          logEntry.execution.failureStage = 'TIMEOUT';
          logEntry.execution.errorMessage = 'Network write timed out after 6,000ms.';
        } else {
          logEntry.execution.failureStage = 'NETWORK_DISPATCH';
          logEntry.execution.errorMessage = err.message || 'Network fetch dispatch failed.';
        }
        finalError = logEntry.execution.errorMessage;
      }

      if (!finalSuccess && attempt <= maxRetries) {
        // Backoff jitter for concurrent retries
        const jitter = Math.floor(Math.random() * 200) + 100;
        await new Promise((r) => setTimeout(r, jitter));
      }
    }

    if (!finalSuccess) {
      logEntry.execution.status = 'FAILED';
    }

    this.finishWrite(flightKey, logEntry, finalSuccess);
    return { success: finalSuccess, error: finalError, logEntry };
  }

  private finishWrite(flightKey: string, logEntry: SyncLogEntry, success: boolean) {
    logEntry.execution.endTime = Date.now();
    logEntry.execution.durationMs = logEntry.execution.endTime - logEntry.execution.startTime;
    
    this.inFlightMap.delete(flightKey);
    this.activeWritesCount = Math.max(0, this.activeWritesCount - 1);

    const logTag = `[Supabase Sync Monitor]`;
    const concurrencyLabel = logEntry.isConcurrent ? `🔥 [CONCURRENT (${this.activeWritesCount} remaining)]` : ``;

    if (success) {
      console.log(
        `%c${logTag} ${concurrencyLabel} ✅ [${logEntry.table}:${logEntry.recordId}] Succeeded in ${logEntry.execution.durationMs}ms`,
        'color: #10b981; font-weight: bold;'
      );
    } else {
      console.error(
        `%c${logTag} ${concurrencyLabel} ❌ [${logEntry.table}:${logEntry.recordId}] FAILED at stage [${logEntry.execution.failureStage}]: ${logEntry.execution.errorMessage}`,
        'color: #ef4444; font-weight: bold;',
        {
          traceId: logEntry.traceId,
          payloadErrors: logEntry.payloadAudit.validationErrors,
          headerWarnings: logEntry.headerAudit.headerWarnings,
          supabaseError: logEntry.execution.supabaseError,
        }
      );
    }

    this.notify();
  }

  /**
   * Diagnostic test suite that fires N concurrent writes to verify payload and header behavior
   */
  public async runConcurrentWriteDiagnostic(concurrencyLevel = 8): Promise<{
    durationMs: number;
    total: number;
    succeeded: number;
    failed: number;
    entries: SyncLogEntry[];
  }> {
    const startTime = Date.now();
    const testPromises: Promise<any>[] = [];
    const tables = ['attempts', 'users', 'assessments', 'classes', 'questions', 'submissions'];

    for (let i = 0; i < concurrencyLevel; i++) {
      const targetTable = tables[i % tables.length];
      const recordId = `diag-${Date.now()}-${i}`;
      
      // Deliberately introduce test edge cases:
      // i = 3: payload with undefined values
      // i = 5: concurrent write collision targeting recordId of i = 0
      const collisionId = i === 5 ? `diag-${Date.now()}-0` : recordId;
      const testPayload = {
        id: collisionId,
        diagnosticRun: true,
        testIndex: i,
        timestamp: new Date().toISOString(),
        metadata: {
          testFieldA: `Value-${i}`,
          testFieldB: i === 3 ? undefined : `CleanValue-${i}`,
        },
      };

      testPromises.push(
        this.executeMonitoredWrite(targetTable, collisionId, testPayload, {
          action: 'TEST_PROBE',
          customHeaders: {
            'x-diagnostic-test-run': 'true',
            'x-test-index': String(i),
          },
        })
      );
    }

    const results = await Promise.all(testPromises);
    const durationMs = Date.now() - startTime;
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      durationMs,
      total: concurrencyLevel,
      succeeded,
      failed,
      entries: results.map((r) => r.logEntry),
    };
  }
}

export const supabaseSyncLogger = new SupabaseSyncLogger();
