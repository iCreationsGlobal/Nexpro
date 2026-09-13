/**
 * Extract clear, user-friendly error messages from API/network errors
 */

const NETWORK_ERROR_HINT =
  'Cannot reach the API server. Ensure the Backend is running, then check EXPO_PUBLIC_API_URL in mobile/.env.';

const NETWORK_ERROR_HINT_DEV =
  'Cannot reach the API server. On a physical device, localhost will not work — run npm run show-api-url in mobile/, set EXPO_PUBLIC_API_URL to your Mac LAN IP, ensure the Backend is running, then restart Expo (npx expo start -c).';

function isNetworkFailure(err: { message?: string; code?: string }): boolean {
  const message = err.message?.toLowerCase() || '';
  return (
    err.code === 'NETWORK_ERROR' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNABORTED' ||
    message === 'network error' ||
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('econnaborted')
  );
}

export function getNetworkErrorMessage(): string {
  return __DEV__ ? NETWORK_ERROR_HINT_DEV : NETWORK_ERROR_HINT;
}

export function getErrorMessage(
  error: unknown,
  defaultMessage = 'Something went wrong. Please try again.'
): string {
  if (typeof error === 'string') return error;

  const err = error as {
    response?: { data?: { error?: string; message?: string; errors?: string[] | Record<string, unknown> } };
    message?: string;
    code?: string;
  };

  if (err?.response?.data) {
    const data = err.response.data;
    if (data.message) return data.message;
    if (data.error) return data.error;
    if (data.errors && Array.isArray(data.errors)) return data.errors.join(', ');
    if (data.errors && typeof data.errors === 'object') {
      const msgs = Object.values(data.errors)
        .map((e) => (typeof e === 'string' ? e : (e as { message?: string })?.message))
        .filter(Boolean);
      if (msgs.length) return msgs.join(', ');
    }
  }

  if (isNetworkFailure(err)) {
    return getNetworkErrorMessage();
  }

  if (err?.message) {
    return err.message;
  }

  return defaultMessage;
}
