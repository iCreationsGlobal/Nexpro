const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const service = require('../services/absPartnerPortalService');
const action = fn => async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await fn(req)
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode).json({
      success: false,
      message: error.message
    });else next(error);
  }
};
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});
router.post('/login', authLimit, action(req => service.login(req.body)));
router.post('/accept-invitation', authLimit, action(req => service.accept(req.body)));
router.use(async (req, res, next) => {
  try {
    const {
      account,
      agent
    } = await service.authenticate((req.headers.authorization || '').replace(/^Bearer /, ''));
    req.partnerAccount = account;
    req.partnerAgent = agent;
    next();
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode).json({
      success: false,
      message: error.message
    });else next(error);
  }
});
router.get('/overview', action(req => service.overview(req.partnerAccount, req.partnerAgent)));
router.put('/payout-details', action(req => service.savePayoutDetails(req.partnerAccount, req.body)));
router.post('/records', action(req => service.createRecord(req.partnerAccount, req.body)));
router.patch('/records/:id', action(req => service.updateRecord(req.partnerAccount, req.params.id, req.body)));
router.post('/logout', action(async req => {
  await req.partnerAccount.increment('tokenVersion');
  return {
    loggedOut: true
  };
}));
module.exports = router;
