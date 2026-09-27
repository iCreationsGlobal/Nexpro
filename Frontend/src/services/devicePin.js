/**
 * Local device PIN — gates Simple Mode's daily unlock after one full email/password login.
 * Never sent to the backend: it protects the already-authenticated session on this browser,
 * not the account itself, so a stolen/guessed PIN can't be replayed anywhere else.
 * Scoped per userId so a second person logging into the same browser doesn't inherit the PIN.
 * Mirrors mobile/services/devicePin.ts (SecureStore there, localStorage + Web Crypto here).
 */

const PIN_KEY_PREFIX = 'device_pin_hash_';
const ATTEMPTS_KEY_PREFIX = 'device_pin_attempts_';
/** Wrong PINs allowed before the PIN is wiped and a full password sign-in is required. */
export const MAX_PIN_ATTEMPTS = 5;

const keyFor = (userId) => `${PIN_KEY_PREFIX}${userId}`;
const attemptsKeyFor = (userId) => `${ATTEMPTS_KEY_PREFIX}${userId}`;

async function hashPin(userId, pin) {
  const data = new TextEncoder().encode(`${userId}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const devicePinService = {
  hasPin(userId) {
    if (!userId) return false;
    return !!window.localStorage.getItem(keyFor(userId));
  },

  async setPin(userId, pin) {
    if (!userId || !/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    const hash = await hashPin(userId, pin);
    window.localStorage.setItem(keyFor(userId), hash);
  },

  async verifyPin(userId, pin) {
    if (!userId) return false;
    const stored = window.localStorage.getItem(keyFor(userId));
    if (!stored) return false;
    const hash = await hashPin(userId, pin);
    return hash === stored;
  },

  clearPin(userId) {
    if (!userId) return;
    window.localStorage.removeItem(keyFor(userId));
    window.localStorage.removeItem(attemptsKeyFor(userId));
  },

  /** Wrong attempts so far (persisted, so closing the tab doesn't reset the count). */
  getFailedAttempts(userId) {
    if (!userId) return 0;
    return Number(window.localStorage.getItem(attemptsKeyFor(userId)) || 0);
  },

  recordFailedAttempt(userId) {
    if (!userId) return 0;
    const next = this.getFailedAttempts(userId) + 1;
    window.localStorage.setItem(attemptsKeyFor(userId), String(next));
    return next;
  },

  resetFailedAttempts(userId) {
    if (!userId) return;
    window.localStorage.removeItem(attemptsKeyFor(userId));
  },
};
