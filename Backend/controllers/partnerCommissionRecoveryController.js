const { timingSafeEqual } = require('crypto');

exports.reconcile = async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: 'Recovery is not configured.' });
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(req.headers.authorization || '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const data = await require('../services/partnerPaymentService').reconcilePayments({ persistent: true });
    res.set('Cache-Control', 'no-store');
    return res.status(data.failed ? 503 : 200).json({ success: !data.failed, data });
  } catch (error) { next(error); }
};
