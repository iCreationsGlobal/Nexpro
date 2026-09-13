const {
  getRentalRevenueReport,
  getLateReturnsReport,
  getUtilizationReport,
  getDamageTrendsReport,
  getRentalReportsOverview,
  getRentalSmartReport: buildRentalSmartReport,
} = require('../services/rentalReportService');

const parseQueryDates = (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      message: 'startDate and endDate query parameters are required',
    });
    return null;
  }
  return { startDate, endDate, groupBy: req.query.groupBy || 'day' };
};

/**
 * @route GET /api/reports/rental/overview
 */
exports.getRentalReportsOverview = async (req, res, next) => {
  try {
    const params = parseQueryDates(req, res);
    if (!params) return;

    const data = await getRentalReportsOverview(req, params);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * @route GET /api/reports/rental/revenue
 */
exports.getRentalRevenueReport = async (req, res, next) => {
  try {
    const params = parseQueryDates(req, res);
    if (!params) return;

    const data = await getRentalRevenueReport(req, params.startDate, params.endDate, params.groupBy);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * @route GET /api/reports/rental/late-returns
 */
exports.getLateReturnsReport = async (req, res, next) => {
  try {
    const params = parseQueryDates(req, res);
    if (!params) return;

    const data = await getLateReturnsReport(req, params.startDate, params.endDate);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * @route GET /api/reports/rental/utilization
 */
exports.getUtilizationReport = async (req, res, next) => {
  try {
    const params = parseQueryDates(req, res);
    if (!params) return;

    const data = await getUtilizationReport(req, params.startDate, params.endDate);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * @route GET /api/reports/rental/damage-trends
 */
exports.getDamageTrendsReport = async (req, res, next) => {
  try {
    const params = parseQueryDates(req, res);
    if (!params) return;

    const data = await getDamageTrendsReport(
      req,
      params.startDate,
      params.endDate,
      req.query.groupBy || 'month'
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/**
 * @route GET /api/reports/rental/smart-report
 */
exports.getRentalSmartReport = async (req, res, next) => {
  try {
    const params = parseQueryDates(req, res);
    if (!params) return;

    const data = await buildRentalSmartReport(req, params);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};
