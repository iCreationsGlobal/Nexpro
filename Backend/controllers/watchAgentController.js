const {
  findDeviceCamera,
  getAgentConfig,
  pairDevice,
  recordHeartbeat,
  registerAgentCamera,
  saveCameraSnapshot,
} = require('../services/watchDeviceService');
const { ingestEvents } = require('../services/watchReconciliationService');
const { createClipUpload } = require('../services/watchClipStorage');
const { saveWatchClip } = require('../services/watchClipService');

/**
 * Endpoints the ABS Watch agent calls. Everything but /pair runs as the paired device
 * (middleware/watchDeviceAuth.js), scoped to its workspace and shop.
 */

const sendResult = (res, result, okStatus = 200) => {
  if (!result.success) {
    return res.status(result.status || 400).json({ success: false, error: result.error });
  }
  return res.status(result.status || okStatus).json({ success: true, data: result.data });
};

const handle = (label, fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (error) {
    console.error(`Watch agent ${label} failed:`, error);
    return res.status(500).json({ success: false, error: `Failed to ${label}` });
  }
};

/** POST /api/watch-agent/pair — public; exchanges a one-time code for a device key. */
exports.pair = handle('pair device', async (req, res) => {
  const { code, agentVersion, platform } = req.body || {};
  return sendResult(res, await pairDevice({ code, agentVersion, platform }), 201);
});

/** GET /api/watch-agent/config */
exports.getConfig = handle('load config', async (req, res) => sendResult(res, await getAgentConfig(req.watchDevice)));

/** POST /api/watch-agent/heartbeat */
exports.heartbeat = handle('record heartbeat', async (req, res) => {
  const { agentVersion, platform, cameras } = req.body || {};
  return sendResult(res, await recordHeartbeat({ device: req.watchDevice, agentVersion, platform, cameras }));
});

/** POST /api/watch-agent/cameras */
exports.registerCamera = handle('register camera', async (req, res) => {
  const { localId, name, role } = req.body || {};
  return sendResult(res, await registerAgentCamera({ device: req.watchDevice, localId, name, role }));
});

/** POST /api/watch-agent/cameras/:id/snapshot — { image: base64 JPEG, capturedAt } */
exports.uploadSnapshot = handle('save snapshot', async (req, res) => {
  const { image, capturedAt } = req.body || {};
  return sendResult(res, await saveCameraSnapshot({
    device: req.watchDevice,
    cameraId: req.params.id,
    imageBase64: image,
    capturedAt,
  }));
});

/** POST /api/watch-agent/events — { cameraId, events, matchWindowMinutes, clipReference } */
exports.ingest = handle('ingest events', async (req, res) => {
  const { cameraId, events, matchWindowMinutes, clipReference } = req.body || {};
  const camera = cameraId ? await findDeviceCamera(req.watchDevice, cameraId) : null;
  if (cameraId && !camera) {
    return res.status(404).json({ success: false, error: 'Camera not found for this Watch device' });
  }
  // Events can only be filed against this device's own camera
  const scoped = (Array.isArray(events) ? events : []).map((event) => ({
    ...(event && typeof event === 'object' ? event : {}),
    cameraId: camera ? camera.id : null,
    camera_id: undefined,
  }));
  const result = await ingestEvents({
    tenantId: req.tenantId,
    shopId: req.shopId,
    events: scoped,
    matchWindowMinutes,
    clipReference,
  });
  return sendResult(res, result, 201);
});

/** POST /api/watch-agent/clips/upload-url — where to send an incident clip */
exports.clipUploadTarget = handle('prepare clip upload', async (req, res) => {
  const { cameraId, contentType, sizeBytes } = req.body || {};
  if (cameraId && !(await findDeviceCamera(req.watchDevice, cameraId))) {
    return res.status(404).json({ success: false, error: 'Camera not found for this Watch device' });
  }
  const target = await createClipUpload({ tenantId: req.tenantId, cameraId, contentType, sizeBytes });
  if (target.error) return res.status(400).json({ success: false, error: target.error });
  if (target.mode === 'direct') target.uploadPath = '/api/watch-agent/clips';
  return res.json({ success: true, data: target });
});

/** POST /api/watch-agent/clips — direct upload on servers with a disk (self-hosted / local) */
exports.uploadClip = handle('upload clip', async (req, res) => {
  const result = await saveWatchClip({ tenantId: req.tenantId, file: req.file });
  return sendResult(res, result, 201);
});
