/** How long a code must be out of view before the same code counts again (keep-scanning mode). */
export const SCAN_REPEAT_DELAY_MS = 1500;

type ScanSessionGateOptions = {
  /** Keep accepting codes after the first one (selling). Default: one code per opening. */
  continuous?: boolean;
  repeatDelayMs?: number;
  /** Clock, for tests. */
  now?: () => number;
};

/**
 * Synchronous gate: camera callbacks can repeat before React renders new state.
 *
 * One-scan mode (default) accepts a single code per opening.
 * Keep-scanning mode accepts a code only when that same code has not been SEEN for
 * `repeatDelayMs`: every detection, accepted or not, restarts its wait. So a label held under
 * the camera counts once, the next identical item counts once its label was out of view for
 * 1.5 s, and a different code counts at once.
 */
export function createScanSessionGate(options: ScanSessionGateOptions = {}) {
  const continuous = options.continuous === true;
  const repeatDelayMs = options.repeatDelayMs ?? SCAN_REPEAT_DELAY_MS;
  const now = options.now ?? Date.now;
  let accepting = false;
  const lastSeenAt = new Map<string, number>();

  const forgetOld = (time: number) => {
    if (lastSeenAt.size < 50) return;
    lastSeenAt.forEach((seenAt, code) => {
      if (time - seenAt >= repeatDelayMs) lastSeenAt.delete(code);
    });
  };

  /** Remember a sighting; true when the code was not seen within the repeat delay. */
  const see = (code: string): boolean => {
    const time = now();
    const previous = lastSeenAt.get(code);
    lastSeenAt.set(code, time);
    forgetOld(time);
    return previous === undefined || time - previous >= repeatDelayMs;
  };

  return {
    open() {
      accepting = true;
      lastSeenAt.clear();
    },
    close() {
      accepting = false;
    },
    /**
     * Keep-scanning mode: note a code the camera saw while counting is paused (e.g. the size
     * picker is open), so a label still under the camera is not counted the moment it closes.
     */
    observe(data: string) {
      const code = (data || '').trim();
      if (continuous && code) see(code);
    },
    accept(data: string): boolean {
      const code = (data || '').trim();
      if (!accepting || !code) return false;
      if (!continuous) {
        accepting = false;
        return true;
      }
      return see(code);
    },
  };
}

export type ScanSessionGate = ReturnType<typeof createScanSessionGate>;
