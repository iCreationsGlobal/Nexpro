import { parseYoutubeUrl } from './youtubeUrl';

const VIDEO_ID = /^[\w-]{11}$/;
const YOUTUBE_PREFIX = /^youtube:([\w-]{11})$/i;

export const WATCH_CLIP_MAX_MB = 30;
export const WATCH_CLIP_MAX_BYTES = WATCH_CLIP_MAX_MB * 1024 * 1024;
export const WATCH_CLIP_ACCEPT = 'video/mp4,video/webm';

/**
 * True when the value looks like a local path the browser cannot play.
 * Same-origin `/uploads/...` paths are allowed.
 * @param {string} text
 * @returns {boolean}
 */
const isLocalPath = (text) => {
  if (!text) return false;
  if (/^file:/i.test(text)) return true;
  if (/^[a-zA-Z]:[\\/]/.test(text)) return true;
  if (text.startsWith('./') || text.startsWith('../')) return true;
  if (text.includes('\\')) return true;
  if (text.startsWith('/uploads/')) return false;
  if (text.startsWith('/') && !/^https?:\/\//i.test(text)) return true;
  if (text.includes('/') && !/^https?:\/\//i.test(text) && !text.startsWith('/uploads/')) return true;
  return false;
};

/**
 * @param {string} raw
 * @returns {{ type: 'youtube', videoId: string, watchUrl: string } | { type: 'video', url: string } | null}
 */
const parseClipReference = (raw) => {
  const text = String(raw || '').trim();
  if (!text || isLocalPath(text)) return null;

  const prefixed = text.match(YOUTUBE_PREFIX);
  if (prefixed) {
    return {
      type: 'youtube',
      videoId: prefixed[1],
      watchUrl: `https://www.youtube.com/watch?v=${prefixed[1]}`,
    };
  }

  if (VIDEO_ID.test(text)) {
    return {
      type: 'youtube',
      videoId: text,
      watchUrl: `https://www.youtube.com/watch?v=${text}`,
    };
  }

  const fromUrl = parseYoutubeUrl(text);
  if (fromUrl) {
    return {
      type: 'youtube',
      videoId: fromUrl.videoId,
      watchUrl: fromUrl.watchUrl,
    };
  }

  if (/^https?:\/\//i.test(text) || text.startsWith('/uploads/')) {
    return { type: 'video', url: text };
  }

  return null;
};

/**
 * @param {object|string|null|undefined} value
 * @returns {string[]}
 */
const collectCandidates = (value) => {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object') return [];
  return [
    value.clipReference,
    value.event?.clipReference,
    value.metadata?.videoId,
    value.metadata?.watchUrl,
    value.event?.metadata?.videoId,
    value.event?.metadata?.watchUrl,
  ].filter((item) => item != null && String(item).trim() !== '');
};

/**
 * Resolve a playable Watch clip from an incident (or a raw clipReference string).
 * YouTube demo clips use `youtube:{videoId}`. Uploaded snippets use `/uploads/watch/...`.
 *
 * @param {object|string|null|undefined} incidentOrRef - Incident row or clipReference string
 * @returns {{ type: 'youtube', videoId: string, watchUrl: string } | { type: 'video', url: string } | { type: 'none' }}
 * @example
 * parseWatchClipSource({ clipReference: '/uploads/watch/t/1.mp4' })
 * // { type: 'video', url: '/uploads/watch/t/1.mp4' }
 */
export const parseWatchClipSource = (incidentOrRef) => {
  for (const candidate of collectCandidates(incidentOrRef)) {
    const parsed = parseClipReference(candidate);
    if (parsed) return parsed;
  }
  return { type: 'none' };
};
