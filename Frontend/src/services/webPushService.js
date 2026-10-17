import api from './api';

/**
 * Web push for the web app (browser tab or installed app). The service worker shows the
 * notification (src/sw.js); the backend sends to every device registered here, next to the mobile
 * app's Expo tokens. Off until the server has VAPID keys (GET /notifications/push/web-config).
 */

export const isWebPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const isIOSDevice = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isStandaloneApp = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

/** iPhone/iPad only allow web push from the app added to the Home Screen. */
export const needsHomeScreenInstall = () => isIOSDevice() && !isStandaloneApp();

/** @param {string} base64 - URL-safe base64 VAPID public key */
export function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

const describeDevice = () => {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = isIOSDevice() ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'web';
  return `${browser} on ${os}${isStandaloneApp() ? ' (app)' : ''}`;
};

/** The active service worker registration, or null (none in development, or not yet installed). */
export async function getPushRegistration() {
  if (!isWebPushSupported()) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

export async function getCurrentPushSubscription() {
  const registration = await getPushRegistration();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** @returns {Promise<{ enabled: boolean, publicKey: string|null }>} */
export async function fetchWebPushConfig() {
  const response = await api.get('/notifications/push/web-config');
  const data = response?.data?.data ?? response?.data ?? {};
  return { enabled: Boolean(data.enabled && data.publicKey), publicKey: data.publicKey || null };
}

/**
 * Ask permission (must run from a tap), subscribe this browser and register it for the signed-in user.
 * @param {string} publicKey
 * @returns {Promise<'subscribed'|'denied'|'unavailable'>}
 */
export async function subscribeToWebPush(publicKey) {
  const registration = await getPushRegistration();
  if (!registration || !publicKey) return 'unavailable';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await api.post('/notifications/push/register', {
    platform: 'web',
    subscription: subscription.toJSON(),
    deviceName: describeDevice(),
  });
  return 'subscribed';
}

/** Stop notifications on this browser and tell the server to forget it. */
export async function unsubscribeFromWebPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {});
  await api.post('/notifications/push/unregister', { token: endpoint }).catch(() => {});
}

/**
 * Sign-out on this device: drop the browser subscription so the next user does not get the previous
 * user's notifications. The server removes the dead endpoint the next time it sends to it.
 */
export function forgetWebPushSubscriptionOnSignOut() {
  getCurrentPushSubscription()
    .then((subscription) => subscription?.unsubscribe())
    .catch(() => {});
}
