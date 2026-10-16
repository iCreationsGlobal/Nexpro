/** Where the ABS Watch agent sends data unless told otherwise (vision-edge/abs_vision/agent/config.py). */
export const WATCH_AGENT_DEFAULT_API = 'https://api.africanbusinesssuite.com';

/** Below this many analysed frames a second, the shop computer is struggling to keep up. */
export const SLOW_DETECTION_FPS = 2;

export const WATCH_AGENT_CAMERA_COMMAND =
  'python3 abs_watch_agent.py camera add --name Counter --role counter --source camera:0';
export const WATCH_AGENT_RUN_COMMAND = 'python3 abs_watch_agent.py run';

export const WATCH_CAMERA_ROLE_LABELS = {
  counter: 'Counter',
  entrance: 'Entrance',
  floor: 'Shop floor',
  exit: 'Exit',
};

/**
 * The API the agent should use: the one this page talks to. Behind the Vite dev proxy the API
 * base is '' and /api is served from the page's own origin.
 * @param {string} apiBase
 * @param {string} origin
 * @returns {string}
 */
export const watchAgentApiBase = (apiBase, origin) =>
  (String(apiBase || '').trim() || String(origin || '').trim()).replace(/\/+$/, '');

/**
 * @param {string} code pairing code, e.g. K7P2-9QXM
 * @param {string} apiBase
 * @returns {string}
 */
export const buildPairCommand = (code, apiBase) => {
  const api = apiBase && apiBase !== WATCH_AGENT_DEFAULT_API ? ` --api ${apiBase}` : '';
  return `python3 abs_watch_agent.py pair ${code}${api}`;
};

/**
 * @param {string|null|undefined} iso
 * @param {number} now
 * @returns {string}
 */
export const formatLastSeen = (iso, now = Date.now()) => {
  const time = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(time)) return 'Never connected';
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 2) return 'Last seen just now';
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Last seen ${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `Last seen ${Math.round(hours / 24)} days ago`;
};

/**
 * @param {{ status?: string, online?: boolean, lastSeenAt?: string|null, pairingExpiresAt?: string|null }} device
 * @param {number} now
 * @returns {{ tone: 'success'|'warning'|'danger'|'muted', label: string, detail: string }}
 */
export const describeDevice = (device = {}, now = Date.now()) => {
  if (device.status === 'pending') {
    const expires = device.pairingExpiresAt ? new Date(device.pairingExpiresAt).getTime() : NaN;
    const minutes = Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - now) / 60000)) : null;
    return {
      tone: 'muted',
      label: 'Waiting to pair',
      detail: minutes == null ? '' : `Pairing code expires in ${minutes} min`,
    };
  }
  if (device.online) {
    return { tone: 'success', label: 'Online', detail: formatLastSeen(device.lastSeenAt, now) };
  }
  return { tone: 'danger', label: 'Offline', detail: formatLastSeen(device.lastSeenAt, now) };
};

/**
 * @param {{ online?: boolean, fps?: number|null, detectFps?: number|null, error?: string|null }|null} health
 * @param {{ deviceOnline?: boolean, isActive?: boolean }} context
 * @returns {{ tone: 'success'|'warning'|'danger'|'muted', label: string, detail: string }}
 */
export const describeCameraHealth = (health, { deviceOnline = false, isActive = true } = {}) => {
  if (!isActive) {
    return { tone: 'muted', label: 'Off', detail: 'Switched off in ABS. Its Watch device ignores it.' };
  }
  if (!deviceOnline) {
    return { tone: 'muted', label: 'Unknown', detail: 'Its Watch device is offline.' };
  }
  if (!health) {
    return { tone: 'muted', label: 'Starting', detail: 'Waiting for the first report from the Watch device.' };
  }
  if (!health.online && !health.error && !health.lastFrameAt) {
    return { tone: 'muted', label: 'Starting', detail: 'Connecting to the camera.' };
  }
  if (!health.online) {
    return { tone: 'danger', label: 'No video', detail: health.error || 'The Watch device can’t read this camera.' };
  }
  const detectFps = Number(health.detectFps);
  if (health.detectFps != null && Number.isFinite(detectFps) && detectFps > 0 && detectFps < SLOW_DETECTION_FPS) {
    return {
      tone: 'warning',
      label: 'Slow',
      detail: `Analysing ${detectFps} frame${detectFps === 1 ? '' : 's'} a second. The computer may be too slow; close other apps or watch fewer cameras.`,
    };
  }
  if (health.error) return { tone: 'warning', label: 'Live', detail: health.error };
  const fps = Number(health.fps);
  return {
    tone: 'success',
    label: 'Live',
    detail: health.fps != null && Number.isFinite(fps) && fps > 0 ? `${Math.round(fps)} fps from the camera` : '',
  };
};

/**
 * Latest health report for each camera, from the devices list.
 * @param {object[]} devices
 * @returns {Map<string, object>}
 */
export const cameraHealthById = (devices = []) => {
  const byId = new Map();
  devices.forEach((device) => {
    (Array.isArray(device?.cameras) ? device.cameras : []).forEach((health) => {
      if (health?.cameraId) byId.set(health.cameraId, health);
    });
  });
  return byId;
};
