/**
 * File and image URL utilities for consistent display across the mobile app.
 * Matches Frontend/storefront resolveImageUrl: relative /uploads/... → API origin.
 */

import { API_BASE_URL } from '../services/api';
import { MAX_INLINE_IMAGE_DATA_URL_LENGTH } from './stripOversizedInlineDataUrls';

export { MAX_INLINE_IMAGE_DATA_URL_LENGTH } from './stripOversizedInlineDataUrls';

/**
 * Decode HTML entities in URL (e.g. &#x2F; from backend sanitizer) so img src works.
 * @param url - URL that may contain &#x2F; etc.
 * @returns Decoded URL
 */
function decodeUrlEntities(url: string): string {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/');
}

type UrlLike = string | { url?: string | null } | null | undefined;

/**
 * Resolve an image or file URL for display (Image uri, download link, etc.).
 * - data: / blob: / http(s) URLs are returned as-is.
 * - Relative paths (e.g. /uploads/products/...) are prefixed with API_BASE_URL.
 * - Objects with `.url` are unwrapped (storefront parity).
 * - Decodes HTML entities (e.g. &#x2F;) that may come from backend sanitizer.
 * @param url - Raw URL from API (path, data URL, absolute URL, or { url })
 * @returns URL safe for use in Image component
 * @example
 * resolveImageUrl('/uploads/store-listings/t/logo.png')
 * // → 'http://localhost:5001/uploads/store-listings/t/logo.png'
 */
export function resolveImageUrl(url: UrlLike): string {
  if (url == null) return '';
  if (typeof url === 'object') {
    return resolveImageUrl(url.url);
  }
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const decoded = decodeUrlEntities(trimmed);
  if (!decoded) return '';
  if (decoded.startsWith('data:')) return decoded;
  if (decoded.startsWith('blob:')) return decoded;
  if (decoded.startsWith('file:')) return decoded;
  if (decoded.startsWith('content:')) return decoded;
  if (decoded.startsWith('ph://')) return decoded;
  if (decoded.startsWith('assets-library:')) return decoded;
  if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
  const path = decoded.startsWith('/') ? decoded : `/${decoded}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
  }
  return path;
}

/**
 * Resolve an image URL that is safe to pass to Image on device.
 * Oversized inline data URLs are rejected (empty string) so Profile/Account do not OOM.
 * Local file/content/ph URIs and http(s)/relative paths are unaffected.
 * @param url - Raw URL from API or local picker
 * @returns Display URI, or '' when unsafe / empty
 */
export function resolveDisplayImageUrl(url: UrlLike): string {
  if (url == null) return '';
  if (typeof url === 'object') {
    return resolveDisplayImageUrl(url.url);
  }
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const decoded = decodeUrlEntities(trimmed);
  if (!decoded) return '';
  // API inline images OOM physical devices — only show http(s) paths or local picker URIs.
  if (decoded.startsWith('data:')) return '';
  if (decoded.startsWith('file:')) return decoded;
  if (decoded.startsWith('content:')) return decoded;
  if (decoded.startsWith('ph://')) return decoded;
  if (decoded.startsWith('assets-library:')) return decoded;
  if (decoded.startsWith('blob:')) return decoded;
  if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
  const path = decoded.startsWith('/') ? decoded : `/${decoded}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
  }
  return path;
}
