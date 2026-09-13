/** Client wait for local YOLO (upload+detect). Longer than the 30s axios default. */
export const WATCH_PROCESS_TIMEOUT_MS = 300000;

export const WATCH_DETECTION_TIMEOUT_MESSAGE =
  'Detection is taking too long. Try a shorter clip (first 30 seconds) or wait and refresh Watch.';

/**
 * True when axios/proxy aborted a long Watch detect call — not a generic offline outage.
 * @param {unknown} error
 * @returns {boolean}
 */
export const isWatchProcessWaitError = (error) => {
  if (!error || typeof error !== 'object') return false;
  const code = error.code || error.cause?.code;
  if (
    code === 'ECONNABORTED'
    || code === 'ERR_NETWORK'
    || code === 'ERR_CANCELED'
    || code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
  ) {
    return true;
  }
  const message = String(error.message || '');
  if (/timeout/i.test(message)) return true;
  if (message === 'Network Error') return true;
  if (/socket hang up|ECONNRESET|proxy/i.test(message)) return true;
  return false;
};
