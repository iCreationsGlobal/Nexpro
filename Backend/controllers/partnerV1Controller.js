const evatService = require('../services/evatService');
const { Sale, Tenant } = require('../models');
const { Op } = require('sequelize');
const { applyTenantFilter } = require('../utils/tenantUtils');

/**
 * @desc    Partner health
 * @route   GET /api/partner/v1/health
 */
exports.health = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'abs-partner-v1',
      tenantId: req.tenantId,
      time: new Date().toISOString(),
    },
  });
};

/**
 * @desc    Opt-in stamp / filing status summary for agency dashboards
 * @route   GET /api/partner/v1/filings/summary?startDate=&endDate=
 */
exports.filingsSummary = async (req, res, next) => {
  try {
    const tax = await require('../utils/taxConfig').getTaxConfigForTenant(req.tenantId);
    const eVat = tax.eVat || {};
    if (!eVat.enabled || !eVat.consentAcceptedAt) {
      return res.status(403).json({
        success: false,
        message: 'Tenant has not enabled e-VAT consent for agency sharing',
        errorCode: 'PARTNER_CONSENT_REQUIRED',
      });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    const sales = await Sale.findAll({
      where: applyTenantFilter(req.tenantId, {
        createdAt: { [Op.between]: [startDate, endDate] },
      }),
      attributes: ['tax', 'total', 'metadata'],
    });

    let outputVat = 0;
    let stamped = 0;
    for (const sale of sales) {
      outputVat += parseFloat(sale.tax) || 0;
      if (sale.metadata?.graStamp?.irn) stamped += 1;
    }

    const tenant = await Tenant.findByPk(req.tenantId, { attributes: ['id', 'name'] });
    const status = await evatService.getEvatStatus(req.tenantId);

    res.status(200).json({
      success: true,
      data: {
        tenant: { id: tenant?.id, name: tenant?.name },
        period: { startDate, endDate },
        outputVat: Math.round(outputVat * 100) / 100,
        saleCount: sales.length,
        stampedCount: stamped,
        evatMode: status.mode,
        readinessComplete: status.readinessComplete,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Referral interest hook for GRA-sourced onboarding
 * @route   POST /api/partner/v1/tenants/register-interest
 */
exports.registerInterest = async (req, res) => {
  const { businessName, contactEmail, tin, notes } = req.body || {};
  // Soft capture — ops can wire CRM later. Always acknowledge.
  console.info('[partner/v1] register-interest', {
    tenantId: req.tenantId,
    businessName,
    contactEmail,
    tin,
    notes: notes ? String(notes).slice(0, 200) : null,
  });
  res.status(202).json({
    success: true,
    message: 'Interest recorded',
    data: { receivedAt: new Date().toISOString() },
  });
};
