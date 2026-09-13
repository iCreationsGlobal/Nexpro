/**
 * Operator copy for the shop-PC edge runner. ABS does not ingest live video.
 *
 * @param {{ streamUrl?: string, apiOrigin?: string }} [args]
 * @returns {string}
 */
export const buildWatchStreamCommand = ({ streamUrl, apiOrigin } = {}) => {
  const origin = String(apiOrigin || 'http://localhost:5000').replace(/\/+$/, '');
  const stream = String(streamUrl || '').trim() || 'rtsp://CAMERA_IP/stream';
  return [
    'python3 vision-edge/run_stream.py',
    `--stream '${stream}'`,
    '--zones vision-edge/examples/zones.json',
    `--post ${origin}/api/watch/events`,
    '--email YOUR_EMAIL',
    '--password YOUR_PASSWORD',
  ].join(' ');
};
