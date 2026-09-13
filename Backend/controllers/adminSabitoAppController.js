const { Op } = require('sequelize');
const { getPagination } = require('../utils/paginationUtils');
const {
  PartnerProgramSettings,
  PartnerCommission,
  PartnerRemittance,
  PartnerCashoutRequest,
  PartnerReferral,
  Marketer,
  Partnership,
  Tenant,
} = require('../models');
const partnerProgramService = require('../services/partnerProgramService');
const partnerRemittanceService = require('../services/partnerRemittanceService');
const partnerCashoutService = require('../services/partnerCashoutService');
const sabitoAppPlatformService = require('../services/sabitoAppPlatformService');

const money = (value) => Number((Number.parseFloat(value || 0) || 0).toFixed(2));

const paginated = (page, limit, count) => ({
  page,
  limit,
  total: count,
  totalPages: Math.ceil(count / limit) || 1,
});

const sendServiceError = (res, error, next) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorCode: error.errorCode,
    });
  }
  return next(error);
};

exports.getSabitoAppOverview = async (req, res, next) => {
  try {
    const [
      pendingReview,
      liveListings,
      rejected,
      suspended,
      marketers,
      activePartnerships,
      owed,
      collected,
      pendingCashouts,
      settings,
    ] = await Promise.all([
      PartnerProgramSettings.count({ where: { moderationStatus: 'pending' } }),
      PartnerProgramSettings.count({ where: partnerProgramService.PUBLIC_LISTING_WHERE }),
      PartnerProgramSettings.count({ where: { moderationStatus: 'rejected' } }),
      PartnerProgramSettings.count({ where: { moderationStatus: 'suspended' } }),
      Marketer.count(),
      Partnership.count({ where: { status: 'active' } }),
      PartnerCommission.findAll({
        where: { remittanceStatus: 'owed' },
        attributes: ['amount', 'platformFeeAmount', 'marketerShareAmount'],
      }),
      PartnerRemittance.findAll({
        where: { status: 'paid' },
        attributes: ['amount', 'platformFeeAmount', 'marketerShareAmount'],
      }),
      PartnerCashoutRequest.count({ where: { status: { [Op.in]: ['pending', 'approved'] } } }),
      sabitoAppPlatformService.getPlatformSettings(),
    ]);

    const owedAmount = money(owed.reduce((sum, row) => sum + money(row.amount), 0));
    const collectedAmount = money(collected.reduce((sum, row) => sum + money(row.amount), 0));
    const platformTake = money(collected.reduce((sum, row) => sum + money(row.platformFeeAmount), 0));

    res.status(200).json({
      success: true,
      data: {
        summary: {
          pendingReview,
          liveListings,
          rejected,
          suspended,
          marketers,
          activePartnerships,
          pendingCashouts,
          owedAmount,
          collectedAmount,
          platformTake,
          platformFeePercent: settings.platformFeePercent,
          currency: 'GHS',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getSabitoAppBusinesses = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const { search, status } = req.query;
    const where = {};
    if (status && status !== 'all') where.moderationStatus = status;
    if (search) {
      const term = `%${String(search).trim()}%`;
      where[Op.or] = [
        { displayName: { [Op.iLike]: term } },
        { slug: { [Op.iLike]: term } },
        { '$tenant.name$': { [Op.iLike]: term } },
      ];
    }

    const { count, rows } = await PartnerProgramSettings.findAndCountAll({
      where,
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'businessType', 'status'],
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    const data = await Promise.all(
      rows.map(async (row) => {
        const plain = row.get({ plain: true });
        const activePartners = await partnerProgramService.countActivePartnerships(plain.tenantId);
        return { ...plain, activePartners };
      })
    );

    res.status(200).json({
      success: true,
      data,
      pagination: paginated(page, limit, count),
    });
  } catch (error) {
    next(error);
  }
};

const moderate = (action) => async (req, res, next) => {
  try {
    const data = await partnerProgramService.moderateListing({
      settingsId: req.params.id,
      action,
      note: req.body?.note || req.body?.moderationNote,
      moderatedBy: req.user?.id,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error, next);
  }
};

exports.approveSabitoAppBusiness = moderate('approve');
exports.rejectSabitoAppBusiness = moderate('reject');
exports.suspendSabitoAppBusiness = moderate('suspend');
exports.unsuspendSabitoAppBusiness = moderate('unsuspend');

exports.getSabitoAppMarketers = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const { search, status } = req.query;
    const where = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      const term = `%${String(search).trim()}%`;
      where[Op.or] = [
        { name: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { phone: { [Op.iLike]: term } },
      ];
    }

    const { count, rows } = await Marketer.findAndCountAll({
      where,
      attributes: ['id', 'name', 'email', 'phone', 'momoNumber', 'isActive', 'lastLoginAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: paginated(page, limit, count),
    });
  } catch (error) {
    next(error);
  }
};

exports.getSabitoAppReferrals = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const { search, status } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      const term = `%${String(search).trim()}%`;
      where[Op.or] = [
        { clientName: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { phone: { [Op.iLike]: term } },
      ];
    }

    const { count, rows } = await PartnerReferral.findAndCountAll({
      where,
      include: [
        { association: 'marketer', attributes: ['id', 'name', 'email'] },
        { association: 'tenant', attributes: ['id', 'name'] },
        { association: 'customer', attributes: ['id', 'name', 'phone'], required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: paginated(page, limit, count),
    });
  } catch (error) {
    next(error);
  }
};

exports.getSabitoAppCollections = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const result = await partnerRemittanceService.listRemittancesAdmin({
      status: req.query.status && req.query.status !== 'all' ? req.query.status : undefined,
      search: req.query.search,
      limit,
      offset,
    });
    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: paginated(page, limit, result.count),
    });
  } catch (error) {
    next(error);
  }
};

exports.recordSabitoAppCollection = async (req, res, next) => {
  try {
    const data = await partnerRemittanceService.createRemittance({
      tenantId: req.body?.tenantId,
      commissionIds: req.body?.commissionIds || req.body?.ids || [],
      paidByUserId: req.body?.paidByUserId || null,
      recordedByUserId: req.user?.id,
      payoutReference: req.body?.payoutReference,
      notes: req.body?.notes || req.body?.paidNote,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error, next);
  }
};

exports.getSabitoAppCashouts = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const result = await partnerCashoutService.listCashoutsAdmin({
      status: req.query.status && req.query.status !== 'all' ? req.query.status : undefined,
      search: req.query.search,
      limit,
      offset,
    });
    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: paginated(page, limit, result.count),
    });
  } catch (error) {
    next(error);
  }
};

exports.paySabitoAppCashout = async (req, res, next) => {
  try {
    const data = await partnerCashoutService.markCashoutPaid({
      cashoutId: req.params.id,
      processedByUserId: req.user?.id,
      notes: req.body?.notes,
      payoutReference: req.body?.payoutReference,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error, next);
  }
};

exports.rejectSabitoAppCashout = async (req, res, next) => {
  try {
    const cashout = await PartnerCashoutRequest.findByPk(req.params.id);
    if (!cashout) {
      return res.status(404).json({ success: false, message: 'Cashout request not found.' });
    }
    const data = await partnerCashoutService.rejectCashout({
      tenantId: cashout.tenantId,
      cashoutId: cashout.id,
      processedByUserId: req.user?.id,
      notes: req.body?.notes,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error, next);
  }
};

exports.getSabitoAppSettings = async (req, res, next) => {
  try {
    const data = await sabitoAppPlatformService.getPlatformSettings();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.updateSabitoAppSettings = async (req, res, next) => {
  try {
    const data = await sabitoAppPlatformService.updatePlatformFeePercent(req.body?.platformFeePercent);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
