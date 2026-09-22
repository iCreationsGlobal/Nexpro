import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * Local device PIN — gates Simple Mode's daily unlock after one full email/password login.
 * Never sent to the backend: it protects the already-authenticated session on this device,
 * not the account itself, so a stolen/guessed PIN can't be replayed anywhere else.
 * Scoped per userId so a second person logging into the same device doesn't inherit the PIN.
 */

const PIN_KEY_PREFIX = 'device_pin_hash_';

function keyFor(userId: string): string {
  return `${PIN_KEY_PREFIX}${userId}`;
}

async function hashPin(userId: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${userId}:${pin}`);
}

export const devicePinService = {
  async hasPin(userId: string): Promise<boolean> {
    if (!userId) return false;
    const stored = await SecureStore.getItemAsync(keyFor(userId));
    return !!stored;
  },

  async setPin(userId: string, pin: string): Promise<void> {
    if (!userId || !/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    const hash = await hashPin(userId, pin);
    await SecureStore.setItemAsync(keyFor(userId), hash);
  },

  async verifyPin(userId: string, pin: string): Promise<boolean> {
    if (!userId) return false;
    const stored = await SecureStore.getItemAsync(keyFor(userId));
    if (!stored) return false;
    const hash = await hashPin(userId, pin);
    return hash === stored;
  },

  async clearPin(userId: string): Promise<void> {
    if (!userId) return;
    await SecureStore.deleteItemAsync(keyFor(userId));
  },
};
