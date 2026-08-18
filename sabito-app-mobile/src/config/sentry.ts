/** Sentry stub — optional; enable later with a real DSN. */
export const initSentry = (): void => {};

export const setSentryUser = (_user?: unknown): void => {};

export const clearSentryUser = (): void => {};

/**
 * No-op capture for ErrorBoundary and callers when Sentry is not wired.
 * Logs in __DEV__ so crashes remain visible without throwing a secondary error.
 */
export const captureException = (
  error: Error | string,
  context: Record<string, unknown> = {}
): void => {
  if (__DEV__) {
    console.warn('[Sentry stub] captureException', error, context);
  }
};

export const captureMessage = (
  message: string,
  _level: string = 'info',
  context: Record<string, unknown> = {}
): void => {
  if (__DEV__) {
    console.warn('[Sentry stub] captureMessage', message, context);
  }
};

export default {
  initSentry,
  setSentryUser,
  clearSentryUser,
  captureException,
  captureMessage,
};
