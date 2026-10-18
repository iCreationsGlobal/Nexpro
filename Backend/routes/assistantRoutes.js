const express = require('express');

const router = express.Router();

// Ask Ayebia was removed from ABS; older native app builds still call this.
router.post('/chat', (req, res) => {
  res.status(410).json({
    success: false,
    code: 'ASSISTANT_REMOVED',
    message: 'Ask Ayebia is no longer available in ABS.',
  });
});

module.exports = router;
