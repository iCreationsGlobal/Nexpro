const { getMessagingUsage } = require('../services/adminMessagingUsageService');

/**
 * GET /api/admin/messaging/usage
 * Platform SMS quota per tenant; optional SMS provider balance.
 */
exports.getAdminMessagingUsage = async (req, res, next) => {
  try {
    const data = await getMessagingUsage(
      {
        yearMonth: req.query.yearMonth,
        from: req.query.from,
        to: req.query.to,
        includeBalance: req.query.includeBalance,
      },
      {
        userId: req.user?.id,
        requestId: req.requestId || req.id,
      }
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
