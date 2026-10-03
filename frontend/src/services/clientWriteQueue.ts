import { supabaseSyncLogger, SyncAction } from './supabaseSyncLogger';

export type QueuePriority = 'HIGH' | 'NORMAL' | 'LOW';

export interface QueuedWriteTask<T = any> {
  id: string;
  table: string;
  recordId: string;
  data: any;
  action: SyncAction;
  priority: QueuePriority;
  enqueuedAt: number;
  retries: number;
  maxRetries: number;
  traceId: string;
  resolve: (value: { success: boolean; data?: T; error?: string }) => void;
  reject: (reason?: any) => void;
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
    enqueuedAt: number;
  }>;
}

type QueueListener = (status: QueueStatus) => void;

/**
 * ClientWriteQueue
 * Serializes and governs all Firestore and Supabase writes originating from App.tsx and frontend services.
 * - Prevents 401 Unauthorized token contention during concurrent test submissions
 * - Coalesces duplicate updates for identical records
 * - Provides retry logic with exponential backoff & jitter
 * - Offers real-time observability into queue depth & in-flight writes
 */
export class ClientWriteQueue {
  private queue: QueuedWriteTask[] = [];
  private inFlight = new Map<string, QueuedWriteTask>();
  private activeCount = 0;
  private maxConcurrency = 4; // Dual/quad parallel worker pool for high-throughput writes
  private listeners = new Set<QueueListener>();

  // Metrics
  private processedCount = 0;
  private failedCount = 0;
  private coalescedCount = 0;

  /**
   * Set concurrency limit (e.g. 1 for strict serialization, 2 for dual channel)
   */
  public setConcurrency(limit: number) {
    this.maxConcurrency = Math.max(1, limit);
    this.processNext();
  }

  /**
   * Enqueue a write/upsert operation
   */
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
    const priority = options.priority || (table === 'submissions' || table === 'attempts' ? 'HIGH' : 'NORMAL');
    const maxRetries = options.maxRetries ?? 2;
    const traceId = `cwq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const taskKey = `${table}:${recordId}`;

    return new Promise((resolve, reject) => {
      // Coalescing: Check if an identical record is already waiting in the queue
      const existingIdx = this.queue.findIndex((t) => `${t.table}:${t.recordId}` === taskKey);
      if (existingIdx >= 0) {
        this.coalescedCount++;
        const oldTask = this.queue[existingIdx];
        
        // Replace with freshest data and merge resolve callbacks
        this.queue[existingIdx] = {
          ...oldTask,
          data,
          action,
          priority: priority === 'HIGH' ? 'HIGH' : oldTask.priority,
          enqueuedAt: Date.now(),
          traceId,
          resolve: (res) => {
            oldTask.resolve(res);
            resolve(res);
          },
          reject: (err) => {
            oldTask.reject(err);
            reject(err);
          },
        };

        this.notify();
        return;
      }

      const task: QueuedWriteTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        table,
        recordId,
        data,
        action,
        priority,
        enqueuedAt: Date.now(),
        retries: 0,
        maxRetries,
        traceId,
        resolve,
        reject,
      };

      if (priority === 'HIGH') {
        // Insert before lower priority items
        const insertIdx = this.queue.findIndex((t) => t.priority !== 'HIGH');
        if (insertIdx === -1) {
          this.queue.push(task);
        } else {
          this.queue.splice(insertIdx, 0, task);
        }
      } else {
        this.queue.push(task);
      }

      this.notify();
      this.processNext();
    });
  }

  /**
   * Enqueue a delete operation
   */
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

  /**
   * Process next item in the serialized queue
   */
  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    const flightKey = `${task.table}:${task.recordId}`;
    this.inFlight.set(flightKey, task);
    this.notify();

    try {
      // Execute via the deep monitored logger with headers & concurrency audit
      const result = await supabaseSyncLogger.executeMonitoredWrite(
        task.table,
        task.recordId,
        task.data,
        {
          action: task.action,
          maxRetries: 1, // Let the queue handle higher-level retry policies
        }
      );

      if (result.success) {
        this.processedCount++;
        task.resolve({ success: true, data: result.data });
      } else {
        // Handle 401 Unauthorized or temporary network error with exponential backoff
        const isAuthError =
          result.logEntry?.execution?.failureStage === 'HEADER_INSPECTION' ||
          result.logEntry?.execution?.httpStatus === 401 ||
          result.logEntry?.execution?.httpStatus === 403;

        const isRetryable =
          isAuthError ||
          result.logEntry?.execution?.httpStatus === 429 ||
          result.logEntry?.execution?.failureStage === 'TIMEOUT' ||
          result.logEntry?.execution?.failureStage === 'NETWORK_DISPATCH';

        if (isRetryable && task.retries < task.maxRetries) {
          task.retries++;
          const backoffDelay = isAuthError
            ? 600 // Brief delay to allow token re-sync
            : Math.pow(2, task.retries) * 200 + Math.random() * 100;

          console.warn(
            `[ClientWriteQueue] Retrying [${task.table}:${task.recordId}] in ${Math.round(backoffDelay)}ms (Attempt ${task.retries}/${task.maxRetries}) due to: ${result.error}`
          );

          setTimeout(() => {
            // Re-insert at the head of its priority class
            this.queue.unshift(task);
            this.notify();
            this.processNext();
          }, backoffDelay);
        } else {
          this.failedCount++;
          console.error(`[ClientWriteQueue] Write failed permanently for [${task.table}:${task.recordId}]:`, result.error);
          task.resolve({ success: false, error: result.error });
        }
      }
    } catch (err: any) {
      this.failedCount++;
      task.resolve({ success: false, error: err?.message || String(err) });
    } finally {
      this.activeCount--;
      this.inFlight.delete(flightKey);
      this.notify();
      this.processNext();
    }
  }

  /**
   * Get current queue diagnostic snapshot
   */
  public getStatus(): QueueStatus {
    return {
      pendingCount: this.queue.length,
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
        enqueuedAt: t.enqueuedAt,
      })),
    };
  }

  /**
   * Subscribe to queue state changes
   */
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

  /**
   * Wait for all current in-flight and pending writes to settle
   */
  public async flush(): Promise<void> {
    while (this.queue.length > 0 || this.activeCount > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * Clear pending queue
   */
  public clear(): void {
    const drained = this.queue.splice(0, this.queue.length);
    drained.forEach((t) => t.resolve({ success: false, error: 'Queue cleared' }));
    this.notify();
  }
}

export const clientWriteQueue = new ClientWriteQueue();
