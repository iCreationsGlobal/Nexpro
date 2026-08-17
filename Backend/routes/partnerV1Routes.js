const express = require('express');
const { partnerApiAuth } = require('../middleware/partnerApiAuth');
const {
  health,
  filingsSummary,
  registerInterest,
} = require('../controllers/partnerV1Controller');

const router = express.Router();

router.use(partnerApiAuth);

router.get('/health', health);
router.get('/filings/summary', filingsSummary);
router.post('/tenants/register-interest', registerInterest);

module.exports = router;