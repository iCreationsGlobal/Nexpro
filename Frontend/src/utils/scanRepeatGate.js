/** How long a code must be out of view before the same code counts again. */
export const SAME_CODE_PAUSE_MS = 1500;

/**
 * Which camera detections count when scanning several items in a row (the phone app uses the same rule).
 * Each code is remembered on its own: it counts again only after it hasn't been seen for
 * SAME_CODE_PAUSE_MS, and every detection of it, counted or not, starts that pause again. A new code
 * counts at once. So a label held under the camera counts once, two labels in view together count
 * once each (not every time the camera flips between them), and the next identical item counts once
 * its label was out of view.
 * @param {number} [pauseMs]
 */
export function createScanRepeatGate(pauseMs = SAME_CODE_PAUSE_MS) {
  const lastSeen = new Map();
  return {
    /**
     * @param {string} code
     * @param {number} [now]
     * @returns {boolean} whether this detection counts
     */
    accept(code, now = Date.now()) {
      const text = String(code ?? '').trim();
      if (!text) return false;
      const seenAt = lastSeen.get(text);
      lastSeen.set(text, now);
      // Forget codes long out of view, so a long scanning session stays small.
      if (lastSeen.size > 200) for (const [key, at] of lastSeen) if (now - at >= pauseMs) lastSeen.delete(key);
      return seenAt === undefined || now - seenAt >= pauseMs;
    },
    reset() {
      lastSeen.clear();
    },
  };
}
