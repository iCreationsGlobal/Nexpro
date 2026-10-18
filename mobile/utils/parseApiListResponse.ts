/**
 * Extract a list payload from standard ABS API responses:
 * `{ success, data: T[] }` or occasional double-wrapped `{ data: { data: T[] } }`.
 */
export function parseApiListResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];

  if (!response || typeof response !== 'object') return [];

  const top = response as { data?: unknown };
  if (Array.isArray(top.data)) return top.data as T[];

  if (top.data && typeof top.data === 'object') {
    const nested = (top.data as { data?: unknown }).data;
    if (Array.isArray(nested)) return nested as T[];
  }

  return [];
}

/**
 * Read axios/API error message for display.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const err = error as {
    message?: string;
    response?: { data?: { message?: string; error?: string; errorCode?: string; code?: string } };
  };
  return err.response?.data?.message || err.response?.data?.error || err.message || fallback;
}

/**
 * Extract a single entity from standard ABS API responses.
 */
export function parseApiEntity<T>(response: unknown): T | null {
  if (!response || typeof response !== 'object') return null;
  const top = response as { data?: unknown };
  if (top.data && typeof top.data === 'object' && !Array.isArray(top.data)) {
    const nested = top.data as { data?: unknown };
    if (nested.data && typeof nested.data === 'object' && !Array.isArray(nested.data)) {
      return nested.data as T;
    }
    return top.data as T;
  }
  return response as T;
}
