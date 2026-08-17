const evatService = require('../services/evatService');
const { Sale, Invoice } = require('../models');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { getTaxConfigForTenant, getEffectiveTaxRatePercent } = require('../utils/taxConfig');
const { allocateLevyAmounts } = require('../utils/taxCalculation');

/**
 * @desc    e-VAT connection status + readiness checklist
 * @route   GET /api/evat/status
 */
exports.getEvatStatus = async (req, res, next) => {
  try {
    const status = await evatService.getEvatStatus(req.tenantId);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update e-VAT settings (enable, mode, consent, API key)
 * @route   PUT /api/evat/settings
 */
exports.updateEvatSettings = async (req, res, next) => {
  try {
    const status = await evatService.updateEvatSettings(req.tenantId, req.body || {}, {
      userId: req.user?.id,
    });
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Run sandbox/live test stamp
 * @route   POST /api/evat/test-stamp
 */
exports.testStamp = async (req, res, next) => {
  try {
    const result = await evatService.testStamp(req.tenantId, { userId: req.user?.id });
    res.status(result.success ? 200 : 400).json({
      success: result.success,
      data: result,
      message: result.success ? 'Test stamp succeeded' : result.error,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Stamp an existing sale or invoice by id
 * @route   POST /api/evat/stamp
 * body: { type: 'sale'|'invoice', id: string }
 */
exports.stampExisting = async (req, res, next) => {
  try {
    const { type, id } = req.body || {};
    if (!id || !['sale', 'invoice'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'body.type must be sale or invoice, and body.id is required',
      });
    }

    let doc;
    if (type === 'sale') {
      doc = await Sale.findOne({
        where: applyTenantFilter(req.tenantId, { id }),
        include: ['items'],
      });
      if (!doc) {
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }
      const plain = doc.get({ plain: true });
      plain.documentType = 'sale_receipt';
      plain.items = plain.items || plain.SaleItems || [];
      const stamp = await evatService.stampDocument(req.tenantId, plain);
      const metadata = evatService.mergeGraStampMetadata(plain.metadata || {}, stamp);
      await doc.update({ metadata });
      return res.status(200).json({ success: true, data: { stamp, metadata } });
    }

    doc = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id }),
    });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const plain = doc.get({ plain: true });
    plain.documentType = 'invoice';
    plain.items = Array.isArray(plain.items) ? plain.items : [];
    const stamp = await evatService.stampDocument(req.tenantId, {
      ...plain,
      tax: plain.taxAmount,
    });
    const metadata = evatService.mergeGraStampMetadata(plain.metadata || {}, stamp);
    try {
      await doc.update({ metadata });
    } catch {
      return res.status(200).json({
        success: true,
        data: { stamp, metadata, persisted: false },
        message: 'Stamp created; persist invoice metadata after migration if needed',
      });
    }
    return res.status(200).json({ success: true, data: { stamp, metadata } });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errorCode: error.code,
      });
    }
    next(error);
  }
};

/**
 * Resolve levy amounts for a document from metadata or current tax config.
 * @param {number} taxAmount
 * @param {object} metadata
 * @param {object} taxConfig
 */
function resolveLevies(taxAmount, metadata, taxConfig) {
  const fromMeta = metadata?.taxDetail?.levies;
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta.map((l) => ({
      code: l.code,
      label: l.label,
      ratePercent: parseFloat(l.ratePercent) || 0,
      amount: parseFloat(l.amount) || 0,
    }));
  }
  const rate = getEffectiveTaxRatePercent(taxConfig);
  return allocateLevyAmounts(taxAmount, taxConfig.levies || [], rate);
}

function levyAmountByCode(levies, code) {
  const hit = (levies || []).find((l) => String(l.code || '').toLowerCase() === code);
  return hit ? parseFloat(hit.amount) || 0 : 0;
}

/**
 * @desc    Filing / tax hub summary for a period (VAT collections + stamp coverage)
 * @route   GET /api/evat/filing-summary?startDate=&endDate=
 */
exports.getFilingSummary = async (req, res, next) => {
  try {
    const { Op } = require('sequelize');
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    // Inclusive end-of-day for date-only query params
    const endInclusive = new Date(endDate);
    if (
      endInclusive.getHours() === 0
      && endInclusive.getMinutes() === 0
      && endInclusive.getSeconds() === 0
    ) {
      endInclusive.setHours(23, 59, 59, 999);
    }

    const taxConfig = await getTaxConfigForTenant(req.tenantId);
    const eVatStatus = await evatService.getEvatStatus(req.tenantId);

    const saleWhere = applyTenantFilter(req.tenantId, {
      createdAt: { [Op.between]: [startDate, endInclusive] },
      status: { [Op.notIn]: ['cancelled', 'refunded'] },
    });
    const invoiceWhere = applyTenantFilter(req.tenantId, {
      invoiceDate: { [Op.between]: [startDate, endInclusive] },
      status: { [Op.notIn]: ['draft', 'cancelled'] },
    });

    const [sales, invoices] = await Promise.all([
      Sale.findAll({
        where: saleWhere,
        attributes: ['id', 'saleNumber', 'tax', 'total', 'subtotal', 'metadata', 'createdAt', 'status'],
        order: [['createdAt', 'DESC']],
        limit: 500,
      }),
      Invoice.findAll({
        where: invoiceWhere,
        attributes: [
          'id',
          'invoiceNumber',
          'taxAmount',
          'totalAmount',
          'subtotal',
          'metadata',
          'createdAt',
          'invoiceDate',
          'status',
        ],
        order: [['invoiceDate', 'DESC']],
        limit: 500,
      }),
    ]);

    let outputVat = 0;
    let taxableTotal = 0;
    let stampedCount = 0;
    let unstampedCount = 0;
    let stampedVat = 0;
    const rows = [];

    const activeLevies = (taxConfig.levies || []).filter(
      (l) => l && l.enabled !== false && (parseFloat(l.ratePercent) || 0) > 0
    );
    const nhilRate = activeLevies.find((l) => l.code === 'nhil')?.ratePercent || 0;
    const getfundRate = activeLevies.find((l) => l.code === 'getfund')?.ratePercent || 0;

    for (const sale of sales) {
      const plain = sale.get({ plain: true });
      const tax = parseFloat(plain.tax) || 0;
      const taxable = parseFloat(plain.metadata?.taxDetail?.taxableExclusive ?? plain.subtotal) || 0;
      const levies = resolveLevies(tax, plain.metadata || {}, taxConfig);
      const stamped = Boolean(plain.metadata?.graStamp?.irn);
      outputVat += tax;
      taxableTotal += taxable;
      if (stamped) {
        stampedCount += 1;
        stampedVat += tax;
      } else if (tax > 0) {
        unstampedCount += 1;
      }
      rows.push({
        type: 'sale',
        documentType: 'Sale',
        id: plain.id,
        number: plain.saleNumber,
        date: plain.createdAt,
        taxable,
        tax,
        vat: levyAmountByCode(levies, 'vat') || tax,
        nhil: levyAmountByCode(levies, 'nhil'),
        getfund: levyAmountByCode(levies, 'getfund'),
        covid: levyAmountByCode(levies, 'covid'),
        totalLevy: tax,
        total: parseFloat(plain.total) || 0,
        stamped,
        irn: plain.metadata?.graStamp?.irn || null,
        levies,
        createdAt: plain.createdAt,
      });
    }

    for (const inv of invoices) {
      const plain = inv.get({ plain: true });
      const tax = parseFloat(plain.taxAmount) || 0;
      const taxable = parseFloat(plain.metadata?.taxDetail?.taxableExclusive ?? plain.subtotal) || 0;
      const levies = resolveLevies(tax, plain.metadata || {}, taxConfig);
      const stamped = Boolean(plain.metadata?.graStamp?.irn);
      const isCredit = tax < 0 || taxable < 0 || String(plain.invoiceNumber || '').toUpperCase().includes('CN');
      outputVat += tax;
      taxableTotal += taxable;
      if (stamped) {
        stampedCount += 1;
        stampedVat += tax;
      } else if (tax > 0) {
        unstampedCount += 1;
      }
      rows.push({
        type: 'invoice',
        documentType: isCredit ? 'Credit Note' : 'Invoice',
        id: plain.id,
        number: plain.invoiceNumber,
        date: plain.invoiceDate || plain.createdAt,
        taxable,
        tax,
        vat: levyAmountByCode(levies, 'vat') || tax,
        nhil: levyAmountByCode(levies, 'nhil'),
        getfund: levyAmountByCode(levies, 'getfund'),
        covid: levyAmountByCode(levies, 'covid'),
        totalLevy: tax,
        total: parseFloat(plain.totalAmount) || 0,
        stamped,
        irn: plain.metadata?.graStamp?.irn || null,
        levies,
        createdAt: plain.createdAt,
      });
    }

    rows.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Previous period (same length) for trend
    const periodMs = endInclusive.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    const prevSaleWhere = applyTenantFilter(req.tenantId, {
      createdAt: { [Op.between]: [prevStart, prevEnd] },
      status: { [Op.notIn]: ['cancelled', 'refunded'] },
    });
    const prevInvoiceWhere = applyTenantFilter(req.tenantId, {
      invoiceDate: { [Op.between]: [prevStart, prevEnd] },
      status: { [Op.notIn]: ['draft', 'cancelled'] },
    });
    const [prevSales, prevInvoices] = await Promise.all([
      Sale.findAll({
        where: prevSaleWhere,
        attributes: ['tax'],
      }),
      Invoice.findAll({
        where: prevInvoiceWhere,
        attributes: ['taxAmount'],
      }),
    ]);
    let prevOutputVat = 0;
    for (const s of prevSales) prevOutputVat += parseFloat(s.tax) || 0;
    for (const i of prevInvoices) prevOutputVat += parseFloat(i.taxAmount) || 0;

    const round2 = (n) => Math.round(n * 100) / 100;
    const collectedChangePct =
      prevOutputVat > 0
        ? round2(((stampedVat || outputVat) - prevOutputVat) / prevOutputVat * 100)
        : null;

    // GRA-style heuristic: return due on the 20th of the month after period end
    const due = new Date(endInclusive.getFullYear(), endInclusive.getMonth() + 1, 20);
    const daysLeft = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    res.status(200).json({
      success: true,
      data: {
        period: { startDate, endDate: endInclusive },
        taxEnabled: taxConfig.enabled === true,
        levyRates: {
          vat: activeLevies.find((l) => l.code === 'vat')?.ratePercent
            || getEffectiveTaxRatePercent(taxConfig),
          nhil: nhilRate,
          getfund: getfundRate,
          covid: activeLevies.find((l) => l.code === 'covid')?.ratePercent || 0,
          effective: getEffectiveTaxRatePercent(taxConfig),
        },
        outputVat: round2(outputVat),
        taxableTotal: round2(taxableTotal),
        vatCollected: round2(stampedVat > 0 ? stampedVat : outputVat),
        vatPayable: round2(outputVat),
        previousOutputVat: round2(prevOutputVat),
        collectedChangePct,
        documentCount: rows.length,
        stampedCount,
        unstampedCount,
        nextReturnDue: due.toISOString(),
        daysUntilReturnDue: daysLeft,
        vatConfiguredSince: eVatStatus.consentAcceptedAt || null,
        evat: eVatStatus,
        documents: rows.slice(0, 200),
        disclaimer:
          'Amounts are based on sales and invoices in the period. Confirm with your accountant before submitting to GRA. ABS does not file for you.',
      },
    });
  } catch (error) {
    next(error);
  }
};
