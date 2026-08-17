/** Keep in sync with Backend/utils/profilePictureResponse.js (~200k). */
export const MAX_INLINE_IMAGE_DATA_URL_LENGTH = 200_000;

/**
 * Remove oversized JSON string values that start with data: before JSON.parse.
 * Login, /auth/me, and product lists historically embed multi-MB base64 images;
 * parsing those on a physical phone OOMs Profile and Products (simulator has more RAM).
 *
 * @param {string} raw
 * @returns {string}
 */
export function stripOversizedInlineDataUrlsFromJsonText(raw: string): string {
  if (typeof raw !== 'string' || raw.length < MAX_INLINE_IMAGE_DATA_URL_LENGTH) {
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

    const valueLength = end - valueStart;
    if (valueLength > MAX_INLINE_IMAGE_DATA_URL_LENGTH) {
      out += '"';
      cursor = end + 1;
    } else {
      out += raw.slice(valueStart, end + 1);
      cursor = end + 1;
    }
  }

  return out;
}

/**
 * Axios transformResponse helper: parse JSON after dropping oversized data URLs.
 * @param {unknown} raw
 * @returns {unknown}
 */
export function parseJsonStrippingOversizedInlineDataUrls(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const cleaned = stripOversizedInlineDataUrlsFromJsonText(raw);
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
