const express = require('express');
const {
  pair,
  getConfig,
  heartbeat,
  registerCamera,
  uploadSnapshot,
  ingest,
  clipUploadTarget,
  uploadClip,
} = require('../controllers/watchAgentController');
const { requireWatchDevice } = require('../middleware/watchDeviceAuth');
const { authLimiter } = require('../middleware/rateLimiter');
const { watchClipUploader, checkStorageLimit } = require('../middleware/upload');

/**
 * ABS Watch agent API. Pairing is public (rate-limited, one-time code); everything else
 * authenticates with the device key and is scoped to that device's workspace + shop.
 */
const router = express.Router();

router.post('/pair', authLimiter, pair);

router.use(requireWatchDevice);

router.get('/config', getConfig);
router.post('/heartbeat', heartbeat);
router.post('/cameras', registerCamera);
router.post('/cameras/:id/snapshot', uploadSnapshot);
router.post('/events', ingest);
router.post('/clips/upload-url', clipUploadTarget);
router.post(
  '/clips',
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
  uploadClip
);

module.exports = router;
