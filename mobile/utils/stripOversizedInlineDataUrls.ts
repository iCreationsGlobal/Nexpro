/** Keep in sync with Backend/utils/profilePictureResponse.js (~200k). */
export const MAX_INLINE_IMAGE_DATA_URL_LENGTH = 200_000;

/**
 * Remove inline `data:...` JSON string values before JSON.parse.
 * Physical phones OOM when login, profile, or product list JSON holds even
 * several sub-200KB base64 blobs; simulators tolerate much more RAM.
 *
 * Mobile only ever displays http(s)/file/content URIs — never API inline images.
 *
 * @param raw - Raw HTTP response body
 */
export function stripInlineDataUrlsFromJsonText(raw: string): string {
  if (typeof raw !== 'string' || !raw.includes('"data:')) {
    return raw;
  }

  const marker = '"data:';
  let out = '';
  let cursor = 0;

  while (cursor < raw.length) {
    const start = raw.indexOf(marker, cursor);
    if (start === -1) {
      out += raw.slice(cursor);
      break;
    }

    out += raw.slice(cursor, start + 1);
    const valueStart = start + 1;
    const end = raw.indexOf('"', valueStart);
    if (end === -1) {
      out += raw.slice(valueStart);
      break;
    }

    const value = raw.slice(valueStart, end);
    if (value.startsWith('data:')) {
      // Drop the entire inline payload — keeps parse + React state small on device.
      out += '"';
      cursor = end + 1;
    } else {
      out += raw.slice(valueStart, end + 1);
      cursor = end + 1;
    }
  }

  return out;
}

/** @deprecated Use stripInlineDataUrlsFromJsonText */
export const stripOversizedInlineDataUrlsFromJsonText = stripInlineDataUrlsFromJsonText;

/**
 * Axios transformResponse helper: parse JSON after dropping inline data URLs.
 */
export function parseJsonStrippingOversizedInlineDataUrls(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const cleaned = stripInlineDataUrlsFromJsonText(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}

/**
 * Drop inline avatar / image fields on objects already in JS memory (cache, auth).
 */
export function sanitizeInlineImageField(value: unknown): string | null | undefined {
  if (value == null) return value as null | undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return '';
  if (trimmed.length > MAX_INLINE_IMAGE_DATA_URL_LENGTH) return '';
  return trimmed;
}

/**
 * Sanitize user payloads held in AuthContext / AsyncStorage.
 */
export function sanitizeAuthUserForMobile<T extends { profilePicture?: unknown } | null>(
  user: T
): T {
  if (!user || typeof user !== 'object') return user;
  const picture = sanitizeInlineImageField(user.profilePicture);
  if (picture === user.profilePicture) return user;
  return { ...user, profilePicture: picture ?? '' };
}
