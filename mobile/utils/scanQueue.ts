/**
 * Handles scanned codes one at a time, in the order they were scanned. A scan that arrives
 * while an earlier one is still being looked up waits its turn instead of being dropped.
 */
export function createScanQueue(
  handle: (code: string) => Promise<void> | void,
  onError?: (error: unknown, code: string) => void
) {
  const pending: string[] = [];
  let running = false;
  let idleWaiters: Array<() => void> = [];

  const settleIdle = () => {
    if (running || pending.length > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  };

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (pending.length > 0) {
        const code = pending.shift() as string;
        try {
          await handle(code);
        } catch (error) {
          onError?.(error, code);
        }
      }
    } finally {
      running = false;
      settleIdle();
    }
  };

  return {
    push(code: string) {
      pending.push(code);
      void drain();
    },
    /** Drop codes that have not started yet (the one being handled finishes). */
    clear() {
      pending.length = 0;
      settleIdle();
    },
    /** Resolves once every queued code has been handled. */
    whenIdle(): Promise<void> {
      if (!running && pending.length === 0) return Promise.resolve();
      return new Promise((resolve) => {
        idleWaiters.push(resolve);
      });
    },
    get size() {
      return pending.length;
    },
    get busy() {
      return running || pending.length > 0;
    },
  };
}

export type ScanQueue = ReturnType<typeof createScanQueue>;
