const express = require('express');
const {
  ingestWatchEvents,
  processWatchDemoClip,
  reconcileWatch,
  getWatchSummary,
  listWatchIncidents,
  reviewWatchIncident,
  listWatchEvents,
  listWatchCameras,
  upsertWatchCamera,
  uploadWatchClip,
  attachWatchIncidentClip,
  processWatchUploadedClip,
  getWatchClipDetections,
} = require('../controllers/watchController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { requireFeature } = require('../middleware/featureAccess');
const { watchClipUploader, checkStorageLimit } = require('../middleware/upload');
const { extendWatchYoloTimeout } = require('../middleware/watchYoloTimeout');

const router = express.Router();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);
router.use(requireFeature('watch'));

router.get('/summary', getWatchSummary);
router.get('/incidents', listWatchIncidents);
router.patch('/incidents/:id/review', authorize('admin', 'manager'), reviewWatchIncident);
router.patch('/incidents/:id/clip', authorize('admin', 'manager'), attachWatchIncidentClip);
router.get('/clips/detections', getWatchClipDetections);
router.post('/clips/process', authorize('admin', 'manager'), extendWatchYoloTimeout, processWatchUploadedClip);
router.post(
  '/clips',
  authorize('admin', 'manager'),
  checkStorageLimit,
  (req, res, next) => {
    watchClipUploader.single('file')(req, res, (err) => {
      if (!err) return next();
      const error = err.code === 'LIMIT_FILE_SIZE'
        ? 'Clip is too large. Use a short clip up to 30 MB.'
        : (err.message || 'Failed to upload clip');
      return res.status(400).json({ success: false, error });
    });
  },
  uploadWatchClip
);
router.get('/events', listWatchEvents);
router.post('/events', authorize('admin', 'manager', 'staff'), ingestWatchEvents);
router.post('/demo-clip', authorize('admin', 'manager'), extendWatchYoloTimeout, processWatchDemoClip);
router.post('/reconcile', authorize('admin', 'manager'), reconcileWatch);
router.get('/cameras', listWatchCameras);
router.post('/cameras', authorize('admin', 'manager'), upsertWatchCamera);
router.put('/cameras/:id', authorize('admin', 'manager'), upsertWatchCamera);

module.exports = router;
