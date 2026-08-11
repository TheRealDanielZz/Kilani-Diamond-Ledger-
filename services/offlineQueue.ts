/**
 * offlineQueue.ts — Write-Ahead Log (WAL) & Resilient Mutation Queue
 *
 * Captures offline writes, stores them in persistent storage (localStorage),
 * and automatically retries them in chronological order when the network recovers.
 */

export interface PendingMutation {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

const QUEUE_STORAGE_KEY = 'kilani_offline_mutation_queue_v1';

function getStoredQueue(): PendingMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredQueue(queue: PendingMutation[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[offlineQueue] Unable to save queue to localStorage:', err);
  }
}

export class OfflineMutationQueue {
  private handlers = new Map<string, (payload: any) => Promise<unknown>>();
  private isFlushing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flush());
    }
  }

  /**
   * Register an async handler for a given mutation type (e.g. 'CREATE_PROJECT', 'COMPLETE_PROJECT')
   */
  registerHandler(type: string, handler: (payload: any) => Promise<unknown>): void {
    this.handlers.set(type, handler);
  }

  /**
   * Queue a mutation for execution. If online, attempts immediate execution.
   * If offline or if execution fails, saves to WAL queue and retries upon connection recovery.
   */
  async enqueue<T>(type: string, payload: Record<string, unknown>, executeFn: () => Promise<T>): Promise<T> {
    if (!navigator.onLine) {
      this.recordInQueue(type, payload);
      throw new Error('Device is offline. Mutation saved to offline queue and will sync automatically when reconnected.');
    }

    try {
      return await executeFn();
    } catch (err: any) {
      if (err?.code === 'unavailable' || err?.message?.includes('network') || err?.message?.includes('offline')) {
        this.recordInQueue(type, payload);
        throw new Error('Network unavailable. Mutation saved to offline queue and will sync automatically.');
      }
      throw err;
    }
  }

  private recordInQueue(type: string, payload: Record<string, unknown>): void {
    const queue = getStoredQueue();
    const mutation: PendingMutation = {
      id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    queue.push(mutation);
    saveStoredQueue(queue);
    console.log(`[offlineQueue] Queued offline mutation [${type}]:`, mutation.id);
  }

  /**
   * Returns current pending queue length
   */
  getPendingCount(): number {
    return getStoredQueue().length;
  }

  /**
   * Process all queued mutations in FIFO order upon network reconnection
   */
  async flush(): Promise<{ processed: number; failed: number }> {
    if (this.isFlushing || !navigator.onLine) return { processed: 0, failed: 0 };
    const queue = getStoredQueue();
    if (queue.length === 0) return { processed: 0, failed: 0 };

    this.isFlushing = true;
    console.log(`[offlineQueue] Reconnected! Flushing ${queue.length} pending mutations...`);

    let processed = 0;
    let failed = 0;
    const remainingQueue: PendingMutation[] = [];

    for (const item of queue) {
      const handler = this.handlers.get(item.type);
      if (!handler) {
        console.warn(`[offlineQueue] No handler registered for mutation type "${item.type}". Skipping.`);
        continue;
      }

      try {
        await handler(item.payload);
        processed++;
        console.log(`[offlineQueue] Successfully flushed mutation [${item.type}]: ${item.id}`);
      } catch (err: any) {
        console.error(`[offlineQueue] Failed to flush mutation [${item.type}]: ${item.id}`, err);
        item.retryCount++;
        if (item.retryCount < 5) {
          remainingQueue.push(item);
        } else {
          console.error(`[offlineQueue] Exceeded max retries (5) for mutation ${item.id}. Dropping.`);
        }
        failed++;
      }
    }

    saveStoredQueue(remainingQueue);
    this.isFlushing = false;
    return { processed, failed };
  }
}

export const offlineQueue = new OfflineMutationQueue();
