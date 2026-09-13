const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { VisionCamera } = require('../models');
const { baseUploadDir } = require('../middleware/upload');
const { ingestEvents } = require('./watchReconciliationService');
const { sanitizeClipReference } = require('../utils/watchClipReference');
const { clampDemoSeconds } = require('../utils/youtubeUrl');
const { VISITOR_EVENT_TYPES } = require('../config/watchConstants');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'vision-edge', 'process_mp4.py');
const SHOP_ZONES = path.join(REPO_ROOT, 'vision-edge', 'examples', 'zones.json');
const YOUTUBE_ZONES = path.join(REPO_ROOT, 'vision-edge', 'examples', 'zones.youtube.json');
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;
const STDIO_CAP = 32 * 1024;

const appendCapped = (current, chunk) => {
  const next = `${current}${chunk}`;
  return next.length > STDIO_CAP ? next.slice(-STDIO_CAP) : next;
};

const VISITOR_TYPES = new Set(VISITOR_EVENT_TYPES);

/**
 * Unique people in a clip's events, not every person_entered fire.
 * Same YOLO/Re-ID track_id that re-enters after a brief hide still counts once.
 * Events with no track id stay unique by index so they are not dropped.
 *
 * @param {object[]} events
 * @returns {{ visitors: number, counterInteractions: number }}
 */
const summarizeVisionEvents = (events) => {
  const list = Array.isArray(events) ? events : [];
  const visitorKeys = new Set();
  let counterInteractions = 0;
  list.forEach((event, index) => {
    const type = String(event?.eventType || event?.event_type || '');
    if (VISITOR_TYPES.has(type)) {
      const trackId = String(event?.trackId || event?.track_id || '').trim();
      visitorKeys.add(trackId || `anon:${index}`);
    }
    if (type === 'counter_interaction') counterInteractions += 1;
  });
  return { visitors: visitorKeys.size, counterInteractions };
};

/**
 * Run vision-edge/process_mp4.py and write JSON to outputPath.
 * @param {{ extraArgs: string[], outputPath: string }} args
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
const runVisionEdge = ({ extraArgs = [], outputPath } = {}) => new Promise((resolve, reject) => {
  let child;
  try {
    child = spawn(
      process.env.WATCH_PYTHON || 'python3',
      [SCRIPT, ...extraArgs, '--out', outputPath],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch (error) {
    reject(new Error(error.message || 'Failed to start person detection'));
    return;
  }

  let stdout = '';
  let stderr = '';
  const drain = (stream, name) => {
    if (!stream) return;
    stream.on('data', (chunk) => {
      if (name === 'stdout') stdout = appendCapped(stdout, chunk.toString());
      else stderr = appendCapped(stderr, chunk.toString());
    });
    stream.on('error', () => {});
  };
  drain(child.stdout, 'stdout');
  drain(child.stderr, 'stderr');

  const timer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      // child may already have exited
    }
    reject(new Error('Clip processing timed out after 5 minutes'));
  }, PROCESS_TIMEOUT_MS);

  child.on('error', (error) => {
    clearTimeout(timer);
    if (error.code === 'ENOENT') {
      reject(new Error('python3 is not available on this server. Install Python and ultralytics to detect people in clips.'));
      return;
    }
    reject(new Error(error.message || 'Failed to start person detection'));
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    const detail = (stderr || stdout).trim().slice(-800);
    reject(new Error(explainVisionEdgeFailure(detail, code)));
  });
});

/**
 * @param {string} detail
 * @param {number} code
 * @returns {string}
 */
const explainVisionEdgeFailure = (detail, code) => {
  const text = String(detail || '');
  if (/No module named ['"]ultralytics['"]/i.test(text)) {
    return 'ultralytics is not installed. From the repo root run: pip3 install ultralytics';
  }
  if (/No module named ['"]cv2['"]/i.test(text)) {
    return 'OpenCV is not installed. From the repo root run: pip3 install opencv-python-headless';
  }
  if (/ffmpeg/i.test(text) && /not found|not installed/i.test(text)) {
    return 'ffmpeg is not installed. Install ffmpeg to process shop clips.';
  }
  return text || `vision-edge exited with code ${code}`;
};

/**
 * Map `/uploads/watch/{tenantId}/file` to a tenant-scoped disk path.
 *
 * @param {string} clipUrl
 * @param {string} tenantId
 * @returns {{ diskPath?: string, clipUrl?: string, error?: string }}
 */
const resolveUploadedClipPath = (clipUrl, tenantId) => {
  const sanitized = sanitizeClipReference(clipUrl, { tenantId });
  if (!sanitized || !tenantId || !sanitized.startsWith(`/uploads/watch/${tenantId}/`)) {
    return { error: 'Clip must be an uploaded Watch file for this workspace.' };
  }
  const filename = path.basename(sanitized);
  const tenantRoot = path.resolve(baseUploadDir, 'watch', tenantId);
  const diskPath = path.resolve(tenantRoot, filename);
  if (diskPath !== tenantRoot && !diskPath.startsWith(`${tenantRoot}${path.sep}`)) {
    return { error: 'Clip must be an uploaded Watch file for this workspace.' };
  }
  if (!fs.existsSync(diskPath)) {
    return { error: 'Clip file was not found on this server.' };
  }
  return { diskPath, clipUrl: sanitized };
};

/**
 * @param {string} diskPath
 * @returns {string}
 */
const detectionsSidecarPath = (diskPath) => {
  const parsed = path.parse(diskPath);
  return path.join(parsed.dir, `${parsed.name}.detections.json`);
};

/**
 * Keep overlay fields only (no images).
 * @param {object[]} frames
 * @returns {object[]}
 */
const compactDetectionFrames = (frames) => (Array.isArray(frames) ? frames : []).map((frame) => ({
  t: Number(frame?.t) || 0,
  detections: (Array.isArray(frame?.detections) ? frame.detections : [])
    .map((detection) => {
      const trackId = detection?.track_id ?? detection?.trackId ?? detection?.id;
      const bbox = detection?.bbox || detection?.box;
      if (trackId == null || trackId === '' || !Array.isArray(bbox) || bbox.length < 4) return null;
      return {
        track_id: String(trackId),
        bbox: bbox.slice(0, 4).map((value) => Number(value)),
        confidence: Number(detection.confidence) || 0,
      };
    })
    .filter(Boolean),
}));

/**
 * Write `{stem}.detections.json` next to the uploaded MP4.
 *
 * @param {string} diskPath
 * @param {{ fps?: number, frames?: object[] }} payload
 * @returns {string|null}
 */
const persistDetectionsSidecar = (diskPath, payload = {}) => {
  if (!diskPath) return null;
  const frames = compactDetectionFrames(payload.frames || []);
  const dest = detectionsSidecarPath(diskPath);
  try {
    fs.writeFileSync(dest, JSON.stringify({
      fps: Number(payload.fps) || 5,
      frames,
    }));
    return dest;
  } catch (error) {
    console.error('Watch detections sidecar write failed:', error.message);
    return null;
  }
};

/**
 * Stamp uploaded clip URL onto events so Review can play the same file.
 *
 * @param {object[]} events
 * @param {{ clipUrl: string, maxSeconds: number }} source
 * @returns {object[]}
 */
const stampUploadedClipOnEvents = (events, { clipUrl, maxSeconds } = {}) => {
  if (!Array.isArray(events) || !clipUrl) return [];
  return events.map((event) => ({
    ...event,
    clipReference: clipUrl,
    metadata: {
      ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
      clipUrl,
      maxSeconds,
      source: 'uploaded_clip',
    },
  }));
};

/**
 * @param {{ tenantId: string, shopId?: string|null }} args
 * @returns {Promise<{ zonesPath: string, cleanupPath?: string }>}
 */
const resolveShopZonesPath = async ({ tenantId, shopId = null } = {}) => {
  if (!tenantId) return { zonesPath: SHOP_ZONES };
  const where = { tenantId, isActive: true };
  if (shopId) where.shopId = shopId;
  const cameras = await VisionCamera.findAll({
    where,
    order: [['createdAt', 'ASC']],
    attributes: ['name', 'role', 'zones'],
  });
  const counter = (cameras || []).find((camera) => {
    const zones = Array.isArray(camera.zones) ? camera.zones : [];
    return camera.role === 'counter' && zones.some((zone) => zone && zone.type === 'counter');
  });
  if (!counter) return { zonesPath: SHOP_ZONES };

  const zonesPath = path.join(os.tmpdir(), `watch-zones-${tenantId}-${Date.now()}.json`);
  fs.writeFileSync(zonesPath, JSON.stringify({
    camera: counter.name || 'counter',
    zones: counter.zones,
  }, null, 2));
  return { zonesPath, cleanupPath: zonesPath };
};

/**
 * Run local YOLO on a saved Watch upload, then ingest person / counter events.
 *
 * @param {{ tenantId: string, shopId?: string|null, clipUrl: string, maxSeconds?: number }} args
 */
const processUploadedClip = async ({
  tenantId,
  shopId = null,
  clipUrl,
  maxSeconds,
} = {}) => {
  if (!tenantId) {
    return { success: false, error: 'tenantId is required' };
  }
  if (!fs.existsSync(SCRIPT) || !fs.existsSync(SHOP_ZONES)) {
    return { success: false, error: 'vision-edge is not available on this server.' };
  }

  const resolved = resolveUploadedClipPath(clipUrl, tenantId);
  if (resolved.error) {
    return { success: false, error: resolved.error };
  }

  const seconds = clampDemoSeconds(maxSeconds, 30);
  const startTime = new Date().toISOString();
  const outputPath = path.join(os.tmpdir(), `watch-upload-${tenantId}-${Date.now()}.json`);
  let zonesCleanup = null;

  try {
    const zones = await resolveShopZonesPath({ tenantId, shopId });
    zonesCleanup = zones.cleanupPath || null;
    await runVisionEdge({
      extraArgs: [
        '--video',
        resolved.diskPath,
        '--yolo',
        '--zones',
        zones.zonesPath,
        '--max-seconds',
        String(seconds),
        '--sample-fps',
        '10',
        '--dwell-seconds',
        '6',
        '--start-time',
        startTime,
      ],
      outputPath,
    });

    const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    persistDetectionsSidecar(resolved.diskPath, payload);
    const events = stampUploadedClipOnEvents(payload.events || [], {
      clipUrl: resolved.clipUrl,
      maxSeconds: seconds,
    });
    const counts = summarizeVisionEvents(events);
    if (!events.length) {
      return {
        success: true,
        data: {
          clipUrl: resolved.clipUrl,
          maxSeconds: seconds,
          eventCount: 0,
          visitors: 0,
          counterInteractions: 0,
          received: 0,
          created: 0,
          skipped: 0,
          reconciliation: null,
        },
      };
    }

    const ingested = await ingestEvents({
      tenantId,
      shopId,
      events,
      clipReference: resolved.clipUrl,
    });
    if (!ingested.success) {
      return ingested;
    }

    return {
      success: true,
      data: {
        clipUrl: resolved.clipUrl,
        maxSeconds: seconds,
        eventCount: events.length,
        visitors: counts.visitors,
        counterInteractions: counts.counterInteractions,
        ...ingested.data,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to process uploaded clip',
    };
  } finally {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // temp events file may not exist if YOLO failed first
    }
    if (zonesCleanup) {
      try {
        fs.unlinkSync(zonesCleanup);
      } catch {
        // temp zones file
      }
    }
  }
};

/**
 * Read a tenant-owned detections sidecar for Review overlay.
 *
 * @param {{ tenantId: string, clipUrl: string }} args
 */
const readDetectionsSidecar = ({ tenantId, clipUrl } = {}) => {
  const resolved = resolveUploadedClipPath(clipUrl, tenantId);
  if (resolved.error) {
    const notFound = /not found/i.test(resolved.error);
    return { success: false, status: notFound ? 404 : 400, error: resolved.error };
  }
  const sidecarPath = detectionsSidecarPath(resolved.diskPath);
  if (!fs.existsSync(sidecarPath)) {
    return { success: false, status: 404, error: 'Detection boxes are not stored for this clip.' };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    return {
      success: true,
      data: {
        clipUrl: resolved.clipUrl,
        fps: Number(payload.fps) || 5,
        frames: compactDetectionFrames(payload.frames || []),
      },
    };
  } catch {
    return { success: false, status: 404, error: 'Detection boxes are not stored for this clip.' };
  }
};

module.exports = {
  SCRIPT,
  SHOP_ZONES,
  YOUTUBE_ZONES,
  runVisionEdge,
  resolveUploadedClipPath,
  stampUploadedClipOnEvents,
  summarizeVisionEvents,
  processUploadedClip,
  persistDetectionsSidecar,
  readDetectionsSidecar,
  detectionsSidecarPath,
  compactDetectionFrames,
  explainVisionEdgeFailure,
  resolveShopZonesPath,
};
