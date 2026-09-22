/**
 * Local device PIN — gates Simple Mode's daily unlock after one full email/password login.
 * Never sent to the backend: it protects the already-authenticated session on this browser,
 * not the account itself, so a stolen/guessed PIN can't be replayed anywhere else.
 * Scoped per userId so a second person logging into the same browser doesn't inherit the PIN.
 * Mirrors mobile/services/devicePin.ts (SecureStore there, localStorage + Web Crypto here).
 */

const PIN_KEY_PREFIX = 'device_pin_hash_';

const keyFor = (userId) => `${PIN_KEY_PREFIX}${userId}`;

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
  },
};
