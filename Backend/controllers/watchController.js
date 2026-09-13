const dayjs = require('dayjs');
const {
  ingestEvents,
  reconcilePeriod,
  reviewIncident,
  getSummary,
  listIncidents,
  listEvents,
  listCameras,
  upsertCamera,
} = require('../services/watchReconciliationService');
const { clampMatchWindowMinutes } = require('../services/watchMatching');
const { processYoutubeClip } = require('../services/watchYoutubeDemoService');
const { saveWatchClip, attachIncidentClip } = require('../services/watchClipService');
const { processUploadedClip, readDetectionsSidecar } = require('../services/watchVisionEdgeService');

const resolveShopId = (req) => req.shopFilterId || req.query.shopId || req.body?.shopId || null;

const parseDayRange = (req) => {
  const date = req.query.date || req.body?.date;
  const startAt = req.query.startAt || req.body?.startAt;
  const endAt = req.query.endAt || req.body?.endAt;
  if (startAt && endAt) {
    return { startAt: new Date(startAt), endAt: new Date(endAt) };
  }
  const day = date ? dayjs(date) : dayjs();
  return {
    startAt: day.startOf('day').toDate(),
    endAt: day.endOf('day').toDate(),
  };
};

/**
 * POST /api/watch/demo-clip
 * Demo: paste a YouTube URL, run local YOLO, ingest events.
 */
exports.processWatchDemoClip = async (req, res) => {
  try {
    if (typeof req.setTimeout === 'function') req.setTimeout(6 * 60 * 1000);
    if (typeof res.setTimeout === 'function') res.setTimeout(6 * 60 * 1000);
    const result = await processYoutubeClip({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      youtubeUrl: req.body?.youtubeUrl || req.body?.url,
      maxSeconds: req.body?.maxSeconds,
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('Watch YouTube demo failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to process YouTube clip' });
  }
};

/**
 * POST /api/watch/events
 */
exports.ingestWatchEvents = async (req, res) => {
  try {
    const result = await ingestEvents({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      events: req.body?.events || [],
      matchWindowMinutes: req.body?.matchWindowMinutes,
      clipReference: req.body?.clipReference || req.body?.clip_reference,
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('Watch ingest failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to ingest watch events' });
  }
};

/**
 * POST /api/watch/reconcile
 */
exports.reconcileWatch = async (req, res) => {
  try {
    const { startAt, endAt } = parseDayRange(req);
    const result = await reconcilePeriod({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      startAt,
      endAt,
      matchWindowMinutes: req.body?.matchWindowMinutes || req.query.matchWindowMinutes,
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.json(result);
  } catch (error) {
    console.error('Watch reconcile failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to reconcile watch activity' });
  }
};

/**
 * GET /api/watch/summary
 */
exports.getWatchSummary = async (req, res) => {
  try {
    const { startAt, endAt } = parseDayRange(req);
    const result = await getSummary({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      startAt,
      endAt,
    });
    return res.json({
      ...result,
      data: {
        ...result.data,
        startAt,
        endAt,
        matchWindowMinutes: clampMatchWindowMinutes(req.query.matchWindowMinutes),
      },
    });
  } catch (error) {
    console.error('Watch summary failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load watch summary' });
  }
};

/**
 * GET /api/watch/incidents
 */
exports.listWatchIncidents = async (req, res) => {
  try {
    const { startAt, endAt } = parseDayRange(req);
    const result = await listIncidents({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      kind: req.query.kind,
      status: req.query.status,
      startAt,
      endAt,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json(result);
  } catch (error) {
    console.error('Watch incidents failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load watch incidents' });
  }
};

/**
 * PATCH /api/watch/incidents/:id/review
 */
exports.reviewWatchIncident = async (req, res) => {
  try {
    const result = await reviewIncident({
      tenantId: req.tenantId,
      incidentId: req.params.id,
      userId: req.user?.id,
      decision: req.body?.decision,
      note: req.body?.note,
    });
    if (!result.success) {
      const status = result.error === 'Incident not found' ? 404 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }
    return res.json(result);
  } catch (error) {
    console.error('Watch review failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to review incident' });
  }
};

/**
 * PATCH /api/watch/incidents/:id/clip
 */
exports.attachWatchIncidentClip = async (req, res) => {
  try {
    const result = await attachIncidentClip({
      tenantId: req.tenantId,
      incidentId: req.params.id,
      clipReference: req.body?.clipReference || req.body?.clip_reference || req.body?.clipUrl,
    });
    if (!result.success) {
      const status = result.error === 'Incident not found' ? 404 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }
    return res.json(result);
  } catch (error) {
    console.error('Watch clip attach failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to attach clip' });
  }
};

/**
 * POST /api/watch/clips/process
 * Run local person detection on a clip already saved under uploads/watch/{tenantId}/.
 */
exports.processWatchUploadedClip = async (req, res) => {
  try {
    if (typeof req.setTimeout === 'function') req.setTimeout(6 * 60 * 1000);
    if (typeof res.setTimeout === 'function') res.setTimeout(6 * 60 * 1000);
    const result = await processUploadedClip({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      clipUrl: req.body?.clipUrl || req.body?.clipReference,
      maxSeconds: req.body?.maxSeconds,
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('Watch uploaded clip process failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to process uploaded clip' });
  }
};

/**
 * GET /api/watch/clips/detections
 * Tenant-owned person boxes for an uploaded Watch clip. 404 when no sidecar.
 */
exports.getWatchClipDetections = async (req, res) => {
  try {
    const clipUrl = req.query.clipUrl || req.query.clipReference;
    if (!clipUrl) {
      return res.status(400).json({ success: false, error: 'clipUrl is required' });
    }
    const result = readDetectionsSidecar({
      tenantId: req.tenantId,
      clipUrl,
    });
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.error });
    }
    return res.json(result);
  } catch (error) {
    console.error('Watch clip detections failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load detection boxes' });
  }
};

/**
 * POST /api/watch/clips
 */
exports.uploadWatchClip = async (req, res) => {
  try {
    const result = await saveWatchClip({
      tenantId: req.tenantId,
      file: req.file,
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('Watch clip upload failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to upload clip' });
  }
};

/**
 * GET /api/watch/events
 */
exports.listWatchEvents = async (req, res) => {
  try {
    const { startAt, endAt } = parseDayRange(req);
    const result = await listEvents({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      startAt,
      endAt,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json(result);
  } catch (error) {
    console.error('Watch events failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load watch events' });
  }
};

/**
 * GET /api/watch/cameras
 */
exports.listWatchCameras = async (req, res) => {
  try {
    const result = await listCameras({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
    });
    return res.json(result);
  } catch (error) {
    console.error('Watch cameras failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to load cameras' });
  }
};

/**
 * POST /api/watch/cameras
 * PUT /api/watch/cameras/:id
 */
exports.upsertWatchCamera = async (req, res) => {
  try {
    const result = await upsertCamera({
      tenantId: req.tenantId,
      shopId: resolveShopId(req),
      cameraId: req.params.id,
      payload: req.body || {},
      userId: req.user?.id,
    });
    if (!result.success) {
      const status = result.error === 'Camera not found' ? 404 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }
    return res.status(req.params.id ? 200 : 201).json(result);
  } catch (error) {
    console.error('Watch camera save failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to save camera' });
  }
};
