const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const VIDEO_ID = /^[\w-]{11}$/;

/**
 * Accept only youtube.com / youtu.be URLs and return a canonical watch URL.
 * @param {string} raw
 * @returns {{ videoId: string, watchUrl: string } | null}
 */
const parseYoutubeUrl = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const host = String(parsed.hostname || '').toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let videoId = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || null;
  } else if (parsed.pathname.startsWith('/shorts/')) {
    videoId = parsed.pathname.split('/').filter(Boolean)[1] || null;
  } else if (parsed.pathname.startsWith('/embed/')) {
    videoId = parsed.pathname.split('/').filter(Boolean)[1] || null;
  } else {
    videoId = parsed.searchParams.get('v');
  }
  if (!videoId || !VIDEO_ID.test(videoId)) return null;
  return {
    videoId,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
};

const clampDemoSeconds = (value, fallback = 20) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(45, Math.max(10, Math.round(parsed)));
};

module.exports = {
  parseYoutubeUrl,
  clampDemoSeconds,
};
