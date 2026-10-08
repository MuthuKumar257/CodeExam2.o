import { supabaseSyncLogger, SyncAction } from './supabaseSyncLogger';

export type QueuePriority = 'HIGH' | 'NORMAL' | 'LOW';
export type TaskState = 'PENDING' | 'SENDING' | 'SUCCESS' | 'RETRY';

export interface QueuedWriteTask<T = any> {
  id: string;
  table: string;
  recordId: string;
  data: any;
  action: SyncAction;
  priority: QueuePriority;
  priorityLevel: number; // 1 (Highest: Submissions) to 5 (Lowest: Proctoring)
  state: TaskState;
  enqueuedAt: number;
  retries: number;
  maxRetries: number;
  traceId: string;
  resolve?: (value: { success: boolean; data?: T; error?: string }) => void;
  reject?: (reason?: any) => void;
}

export interface QueueStatus {
  pendingCount: number;
  inFlightCount: number;
  processedCount: number;
  failedCount: number;
  coalescedCount: number;
  isProcessing: boolean;
  concurrencyLimit: number;
  activeItems: Array<{
    id: string;
    table: string;
    recordId: string;
    action: SyncAction;
    priority: QueuePriority;
    state: TaskState;
    enqueuedAt: number;
  }>;
}

type QueueListener = (status: QueueStatus) => void;

const PENDING_STORAGE_KEY = 'codeguard_pending_writes';

function getPriorityLevel(table: string, explicitPriority?: QueuePriority): number {
  if (table === 'submissions') return 1;
  if (table === 'attempts') return 2;
  if (table === 'sessions') return 3;
  if (table === 'answers') return 4;
  if (table === 'proctoring_events') return 5;
  if (explicitPriority === 'HIGH') return 1;
  if (explicitPriority === 'LOW') return 5;
  return 3;
}

/**
 * ClientWriteQueue
 * Serializes and governs all Supabase/backend writes originating from App.tsx and frontend services.
 * - Persistent local queue states (PENDING -> SENDING -> SUCCESS / RETRY)
 * - Prioritized dispatch (1. Submissions, 2. Attempts, 3. Sessions, 4. Answers, 5. Proctoring)
 * - Resilient offline-first persistence via browser storage
 * - Automatic exponential backoff without permanent write drop for active tests
 */
export class ClientWriteQueue {
  private queue: QueuedWriteTask[] = [];
  private inFlight = new Map<string, QueuedWriteTask>();
  private activeCount = 0;
  private maxConcurrency = 4;
  private listeners = new Set<QueueListener>();

  // Metrics
  private processedCount = 0;
  private failedCount = 0;
  private coalescedCount = 0;

  constructor() {
    this.restorePersistedQueue();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[ClientWriteQueue] Online event detected. Resuming write queue...');
        this.processNext();
      });
    }
  }

  private restorePersistedQueue() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(PENDING_STORAGE_KEY);
      if (!raw) return;
      const parsed: QueuedWriteTask[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach((item) => {
          item.state = 'PENDING';
          this.queue.push(item);
        });
        this.sortQueue();
        console.log(`[ClientWriteQueue] Restored ${parsed.length} pending writes from local storage.`);
      }
    } catch (err) {
      console.warn('[ClientWriteQueue] Failed to restore pending writes:', err);
    }
  }

  private persistQueue() {
    if (typeof window === 'undefined') return;
    try {
      const serializable = this.queue.map(({ resolve, reject, ...rest }) => rest);
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(serializable));
    } catch {}
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      if (a.priorityLevel !== b.priorityLevel) {
        return a.priorityLevel - b.priorityLevel; // lower number = higher priority
      }
      return a.enqueuedAt - b.enqueuedAt;
    });
  }

  public setConcurrency(limit: number) {
    this.maxConcurrency = Math.max(1, limit);
    this.processNext();
  }

  public enqueueWrite<T = any>(
    table: string,
    recordId: string,
    data: any,
    options: {
      action?: SyncAction;
      priority?: QueuePriority;
      maxRetries?: number;
      customHeaders?: Record<string, string>;
    } = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    const action = options.action || 'UPSERT';
    const priorityLevel = getPriorityLevel(table, options.priority);
    const priority = options.priority || (priorityLevel <= 2 ? 'HIGH' : priorityLevel >= 5 ? 'LOW' : 'NORMAL');
    // Active assessment tables should never be dropped permanently
    const isCriticalTable = ['submissions', 'attempts', 'sessions', 'answers', 'proctoring_events'].includes(table);
    const maxRetries = options.maxRetries ?? (isCriticalTable ? 50 : 3);
    const traceId = `cwq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const taskKey = `${table}:${recordId}`;

    return new Promise((resolve, reject) => {
      // Coalescing: Check if an identical record is already waiting in queue
      const existingIdx = this.queue.findIndex((t) => `${t.table}:${t.recordId}` === taskKey && t.state !== 'SENDING');
      if (existingIdx >= 0) {
        this.coalescedCount++;
        const oldTask = this.queue[existingIdx];
        
        this.queue[existingIdx] = {
          ...oldTask,
          data,
          action,
          priorityLevel: Math.min(oldTask.priorityLevel, priorityLevel),
          priority: priorityLevel < oldTask.priorityLevel ? priority : oldTask.priority,
          enqueuedAt: Date.now(),
          traceId,
          state: 'PENDING',
          resolve: (res) => {
            oldTask.resolve?.(res);
            resolve(res);
          },
          reject: (err) => {
            oldTask.reject?.(err);
            reject(err);
          },
        };

        this.persistQueue();
        this.notify();
        this.processNext();
        return;
      }

      const task: QueuedWriteTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        table,
        recordId,
        data,
        action,
        priority,
        priorityLevel,
        state: 'PENDING',
        enqueuedAt: Date.now(),
        retries: 0,
        maxRetries,
        traceId,
        resolve,
        reject,
      };

      this.queue.push(task);
      this.sortQueue();
      this.persistQueue();
      this.notify();
      this.processNext();
    });
  }

  public enqueueDelete(
    table: string,
    recordId: string,
    options: { priority?: QueuePriority; maxRetries?: number } = {}
  ): Promise<{ success: boolean; error?: string }> {
    return this.enqueueWrite(table, recordId, { id: recordId, deleted: true }, {
      ...options,
      action: 'DELETE',
    });
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const taskIndex = this.queue.findIndex((t) => t.state === 'PENDING' || t.state === 'RETRY');
    if (taskIndex === -1) return;

    const task = this.queue[taskIndex];
    task.state = 'SENDING';
    this.activeCount++;
    const flightKey = `${task.table}:${task.recordId}`;
    this.inFlight.set(flightKey, task);
    this.persistQueue();
    this.notify();

    try {
      const result = await supabaseSyncLogger.executeMonitoredWrite(
        task.table,
        task.recordId,
        task.data,
        {
          action: task.action,
          maxRetries: 1,
        }
      );

      if (result.success) {
        task.state = 'SUCCESS';
        this.processedCount++;
        // Remove task from queue
        const removeIdx = this.queue.findIndex((t) => t.id === task.id);
        if (removeIdx >= 0) this.queue.splice(removeIdx, 1);
        this.persistQueue();
        task.resolve?.({ success: true, data: result.data });
      } else {
        const isAuthError =
          result.logEntry?.execution?.failureStage === 'HEADER_INSPECTION' ||
          result.logEntry?.execution?.httpStatus === 401 ||
          result.logEntry?.execution?.httpStatus === 403;

        const isCritical = ['submissions', 'attempts', 'sessions', 'answers', 'proctoring_events'].includes(task.table);

        if (task.retries < task.maxRetries || isCritical) {
          task.retries++;
          task.state = 'RETRY';
          const backoffDelay = isAuthError
            ? 800
            : Math.min(15000, Math.pow(1.5, Math.min(task.retries, 8)) * 300 + Math.random() * 200);

          console.warn(
            `[ClientWriteQueue] Retrying [${task.table}:${task.recordId}] in ${Math.round(backoffDelay)}ms (Attempt ${task.retries}/${task.maxRetries}): ${result.error}`
          );

          this.persistQueue();
          setTimeout(() => {
            task.state = 'PENDING';
            this.sortQueue();
            this.persistQueue();
            this.notify();
            this.processNext();
          }, backoffDelay);
        } else {
          this.failedCount++;
          console.error(`[ClientWriteQueue] Write failed permanently for [${task.table}:${task.recordId}]:`, result.error);
          const removeIdx = this.queue.findIndex((t) => t.id === task.id);
          if (removeIdx >= 0) this.queue.splice(removeIdx, 1);
          this.persistQueue();
          task.resolve?.({ success: false, error: result.error });
        }
      }
    } catch (err: any) {
      this.failedCount++;
      const removeIdx = this.queue.findIndex((t) => t.id === task.id);
      if (removeIdx >= 0) this.queue.splice(removeIdx, 1);
      this.persistQueue();
      task.resolve?.({ success: false, error: err?.message || String(err) });
    } finally {
      this.activeCount--;
      this.inFlight.delete(flightKey);
      this.persistQueue();
      this.notify();
      this.processNext();
    }
  }

  public getStatus(): QueueStatus {
    return {
      pendingCount: this.queue.filter((t) => t.state === 'PENDING' || t.state === 'RETRY').length,
      inFlightCount: this.activeCount,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      coalescedCount: this.coalescedCount,
      isProcessing: this.activeCount > 0,
      concurrencyLimit: this.maxConcurrency,
      activeItems: this.queue.slice(0, 10).map((t) => ({
        id: t.id,
        table: t.table,
        recordId: t.recordId,
        action: t.action,
        priority: t.priority,
        state: t.state,
        enqueuedAt: t.enqueuedAt,
      })),
    };
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    setTimeout(() => {
      if (this.listeners.has(listener)) {
        listener(this.getStatus());
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
      const status = this.getStatus();
      this.listeners.forEach((cb) => {
        try {
          cb(status);
        } catch (err) {
          console.warn('[ClientWriteQueue] Listener error:', err);
        }
      });
    }, 0);
  }

  public async flush(): Promise<void> {
    while (this.queue.length > 0 || this.activeCount > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  public clear(): void {
    const drained = this.queue.splice(0, this.queue.length);
    drained.forEach((t) => t.resolve?.({ success: false, error: 'Queue cleared' }));
    this.persistQueue();
    this.notify();
  }
}

export const clientWriteQueue = new ClientWriteQueue();
