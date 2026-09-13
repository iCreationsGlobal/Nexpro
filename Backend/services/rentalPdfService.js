const dayjs = require('dayjs');
const { Rental, RentalItem, Product, Customer, Shop, LateCharge, DamageReport, RentalExtension } = require('../models');
const { resolveDocumentOrganization } = require('../utils/documentOrganizationUtils');
const { getRentalSettings } = require('./rentalSettingsService');
const { getRentalDeposit } = require('./rentalDepositService');
const { computeRentalTotalDue } = require('./rentalInvoiceService');

const RENTAL_DETAIL_INCLUDES = [
  { model: RentalItem, as: 'items', include: [{ model: Product, as: 'product' }] },
  { model: Customer, as: 'customer' },
  {
    model: DamageReport,
    as: 'damageReports',
    include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
  },
  { model: LateCharge, as: 'lateCharges' },
  { model: RentalExtension, as: 'extensions' },
];

const RETURN_INSPECTION_STATUSES = new Set(['returned', 'completed']);
const CANCELLED_STATUS = 'cancelled';

/**
 * @param {string} rentalId
 * @returns {string}
 */
const buildRentalDocumentNumber = (rentalId) => {
  const compact = String(rentalId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return compact ? `RNT-${compact}` : 'RNT';
};

/**
 * @param {object} rental
 * @returns {object}
 */
const serializeRentalForDocument = (rental) => {
  const plain = rental?.get ? rental.get({ plain: true }) : rental;
  if (!plain) return null;

  if (Array.isArray(plain.items)) {
    plain.items = plain.items.map((item) => ({
      ...item,
      rentalRatePerDay: Number(item.rentalRatePerDay || 0),
      subtotal: Number(item.subtotal || 0),
      quantity: Number(item.quantity || 1),
    }));
  }

  if (Array.isArray(plain.lateCharges)) {
    plain.lateCharges = plain.lateCharges.map((charge) => ({
      ...charge,
      chargePerDay: Number(charge.chargePerDay || 0),
      totalCharge: Number(charge.totalCharge || 0),
      daysLate: Number(charge.daysLate || 0),
    }));
  }

  if (Array.isArray(plain.damageReports)) {
    plain.damageReports = plain.damageReports.map((report) => ({
      ...report,
      estimatedRepairCost: Number(report.estimatedRepairCost || 0),
      actualRepairCost: Number(report.actualRepairCost || 0),
    }));
  }

  plain.amount = Number(plain.amount || 0);
  plain.discountAmount = Number(plain.discountAmount || 0);
  plain.amountPaid = Number(plain.amountPaid || 0);
  plain.totalDue = Number(plain.totalDue || 0);

  return plain;
};

/**
 * @param {object} rental
 * @param {object} organization
 * @returns {string}
 */
const resolveAgreementTerms = (rental, organization = {}) => {
  const parts = [];

  const productTerms = (rental?.items || [])
    .map((item) => {
      const terms = item?.product?.metadata?.rentalTerms || item?.metadata?.rentalTerms;
      if (!terms || !String(terms).trim()) return null;
      const label = item?.product?.name || 'Item';
      return `${label}:\n${String(terms).trim()}`;
    })
    .filter(Boolean);

  if (productTerms.length) {
    parts.push(productTerms.join('\n\n'));
  }

  const defaultTerms = String(organization.defaultTermsAndConditions || '').trim();
  if (defaultTerms) {
    parts.push(defaultTerms);
  }

  const rentalNotes = String(rental?.notes || '').trim();
  if (rentalNotes) {
    parts.push(`Rental notes:\n${rentalNotes}`);
  }

  if (!parts.length) {
    return [
      'The renter agrees to return all items in the same condition as received, except for normal wear and tear.',
      'Late returns may incur additional charges as per the rental policy.',
      'The security deposit may be applied against damages, late fees, or outstanding balances.',
    ].join('\n\n');
  }

  return parts.join('\n\n');
};

/**
 * @param {object} rental
 * @returns {object}
 */
const buildRentalFinancials = (rental) => {
  const lateCharges = rental?.lateCharges || [];
  const damageReports = rental?.damageReports || [];
  const deposit = getRentalDeposit(rental);

  const lateChargeTotal = lateCharges.reduce((sum, charge) => {
    const status = charge?.status || 'pending';
    if (status === 'waived' || status === 'cancelled') return sum;
    return sum + Number(charge.totalCharge || 0);
  }, 0);

  const damageTotal = damageReports.reduce(
    (sum, report) => sum + Number(report.actualRepairCost ?? report.estimatedRepairCost ?? 0),
    0
  );

  const totalDue = computeRentalTotalDue(rental, lateCharges, damageReports);
  const amountPaid = Number(rental?.amountPaid || 0);
  const depositApplied = deposit.status === 'applied'
    ? Number(deposit.appliedAmount ?? deposit.paid ?? 0)
    : 0;
  const netBalance = Number(Math.max(0, totalDue - amountPaid - depositApplied).toFixed(2));

  return {
    amount: Number(rental?.amount || 0),
    lateChargeTotal,
    damageTotal,
    discountAmount: Number(rental?.discountAmount || 0),
    totalDue,
    amountPaid,
    balance: Number((totalDue - amountPaid).toFixed(2)),
    depositAmount: deposit.amount,
    depositPaid: deposit.paid,
    depositHeld: deposit.status === 'held' ? deposit.paid : 0,
    depositStatus: deposit.status,
    depositApplied,
    netBalance,
  };
};

/**
 * @param {string} tenantId
 * @param {string} rentalId
 * @returns {Promise<{ rental: object, shop: object|null }>}
 */
const loadRentalDocumentContext = async (tenantId, rentalId) => {
  const rental = await Rental.findOne({
    where: { id: rentalId, tenantId },
    include: RENTAL_DETAIL_INCLUDES,
  });

  if (!rental) {
    const error = new Error('Rental not found');
    error.statusCode = 404;
    throw error;
  }

  let shop = null;
  if (rental.branchId) {
    shop = await Shop.findByPk(rental.branchId);
  }

  return { rental, shop };
};

/**
 * @param {string} tenantId
 * @param {string} rentalId
 * @returns {Promise<object>}
 */
const buildRentalAgreementDocument = async (tenantId, rentalId) => {
  const { rental, shop } = await loadRentalDocumentContext(tenantId, rentalId);
  const serialized = serializeRentalForDocument(rental);

  if (serialized.status === CANCELLED_STATUS) {
    const error = new Error('Agreement is not available for cancelled rentals');
    error.statusCode = 400;
    throw error;
  }

  const [organization, rentalSettings] = await Promise.all([
    resolveDocumentOrganization({ tenantId, shop }),
    getRentalSettings(tenantId),
  ]);

  const handover = serialized.metadata?.handover || null;
  const financials = buildRentalFinancials(serialized);

  return {
    documentType: 'agreement',
    documentTitle: 'Rental Agreement',
    documentNumber: buildRentalDocumentNumber(serialized.id),
    generatedAt: new Date().toISOString(),
    rental: serialized,
    organization,
    rentalSettings,
    terms: resolveAgreementTerms(serialized, organization),
    financials,
    handover,
    customer: serialized.customer || null,
    invoiceId: serialized.metadata?.invoiceId || null,
  };
};

/**
 * @param {string} tenantId
 * @param {string} rentalId
 * @returns {Promise<object>}
 */
const buildRentalReturnInspectionDocument = async (tenantId, rentalId) => {
  const { rental, shop } = await loadRentalDocumentContext(tenantId, rentalId);
  const serialized = serializeRentalForDocument(rental);
  const returnInfo = serialized.metadata?.return || null;
  const hasReturn = Boolean(returnInfo?.returnedAt || serialized.actualReturnDate);

  if (!hasReturn && !RETURN_INSPECTION_STATUSES.has(serialized.status)) {
    const error = new Error('Return inspection document is only available after the rental is returned');
    error.statusCode = 400;
    throw error;
  }

  const [organization, rentalSettings] = await Promise.all([
    resolveDocumentOrganization({ tenantId, shop }),
    getRentalSettings(tenantId),
  ]);

  const financials = buildRentalFinancials(serialized);
  const lateChargesSummary = (serialized.lateCharges || []).map((charge) => ({
    id: charge.id,
    daysLate: charge.daysLate,
    chargePerDay: charge.chargePerDay,
    totalCharge: charge.totalCharge,
    status: charge.status || 'pending',
    waivedReason: charge.metadata?.waiveReason || null,
  }));

  return {
    documentType: 'return_inspection',
    documentTitle: 'Return Inspection Report',
    documentNumber: `${buildRentalDocumentNumber(serialized.id)}-RET`,
    generatedAt: new Date().toISOString(),
    rental: serialized,
    organization,
    rentalSettings,
    financials,
    returnInfo: {
      returnedAt: returnInfo?.returnedAt || serialized.actualReturnDate || null,
      inspectionNotes: returnInfo?.inspectionNotes || '',
      actualReturnDate: serialized.actualReturnDate || null,
      scheduledEndDate: serialized.endDate || null,
      daysLate: returnInfo?.daysLate ?? null,
    },
    lateChargesSummary,
    damageReports: serialized.damageReports || [],
    customer: serialized.customer || null,
    invoiceId: serialized.metadata?.invoiceId || null,
    inspectedOn: returnInfo?.returnedAt
      ? dayjs(returnInfo.returnedAt).format('YYYY-MM-DD')
      : (serialized.actualReturnDate || dayjs().format('YYYY-MM-DD')),
  };
};

module.exports = {
  buildRentalDocumentNumber,
  buildRentalAgreementDocument,
  buildRentalReturnInspectionDocument,
  serializeRentalForDocument,
  buildRentalFinancials,
  resolveAgreementTerms,
};
