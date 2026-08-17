const {
  Invoice,
  Job,
  Customer,
  JobItem,
  Payment,
  Sale,
  SaleItem,
  Product,
  ProductVariant,
  Barcode,
  Prescription,
  Tenant,
  Setting,
  Quote,
  QuoteItem,
  Shop,
  StudioLocation,
  User,
} = require('../models');
const { Op } = require('sequelize');
const { getPagination } = require('../utils/paginationUtils');
const { createInvoicePaymentJournal, createInvoiceRevenueJournal } = require('../services/invoiceAccountingService');
const { applyTenantFilter, sanitizePayload, findTenantWithOptionalColumns } = require('../utils/tenantUtils');
const { resolvePaymentNotesFromBody } = require('../utils/paymentNoteUtils');
const {
  applyStudioLocationFilter,
  attachStudioLocationToPayload,
} = require('../utils/studioLocationUtils');
const {
  applyScopedFilters,
  attachScopedToPayload,
  assertShopRecordAccess,
} = require('../utils/shopUtils');
const { invalidateInvoiceListCache, invalidateAfterMutation } = require('../middleware/cache');
const activityLogger = require('../services/activityLogger');
const {
  runPaymentReceivedAutomations,
  runReviewRequestAutomations,
  runInvoiceSentAutomations,
  runHighValueInvoiceAutomations,
} = require('../services/automationEngineService');
const { updateCustomerBalance } = require('../services/customerBalanceService');
const { ensureSaleFromPaidInvoice } = require('../services/invoiceSaleService');
const { maybeCreateCommissionForPayment } = require('../services/partnerCommissionService');
const sabitoWebhookService = require('../services/sabitoWebhookService');
const mobileMoneyService = require('../services/mobileMoneyService');
const { getResolvedMtnConfigForTenant } = require('../services/tenantMomoCollectionService');
const { getResolvedHubtelConfigForTenant } = require('../services/tenantHubtelCollectionService');
const { buildPublicPaymentOptions } = require('../services/paymentCollectionRouter');
const { buildInvoicePaymentLink } = require('../utils/frontendUrl');
const { isInvoiceFullyPaid } = require('../utils/jobCreatePayment');
const {
  initiateDirectMoMoCharge,
  checkDirectMoMoStatus,
  buildMobileMoneyRefMeta
} = require('../services/directMoMoChargeService');
const { sequelize } = require('../config/database');
const { getTaxConfigForTenant, getEffectiveTaxRatePercent } = require('../utils/taxConfig');
const { convertLineItemsFromTaxInclusive } = require('../utils/taxCalculation');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const {
  resolveDocumentOrganization,
  organizationToEmailCompany,
} = require('../utils/documentOrganizationUtils');
const {
  resolveSmsDisplayName,
} = require('../utils/smsMessageUtils');
const { resolveBusinessType } = require('../config/businessTypes');
const {
  pickTrimmed,
  getLineItemUnitSymbol,
  resolveDocumentLineItemProductCode,
  enrichDocumentLineItems,
} = require('../utils/documentLineItemUtils');

const branchManagerInclude = () => ({
  model: User,
  as: 'manager',
  attributes: ['id', 'name', 'email'],
  required: false,
});

const invoiceBranchIncludes = () => [
  {
    model: Shop,
    as: 'shop',
    required: false,
    include: [branchManagerInclude()],
  },
  {
    model: StudioLocation,
    as: 'studioLocation',
    required: false,
    include: [branchManagerInclude()],
  },
];

const getEffectiveTenantRole = (req) => req.tenantRole || req.user?.role || null;

/** Throttle workspace invoice Paystack reconcile calls per invoice */
const paystackInvoiceCheckLastById = new Map();
const PAYSTACK_INVOICE_CHECK_THROTTLE_MS = 4000;

const invoiceResponseIncludes = () => [
  {
    model: Customer,
    as: 'customer',
  },
  {
    model: Job,
    as: 'job',
    required: false,
  },
  ...(Sale
    ? [{
        model: Sale,
        as: 'sale',
        required: false,
      }]
    : []),
  ...(Prescription
    ? [{
        model: Prescription,
        as: 'prescription',
        required: false,
      }]
    : []),
  ...invoiceBranchIncludes(),
];

/**
 * @param {import('../models').Invoice} invoice
 * @returns {Promise<object>}
 */
const resolveInvoiceOrganization = async (invoice) => {
  let shop = invoice.shop || null;
  let studioLocation = invoice.studioLocation || null;

  if (!shop && invoice.shopId) {
    shop = await Shop.findByPk(invoice.shopId, { include: [branchManagerInclude()] });
  }
  if (!studioLocation && invoice.studioLocationId) {
    studioLocation = await StudioLocation.findByPk(invoice.studioLocationId, {
      include: [branchManagerInclude()],
    });
  }

  return resolveDocumentOrganization({
    tenantId: invoice.tenantId,
    shop,
    studioLocation,
  });
};

/**
 * @param {import('../models').Invoice} invoice
 * @returns {Promise<{ name: string, logo: string, primaryColor: string }>}
 */
const companyFromInvoice = async (invoice) => {
  const org = await resolveInvoiceOrganization(invoice);
  return organizationToEmailCompany(org);
};

const plainRecord = (record) => (
  typeof record?.get === 'function' ? record.get({ plain: true }) : record
);

const catalogBarcodeInclude = {
  model: Barcode,
  as: 'barcodes',
  attributes: ['id', 'barcode', 'isActive'],
  required: false,
};

const hydrateInvoiceItemProductCodes = async (invoice, items) => {
  if (!Array.isArray(items) || items.length === 0) return items;

  const needsSaleItemFallback = invoice.saleId && items.some((item) => {
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    return !resolveDocumentLineItemProductCode({ item })
      || !getLineItemUnitSymbol(item)
      || !(item?.productId || metadata.productId);
  });

  const saleItems = needsSaleItemFallback
    ? (await SaleItem.findAll({
        where: { saleId: invoice.saleId },
        order: [['createdAt', 'ASC']],
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'sku', 'barcode', 'unit'],
            required: false,
          },
          {
            model: ProductVariant,
            as: 'variant',
            attributes: ['id', 'sku', 'barcode', 'productId'],
            required: false,
          },
        ],
      })).map(plainRecord)
    : [];

  const productIds = new Set();
  const variantIds = new Set();
  items.forEach((item, index) => {
    const saleItem = saleItems[index] || {};
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    if (item?.productId || metadata.productId || saleItem.productId) {
      productIds.add(item.productId || metadata.productId || saleItem.productId);
    }
    if (item?.productVariantId || metadata.productVariantId || saleItem.productVariantId) {
      variantIds.add(item.productVariantId || metadata.productVariantId || saleItem.productVariantId);
    }
  });

  const [products, variants] = await Promise.all([
    productIds.size
      ? Product.findAll({
          where: applyTenantFilter(invoice.tenantId, { id: { [Op.in]: [...productIds] } }),
          attributes: ['id', 'sku', 'barcode', 'unit'],
          include: [catalogBarcodeInclude],
        })
      : [],
    variantIds.size
      ? ProductVariant.findAll({
          where: { id: { [Op.in]: [...variantIds] } },
          attributes: ['id', 'sku', 'barcode', 'productId'],
          include: [catalogBarcodeInclude],
        })
      : [],
  ]);
  const productsById = new Map(products.map((product) => [product.id, plainRecord(product)]));
  const variantsById = new Map(variants.map((variant) => [variant.id, plainRecord(variant)]));

  return enrichDocumentLineItems(items, { productsById, variantsById, saleItems });
};

const invoiceToResponsePayload = async (invoice) => {
  if (!invoice) return null;
  const payload = typeof invoice.toJSON === 'function' ? invoice.toJSON() : { ...invoice };
  payload.items = await hydrateInvoiceItemProductCodes(invoice, payload.items);
  payload.organization = await resolveInvoiceOrganization(invoice);
  return payload;
};

/** List/table payload: skip organization resolution and item code hydration. */
const invoiceToListPayload = (invoice) => {
  if (!invoice) return null;
  return typeof invoice.toJSON === 'function' ? invoice.toJSON() : { ...invoice };
};

const invoiceListIncludes = () => {
  const include = [
    {
      model: Customer,
      as: 'customer',
      attributes: ['id', 'name', 'company', 'email', 'phone'],
    },
    {
      model: Job,
      as: 'job',
      attributes: ['id', 'jobNumber', 'title', 'status'],
      required: false,
    },
  ];

  if (Sale) {
    include.push({
      model: Sale,
      as: 'sale',
      attributes: ['id', 'saleNumber'],
      required: false,
    });
  }

  if (Prescription) {
    include.push({
      model: Prescription,
      as: 'prescription',
      attributes: ['id', 'prescriptionNumber', 'prescriptionDate'],
      required: false,
    });
  }

  return include;
};

const parsePaymentDateInput = (value) => {
  if (value == null || value === '') {
    return new Date();
  }

  const paymentDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(paymentDate.getTime()) ? null : paymentDate;
};

const normalizePaymentReference = (referenceNumber, clientRequestId) => {
  const providedReference = referenceNumber == null ? '' : String(referenceNumber).trim();
  const providedClientRequestId = clientRequestId == null ? '' : String(clientRequestId).trim();
  return (providedReference || providedClientRequestId).slice(0, 255);
};

const findExistingPaymentByReference = async ({ tenantId, referenceNumber }) => {
  if (!referenceNumber) return null;
  return Payment.findOne({
    where: {
      tenantId,
      type: 'income',
      referenceNumber,
      status: 'completed',
    },
  });
};

const loadInvoicePayments = async (invoice) => {
  if (!invoice) return [];
  const orConditions = [];

  if (invoice.id) {
    orConditions.push({ referenceNumber: { [Op.like]: `INV-PAY-${invoice.id}-%` } });
    orConditions.push({ referenceNumber: { [Op.like]: `INV-MARK-PAID-${invoice.id}-%` } });
    orConditions.push({ description: { [Op.like]: `%invoice:${invoice.id}%` } });
  }

  if (invoice.invoiceNumber) {
    orConditions.push({ notes: { [Op.like]: `%${invoice.invoiceNumber}%` } });
  }

  if (invoice.jobId) {
    orConditions.push({ jobId: invoice.jobId });
  }

  if (orConditions.length === 0) return [];

  return Payment.findAll({
    where: {
      tenantId: invoice.tenantId,
      customerId: invoice.customerId,
      type: 'income',
      status: 'completed',
      [Op.or]: orConditions,
    },
    attributes: [
      'id',
      'paymentNumber',
      'amount',
      'paymentMethod',
      'paymentDate',
      'referenceNumber',
      'description',
      'notes',
      'createdAt',
    ],
    order: [['paymentDate', 'DESC'], ['createdAt', 'DESC']],
    limit: 25,
  });
};

const runInvoicePaymentBackgroundTask = (label, task) => {
  setImmediate(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[InvoicePaymentBackground] ${label} failed`, error);
    }
  });
};

const enqueueInvoicePaymentSideEffects = ({
  tenantId,
  userId,
  invoiceId,
  customerId,
  payment,
  paymentAmount,
  paymentDate,
  paymentMethod,
  referenceNumber,
  updatedInvoice,
  wasFullyPaid,
  wasAlreadyPaid,
  markedPaid = false,
}) => {
  runInvoicePaymentBackgroundTask('sale sync', () => ensureSaleFromPaidInvoice(invoiceId, payment?.id || null, {
    tenantId,
    userId,
    paymentMethod,
  }));

  if (paymentAmount > 0 && payment) {
    runInvoicePaymentBackgroundTask('payment journal', () => createInvoicePaymentJournal({
      invoice: updatedInvoice,
      amount: paymentAmount,
      paymentDate,
      paymentMethod,
      referenceNumber,
      paymentRecordNumber: payment.paymentNumber,
      metadata: { paymentId: payment.id, ...(markedPaid ? { markedPaid: true } : {}) },
      userId,
    }));
  }

  runInvoicePaymentBackgroundTask('payment activity', async () => {
    if (paymentAmount > 0 && !markedPaid) {
      await activityLogger.logPaymentReceived(updatedInvoice, paymentAmount, userId);
    }
    if (wasFullyPaid && !wasAlreadyPaid) {
      await activityLogger.logInvoicePaid(updatedInvoice, userId);
    }
  });

  if (wasFullyPaid && !wasAlreadyPaid) {
    runInvoicePaymentBackgroundTask('customer paid confirmation', () => (
      sendInvoicePaidConfirmationToCustomer(tenantId, updatedInvoice)
    ));

    runInvoicePaymentBackgroundTask('Sabito paid webhook', async () => {
      const customer = await Customer.findOne({
        where: applyTenantFilter(tenantId, { id: updatedInvoice.customerId }),
        attributes: [
          'id',
          'sabitoCustomerId',
          'sabitoBusinessId',
          'email',
          'name',
          'phone',
        ],
      });

      if (!customer) return;
      const result = await sabitoWebhookService.sendInvoicePaidWebhook(updatedInvoice, customer, tenantId);
      if (result.success) {
        await updatedInvoice.update({ sabitoSyncedAt: new Date() });
      }
    });
  }

  if (customerId) {
    runInvoicePaymentBackgroundTask('customer balance refresh', () => updateCustomerBalance(customerId));
  }

  if (paymentAmount > 0 && payment) {
    runInvoicePaymentBackgroundTask('payment_received automations', () => runPaymentReceivedAutomations({
      tenantId,
      invoice: updatedInvoice,
      customer: updatedInvoice?.customer || null,
      payment,
      paymentAmount,
      paymentMethod,
      actorUserId: userId,
    }));
  }

  if (wasFullyPaid && !wasAlreadyPaid && !updatedInvoice?.jobId && !updatedInvoice?.saleId && updatedInvoice?.customerId) {
    runInvoicePaymentBackgroundTask('review_request automations', () => runReviewRequestAutomations({
      tenantId,
      sourceType: 'invoice',
      source: updatedInvoice,
      customer: updatedInvoice?.customer || null,
      actorUserId: userId,
    }));
  }
};

const maskEmailForLogs = (email) => {
  if (!email || typeof email !== 'string') return null;
  const [localPart, domainPart] = email.trim().split('@');
  if (!localPart || !domainPart) return 'invalid-email';
  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  const [domainName, ...domainRest] = domainPart.split('.');
  const visibleDomain = domainName ? domainName.slice(0, 1) : '';
  const suffix = domainRest.length ? `.${domainRest.join('.')}` : '';
  return `${visibleLocal}***@${visibleDomain}***${suffix}`;
};

const buildInvoiceDeliveryLogContext = ({
  tenantId,
  userId = null,
  invoice,
  customer,
  prefsSetting,
  forceCustomerChannels = false,
  deliverySource = 'unknown'
}) => {
  const prefValue = prefsSetting?.value?.autoSendInvoiceToCustomer;
  return {
    tenantId,
    userId,
    invoiceId: invoice?.id || null,
    invoiceNumber: invoice?.invoiceNumber || null,
    sourceType: invoice?.sourceType || null,
    saleId: invoice?.saleId || null,
    jobId: invoice?.jobId || null,
    quoteId: invoice?.quoteId || null,
    customerId: customer?.id || invoice?.customerId || null,
    hasCustomer: !!customer,
    hasCustomerEmail: !!customer?.email,
    customerEmail: maskEmailForLogs(customer?.email),
    autoSendInvoiceToCustomer: prefValue !== false,
    autoSendInvoiceToCustomerRaw: typeof prefValue === 'boolean' ? prefValue : null,
    forceCustomerChannels,
    deliverySource
  };
};

const logInvoiceDelivery = (event, context, extra = {}, level = 'log') => {
  const logger = typeof console[level] === 'function' ? console[level] : console.log;
  logger('[InvoiceDelivery]', {
    event,
    ...context,
    ...extra
  });
};

const getInvoiceSourceVisibility = (businessType) => {
  if (businessType === 'studio') return ['job', 'quote', null];
  if (businessType === 'shop') return ['sale', 'quote'];
  if (businessType === 'pharmacy') return ['prescription', 'sale'];
  return ['all'];
};

const summarizeInvoiceListFilters = (req, page, limit, offset) => {
  const businessType = resolveBusinessType(req.tenant?.businessType);
  return {
    tenantId: req.tenantId,
    userId: req.user?.id || null,
    role: getEffectiveTenantRole(req),
    businessType,
    sourceVisibility: getInvoiceSourceVisibility(businessType),
    requestedSourceType: req.query?.sourceType || null,
    status: req.query?.status || null,
    hasSearch: !!req.query?.search,
    customerId: req.query?.customerId || null,
    jobId: req.query?.jobId || null,
    saleId: req.query?.saleId || null,
    prescriptionId: req.query?.prescriptionId || null,
    shopScoped: !!req.shopScoped,
    requestedShopId: req.query?.shopId || req.headers?.['x-shop-id'] || null,
    shopFilterId: req.shopFilterId || null,
    defaultShopId: req.defaultShopId || null,
    canAccessAllShops: !!req.canAccessAllShops,
    studioLocationScoped: !!req.studioLocationScoped,
    requestedStudioLocationId: req.query?.studioLocationId || req.headers?.['x-studio-location-id'] || null,
    studioLocationFilterId: req.studioLocationFilterId || null,
    defaultStudioLocationId: req.defaultStudioLocationId || null,
    canAccessAllStudioLocations: !!req.canAccessAllStudioLocations,
    page,
    limit,
    offset,
  };
};

const logInvoiceListDebug = (event, data) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[InvoiceList]', event, data);
  }
};

// Helper function to generate invoice number
const generateInvoiceNumber = async (tenantId) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  const lastInvoice = await Invoice.findOne({
    where: {
      tenantId,
      invoiceNumber: {
        [Op.like]: `INV-${year}${month}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastInvoice) {
    const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-').pop());
    sequence = lastSequence + 1;
  }

  return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Visibility rules for invoice list and summary stats (must stay in sync).
 * Applies tenant scope, business-type sourceType rules, staff visibility, and active branch (shop/studio).
 *
 * @param {import('express').Request} req
 * @returns {Promise<Object>} Sequelize where clause
 */
const buildInvoiceVisibilityWhere = async (req) => {
  const where = applyTenantFilter(req.tenantId, {});

  const resolved = resolveBusinessType(req.tenant?.businessType);
  if (resolved === 'studio') {
    where[Op.or] = [{ sourceType: 'job' }, { sourceType: 'quote' }, { sourceType: null }];
  } else if (resolved === 'shop') {
    where[Op.or] = [{ sourceType: 'sale' }, { sourceType: 'quote' }];
  } else if (resolved === 'pharmacy') {
    where[Op.or] = [{ sourceType: 'prescription' }, { sourceType: 'sale' }];
  }

  if (getEffectiveTenantRole(req) === 'staff') {
    const ownOr = [];
    if (req.shopScoped) {
      ownOr.push({ saleId: { [Op.ne]: null } });
    } else {
      const mySales = await Sale.findAll({
        where: applyTenantFilter(req.tenantId, { soldBy: req.user.id }),
        attributes: ['id']
      });
      const saleIds = mySales.map((s) => s.id);
      if (saleIds.length) ownOr.push({ saleId: { [Op.in]: saleIds } });
    }

    const myJobs = await Job.findAll({
      where: applyTenantFilter(req.tenantId, { createdBy: req.user.id }),
      attributes: ['id']
    });
    const jobIds = myJobs.map((j) => j.id);
    if (jobIds.length) ownOr.push({ jobId: { [Op.in]: jobIds } });
    if (resolved === 'pharmacy') ownOr.push({ prescriptionId: { [Op.ne]: null } });
    if (ownOr.length) {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({ [Op.or]: ownOr });
    } else {
      where.id = { [Op.in]: [] };
    }
  }

  return applyScopedFilters(req, where);
};

const invoiceWhere = (req, extra = {}) =>
  applyScopedFilters(req, applyTenantFilter(req.tenantId, extra));

const invoiceReadWhere = (req, extra = {}) =>
  applyScopedFilters(req, applyTenantFilter(req.tenantId, extra));

/**
 * Load one invoice using the same visibility rules as the list endpoint.
 * @param {import('express').Request} req
 * @param {string} id
 * @param {Array} [include]
 * @returns {Promise<import('../models').Invoice|null>}
 */
const findVisibleInvoiceById = async (req, id, include = []) => {
  const visibilityWhere = await buildInvoiceVisibilityWhere(req);
  return Invoice.findOne({
    where: { ...visibilityWhere, id },
    include,
  });
};

/**
 * Build SMS template variables for an invoice notification.
 * @param {Object} invoice
 * @param {string} [paymentLink]
 * @returns {Promise<Record<string, string>>}
 */
async function buildInvoiceSmsVariables(invoice, paymentLink = '') {
  const org = await resolveInvoiceOrganization(invoice);
  const customer = invoice.customer || {};
  const invNum = invoice.invoiceNumber || `#${invoice.id}`;
  const total = parseFloat(invoice.totalAmount);
  const amount = Number.isFinite(total) ? `GHS ${total.toFixed(2)}` : '';
  const branchName = resolveSmsDisplayName(org);
  return {
    customerName: customer.name || customer.company || 'Customer',
    businessName: org?.name || branchName,
    branchName,
    invoiceNumber: invNum,
    amount,
    paymentLink: paymentLink || '',
  };
}

/**
 * Render and send invoice SMS for a given template event.
 * @param {string} tenantId
 * @param {string} eventKey
 * @param {Object} invoice
 * @param {string} phone
 * @param {string} [paymentLink]
 */
async function sendInvoiceSmsFromTemplate(tenantId, eventKey, invoice, phone, paymentLink = '') {
  const smsService = require('../services/smsService');
  const smsTemplateService = require('../services/smsTemplateService');
  const smsPhone = smsService.validatePhoneNumber(phone);
  if (!smsPhone) return { success: false };

  const variables = await buildInvoiceSmsVariables(invoice, paymentLink);
  const smsMessage = await smsTemplateService.renderForTenant(tenantId, eventKey, variables);
  if (!smsMessage) return { success: false, error: 'SMS template render failed' };

  return smsService.sendMessage(tenantId, smsPhone, smsMessage);
}

/**
 * Deliver invoice to customer via built-in channels or automation rules (unified path).
 * @param {object} params
 * @returns {Promise<{ emailSent: boolean, smsSent: boolean, emailError: string|null, viaAutomation?: boolean }>}
 */
async function deliverInvoiceToCustomer({
  tenantId,
  updatedInvoice,
  paymentLink,
  userId = null,
  deliverySource = 'internal_invoice_send',
  forceCustomerChannels = false,
  actorUserId = null,
  prefsSetting = null,
  skipPaidReceipt = false,
}) {
  const {
    TEMPLATE_KEYS,
    isCustomerNotificationEffectiveEnabled,
    shouldUseAutomationInsteadOfBuiltIn,
  } = require('../services/customerNotificationBridgeService');
  const { isChannelEnabledForEvent } = require('../services/messageDeliveryRulesService');

  const resolvedPrefs = prefsSetting
    || await Setting.findOne({ where: { tenantId, key: 'customer-notification-preferences' } });
  const prefAllows = resolvedPrefs?.value?.autoSendInvoiceToCustomer !== false;
  const effectiveEnabled = await isCustomerNotificationEffectiveEnabled(tenantId, {
    settingEnabled: forceCustomerChannels || prefAllows,
    templateKey: TEMPLATE_KEYS.INVOICE_SENT,
  });

  const deliveryLogContext = buildInvoiceDeliveryLogContext({
    tenantId,
    userId,
    invoice: updatedInvoice,
    customer: updatedInvoice?.customer,
    prefsSetting: resolvedPrefs,
    forceCustomerChannels,
    deliverySource,
  });

  if (!effectiveEnabled) {
    logInvoiceDelivery('invoice_send_decision', deliveryLogContext, {
      decision: 'skip_customer_channels',
      reason: 'auto_send_disabled',
    });
    logInvoiceDelivery('invoice_email_skipped', deliveryLogContext, {
      reason: 'auto_send_disabled',
    });
    return { emailSent: false, smsSent: false, emailError: 'Auto-send invoice to customer is disabled' };
  }

  if (isInvoiceFullyPaid(updatedInvoice)) {
    logInvoiceDelivery('invoice_send_decision', deliveryLogContext, {
      decision: 'skip_pay_cta',
      reason: 'invoice_already_paid',
    });
    if (skipPaidReceipt) {
      return { emailSent: false, smsSent: false, emailError: null, skippedPaidReceipt: true };
    }
    await sendInvoicePaidConfirmationToCustomer(tenantId, updatedInvoice);
    return { emailSent: false, smsSent: false, emailError: null, paidConfirmation: true };
  }

  const useAutomation = await shouldUseAutomationInsteadOfBuiltIn(tenantId, TEMPLATE_KEYS.INVOICE_SENT);
  logInvoiceDelivery('invoice_send_decision', deliveryLogContext, {
    decision: useAutomation ? 'send_via_automation' : 'send_customer_channels',
    reason: useAutomation ? 'automation_rule_enabled' : (forceCustomerChannels && !prefAllows ? 'forced_customer_channels' : 'auto_send_enabled'),
  });

  if (useAutomation) {
    await runInvoiceSentAutomations({
      tenantId,
      invoice: updatedInvoice,
      customer: updatedInvoice.customer || null,
      paymentLink,
      actorUserId: actorUserId ?? userId ?? null,
    }).catch((err) =>
      console.error('[Invoice] invoice_sent automations failed:', err?.message || err)
    );
    runHighValueInvoiceAutomations({
      tenantId,
      invoice: updatedInvoice,
      customer: updatedInvoice.customer || null,
      actorUserId: actorUserId ?? userId ?? null,
    }).catch((err) =>
      console.error('[Invoice] high_value_invoice automations failed:', err?.message || err)
    );
    return { emailSent: false, smsSent: false, emailError: null, viaAutomation: true };
  }

  let emailSent = false;
  let smsSent = false;
  let emailError = null;

  if (updatedInvoice.customer) {
    try {
      const whatsappAllowed = await isChannelEnabledForEvent(tenantId, 'invoice_sent', 'whatsapp');
      const whatsappService = require('../services/whatsappService');
      const whatsappTemplates = require('../services/whatsappTemplates');
      const config = whatsappAllowed ? await whatsappService.getConfig(tenantId) : null;
      if (config && updatedInvoice.customer.phone) {
        const phoneNumber = whatsappService.validatePhoneNumber(updatedInvoice.customer.phone);
        if (phoneNumber) {
          const parameters = whatsappTemplates.prepareInvoiceNotification(
            updatedInvoice,
            updatedInvoice.customer,
            paymentLink
          );
          await whatsappService.sendMessage(
            tenantId,
            phoneNumber,
            'invoice_notification',
            parameters
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Invoice] deliverInvoiceToCustomer WhatsApp:', e?.message);
    }

    try {
      const emailAllowed = await isChannelEnabledForEvent(tenantId, 'invoice_sent', 'email');
      const emailService = require('../services/emailService');
      const emailTemplates = require('../services/emailTemplates');
      if (emailAllowed && updatedInvoice.customer.email) {
        const company = await companyFromInvoice(updatedInvoice);
        const invoiceForEmail = { ...updatedInvoice.toJSON(), items: updatedInvoice.items || [] };
        const { subject, html, text } = emailTemplates.invoiceNotification(
          invoiceForEmail,
          updatedInvoice.customer,
          paymentLink,
          company
        );
        logInvoiceDelivery('invoice_email_attempt', deliveryLogContext, {
          providerPath: 'emailService.sendMessage',
        });
        const emailResult = await emailService.sendMessage(
          tenantId,
          updatedInvoice.customer.email,
          subject,
          html,
          text
        );
        if (emailResult?.success) {
          emailSent = true;
          logInvoiceDelivery('invoice_email_success', deliveryLogContext, {
            providerPath: 'emailService.sendMessage',
            messageId: emailResult.messageId || null,
          });
        } else {
          emailError = emailResult?.error || 'unknown error';
          logInvoiceDelivery('invoice_email_failed', deliveryLogContext, {
            providerPath: 'emailService.sendMessage',
            error: emailError,
          }, 'warn');
        }
      } else {
        emailError = 'Customer email address not available';
        logInvoiceDelivery('invoice_email_skipped', deliveryLogContext, {
          reason: updatedInvoice.customer ? 'missing_customer_email' : 'missing_customer',
        }, 'warn');
      }
    } catch (e) {
      emailError = e?.message || 'unknown error';
      logInvoiceDelivery('invoice_email_failed', deliveryLogContext, {
        providerPath: 'emailService.sendMessage',
        error: emailError,
      }, 'error');
    }

    try {
      const smsAllowed = await isChannelEnabledForEvent(tenantId, 'invoice_sent', 'sms');
      const smsService = require('../services/smsService');
      const smsConfig = smsAllowed ? await smsService.getResolvedConfig(tenantId) : null;
      if (smsConfig && updatedInvoice.customer.phone) {
        const smsResult = await sendInvoiceSmsFromTemplate(
          tenantId,
          'invoice_sent',
          updatedInvoice,
          updatedInvoice.customer.phone,
          paymentLink
        );
        if (smsResult?.success) {
          smsSent = true;
        }
      }
    } catch (e) {
      console.error('[Invoice] deliverInvoiceToCustomer SMS:', e?.message);
    }
  } else {
    logInvoiceDelivery('invoice_email_skipped', deliveryLogContext, {
      reason: 'missing_customer',
    }, 'warn');
  }

  runHighValueInvoiceAutomations({
    tenantId,
    invoice: updatedInvoice,
    customer: updatedInvoice.customer || null,
    actorUserId: actorUserId ?? userId ?? null,
  }).catch((err) =>
    console.error('[Invoice] high_value_invoice automations failed:', err?.message || err)
  );

  return { emailSent, smsSent, emailError };
}

/**
 * Send invoice paid confirmation to customer (email + optional SMS). Fire-and-forget; errors are logged only.
 * @param {string} tenantId - Tenant ID
 * @param {Object} invoice - Invoice with customer included (totalAmount, invoiceNumber, amountPaid, paidDate)
 */
async function sendInvoicePaidConfirmationToCustomer(tenantId, invoice) {
  try {
    const {
      TEMPLATE_KEYS,
      isCustomerNotificationEffectiveEnabled,
      shouldUseAutomationInsteadOfBuiltIn,
    } = require('../services/customerNotificationBridgeService');
    const prefsRow = await Setting.findOne({ where: { tenantId, key: 'customer-notification-preferences' } });
    const prefs = prefsRow?.value || {};
    const settingOn = prefs.sendInvoicePaidConfirmationToCustomer !== false;
    const effective = await isCustomerNotificationEffectiveEnabled(tenantId, {
      settingEnabled: settingOn,
      templateKey: TEMPLATE_KEYS.PAYMENT_RECEIVED_THANK_YOU,
    });
    if (!effective) return;
    if (await shouldUseAutomationInsteadOfBuiltIn(tenantId, TEMPLATE_KEYS.PAYMENT_RECEIVED_THANK_YOU)) {
      return;
    }

    const customer = invoice.customer;
    if (!customer) return;

    const invoiceForTemplate = {
      invoiceNumber: invoice.invoiceNumber,
      total: parseFloat(invoice.totalAmount) || 0,
      currency: invoice.currency || 'GHS',
      paidDate: invoice.paidDate || new Date()
    };

    const company = await companyFromInvoice(invoice);

    if (customer.email) {
      const emailService = require('../services/emailService');
      const emailTemplates = require('../services/emailTemplates');
      const { subject, html, text } = emailTemplates.invoicePaidConfirmation(invoiceForTemplate, customer, company);
      const result = await emailService.sendMessage(tenantId, customer.email, subject, html, text);
      if (result.success) {
        console.log('[Invoice] Paid confirmation email sent to customer');
      }
    }

    const smsService = require('../services/smsService');
    const smsConfig = await smsService.getResolvedConfig(tenantId);
    if (smsConfig && customer.phone) {
      const smsResult = await sendInvoiceSmsFromTemplate(
        tenantId,
        'invoice_paid',
        invoice,
        customer.phone
      );
      if (smsResult.success) {
        console.log('[Invoice] Paid confirmation SMS sent to customer');
      }
    }
  } catch (error) {
    console.error('[Invoice] sendInvoicePaidConfirmationToCustomer error:', error.message);
  }
}

exports.sendInvoicePaidConfirmationToCustomer = sendInvoicePaidConfirmationToCustomer;

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
exports.getInvoices = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const search = req.query.search;
    const status = req.query.status;
    const customerId = req.query.customerId;
    const jobId = req.query.jobId;
    const saleId = req.query.saleId;
    const prescriptionId = req.query.prescriptionId;
    const sourceType = req.query.sourceType;
    const listLogContext = summarizeInvoiceListFilters(req, page, limit, offset);

    logInvoiceListDebug('GET /api/invoices start', listLogContext);

    const where = await buildInvoiceVisibilityWhere(req);

    if (search) {
      // Build search condition; preserve existing where[Op.and] (e.g. staff "own" filter)
      const searchCondition = { invoiceNumber: { [Op.iLike]: `%${search}%` } };
      where[Op.and] = Array.isArray(where[Op.and]) ? [...where[Op.and]] : (where[Op.and] ? [where[Op.and]] : []);
      if (where[Op.or]) {
        where[Op.and].push({ [Op.or]: where[Op.or] });
        delete where[Op.or];
      }
      where[Op.and].push(searchCondition);
    }
    
    if (status && status !== '') where.status = status;
    if (customerId) where.customerId = customerId;
    if (jobId) where.jobId = jobId;
    if (saleId) where.saleId = saleId;
    if (prescriptionId) where.prescriptionId = prescriptionId;
    if (sourceType) where.sourceType = sourceType;

    logInvoiceListDebug('GET /api/invoices filters applied', {
      ...listLogContext,
      appliedStatus: where.status || null,
      appliedCustomerId: where.customerId || null,
      appliedJobId: where.jobId || null,
      appliedSaleId: where.saleId || null,
      appliedPrescriptionId: where.prescriptionId || null,
      appliedSourceType: where.sourceType || null,
      hasAndConditions: Array.isArray(where[Op.and]) && where[Op.and].length > 0,
      hasOrConditions: !!where[Op.or],
    });

    // Build includes array (slim: no branch managers or nested prescription customer)
    const include = invoiceListIncludes();

    const [count, rows] = await Promise.all([
      Invoice.count({ where, distinct: true, col: 'id' }),
      Invoice.findAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        include,
      }),
    ]);

    const data = rows.map((invoice) => invoiceToListPayload(invoice));

    logInvoiceListDebug('GET /api/invoices result', {
      ...listLogContext,
      totalCount: count,
      returnedCount: data.length,
      totalPages: Math.ceil(count / limit),
      firstSourceType: data[0]?.sourceType || null,
      firstShopId: data[0]?.shopId || null,
      firstStudioLocationId: data[0]?.studioLocationId || null,
    });

    res.status(200).json({
      success: true,
      count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      },
      data
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export invoices to CSV/Excel
// @route   GET /api/invoices/export
// @access  Private (admin, manager)
exports.exportInvoices = async (req, res, next) => {
  try {
    const { format = 'csv', status } = req.query;
    const { sendCSV, sendExcel, COLUMN_DEFINITIONS } = require('../utils/dataExport');

    const where = await buildInvoiceVisibilityWhere(req);
    if (status) where.status = status;

    const invoices = await Invoice.findAll({
      where,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      raw: false
    });
    const rows = invoices.map((inv) => {
      const plain = inv.get({ plain: true });
      return {
        ...plain,
        customer: plain.customer || {},
        tax: plain.taxAmount,
        total: plain.totalAmount
      };
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No invoices to export' });
    }

    const filename = `invoices_${new Date().toISOString().split('T')[0]}`;
    const columns = COLUMN_DEFINITIONS.invoices;

    if (format === 'excel') {
      await sendExcel(res, rows, `${filename}.xlsx`, { columns, sheetName: 'Invoices', title: 'Invoice List' });
    } else {
      sendCSV(res, rows, `${filename}.csv`, columns);
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Private
exports.getInvoice = async (req, res, next) => {
  try {
    const include = [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'company', 'email', 'phone', 'address', 'city']
      },
      {
        model: Job,
        as: 'job',
        attributes: ['id', 'jobNumber', 'title', 'description', 'status', 'createdBy'],
        required: false
      }
    ];
    if (Sale) {
      include.push({
        model: Sale,
        as: 'sale',
        attributes: ['id', 'saleNumber', 'soldBy', 'createdAt', 'total'],
        required: false
      });
    }
    include.push(...invoiceBranchIncludes());

    const invoice = await findVisibleInvoiceById(req, req.params.id, include);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (invoice.jobId && invoice.job) {
      const jobItems = await JobItem.findAll({
        where: { jobId: invoice.jobId },
        order: [['createdAt', 'ASC']],
      });
      invoice.job.setDataValue('items', jobItems);
    }

    const payload = await invoiceToResponsePayload(invoice);
    payload.payments = (await loadInvoicePayments(invoice)).map((payment) => (
      typeof payment.toJSON === 'function' ? payment.toJSON() : payment
    ));

    res.status(200).json({
      success: true,
      data: payload
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create invoice (from job or direct/manual)
// @route   POST /api/invoices
// @access  Private
exports.createInvoice = async (req, res, next) => {
  try {
    const {
      jobId,
      customerId,
      items: bodyItems = [],
      dueDate,
      paymentTerms,
      taxRate: bodyTaxRate,
      discountType,
      discountValue,
      notes,
      termsAndConditions
    } = sanitizePayload(req.body);

    const taxConfig = await getTaxConfigForTenant(req.tenantId);
    const taxRate =
      taxConfig.enabled
        ? parseFloat(bodyTaxRate) || getEffectiveTaxRatePercent(taxConfig) || 0
        : 0;

    const isJobLinked = !!jobId;
    let resolvedCustomerId = customerId || null;
    let sourceType = 'job';
    let job = null;

    if (isJobLinked) {
      // Fetch job with items
      job = await Job.findOne({
        where: applyTenantFilter(req.tenantId, { id: jobId }),
        include: [
          {
            model: JobItem,
            as: 'items'
          },
          {
            model: Customer,
            as: 'customer'
          }
        ]
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      // Check if invoice already exists for this job
      const existingInvoice = await Invoice.findOne({ where: applyTenantFilter(req.tenantId, { jobId }) });
      if (existingInvoice) {
        return res.status(400).json({
          success: false,
          message: 'Invoice already exists for this job'
        });
      }
      resolvedCustomerId = job.customerId;
      sourceType = 'job';
    } else {
      if (!resolvedCustomerId) {
        return res.status(400).json({
          success: false,
          message: 'Customer is required when creating an invoice directly'
        });
      }
      if (!Array.isArray(bodyItems) || bodyItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one invoice item is required'
        });
      }

      const customer = await Customer.findOne({
        where: applyTenantFilter(req.tenantId, { id: resolvedCustomerId }),
        attributes: ['id']
      });
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Keep sourceType within DB enum while ensuring records remain visible per business type.
      const businessType = req.tenant?.businessType;
      if (businessType === 'shop') sourceType = 'sale';
      else if (businessType === 'pharmacy') sourceType = 'prescription';
      else sourceType = 'job';
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(req.tenantId);

    // Calculate subtotal from linked job items OR manual payload items
    let subtotal = 0;
    let items = [];
    let totalItemDiscount = 0;

    if (isJobLinked && job?.items?.length > 0) {
      items = job.items.map((item) => {
        const qty = parseFloat(item.quantity || 0);
        const unitPrice = parseFloat(item.unitPrice || 0);
        const lineGross = qty * unitPrice;
        const storedTotal = parseFloat(item.totalPrice != null ? item.totalPrice : lineGross);
        const explicitDiscount = parseFloat(item.discountAmount || 0);
        const derivedDiscount = Math.max(0, lineGross - storedTotal);
        const lineDiscount = explicitDiscount > 0 ? explicitDiscount : derivedDiscount;
        return {
          description: item.description || item.category,
          category: item.category,
          paperSize: item.paperSize,
          quantity: item.quantity,
          unitPrice,
          discountAmount: lineDiscount,
          discountPercent: parseFloat(item.discountPercent || 0),
          discountReason: item.discountReason || (lineDiscount > 0 ? 'Discount from job line' : null),
          total: lineGross - lineDiscount
        };
      });
      subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0);
      totalItemDiscount = items.reduce((sum, item) => sum + parseFloat(item.discountAmount || 0), 0);
    } else if (isJobLinked) {
      // If linked job has no items, use finalPrice from job
      subtotal = parseFloat(job.finalPrice || 0);
      items = [{
        description: job.title,
        quantity: 1,
        unitPrice: subtotal,
        total: subtotal
      }];
      totalItemDiscount = 0;
    } else {
      items = bodyItems.map((item) => {
        const qty = parseFloat(item.quantity || 0);
        const unitPrice = parseFloat(item.unitPrice || 0);
        const rawDiscount = parseFloat(item.discountAmount || 0);
        const discountScope = String(item.discountScope || 'line').toLowerCase();
        const lineGross = qty * unitPrice;
        const providedTotal = parseFloat(item.total != null ? item.total : lineGross);
        const derivedDiscount = Math.max(0, lineGross - providedTotal);
        const explicitLineDiscount = discountScope === 'unit' ? rawDiscount * qty : rawDiscount;
        const lineDiscount = explicitLineDiscount > 0 ? explicitLineDiscount : derivedDiscount;
        const total = Math.max(0, lineGross - lineDiscount);
        return {
          description: item.description || '',
          productCode: pickTrimmed(item.productCode, item.code, item.barcode, item.sku, item.metadata?.productCode),
          sku: pickTrimmed(item.sku, item.metadata?.sku),
          productId: item.productId || undefined,
          productVariantId: item.productVariantId || item.variantId || undefined,
          quantity: qty,
          unitPrice,
          unit: pickTrimmed(item.unit, item.metadata?.unit),
          discountAmount: lineDiscount,
          discountPercent: parseFloat(item.discountPercent || 0),
          discountReason: item.discountReason || null,
          total
        };
      });
      subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)), 0);
      totalItemDiscount = items.reduce((sum, item) => sum + parseFloat(item.discountAmount || 0), 0);
    }

    const pricesAreTaxInclusive = taxConfig.enabled && taxConfig.pricesAreTaxInclusive && (taxRate || 0) > 0;
    if (pricesAreTaxInclusive) {
      const conv = convertLineItemsFromTaxInclusive(items, taxRate);
      items = conv.items;
      subtotal = conv.subtotal;
      totalItemDiscount = conv.discountTotal;
    }

    // Preserve direct-invoice line-item discounts in invoice header totals.
    // For job-linked invoices, also reconcile against job.finalPrice so discounts
    // applied at job-level (but not persisted on each item) are still honored.
    // Invoice model computes total using subtotal - discountValue (+ tax).
    const comparableJobFinalPrice = pricesAreTaxInclusive
      ? Math.round((parseFloat(job?.finalPrice || 0) / (1 + taxRate / 100)) * 100) / 100
      : parseFloat(job?.finalPrice || 0);
    const jobLevelDiscountFallback = isJobLinked
      ? Math.max(
          0,
          (parseFloat(subtotal || 0) - comparableJobFinalPrice)
        )
      : 0;
    const hasHeaderDiscount = discountValue !== undefined && discountValue !== null && discountValue !== '';
    const resolvedDiscountType = discountType || 'fixed';
    const resolvedDiscountValue = hasHeaderDiscount
      ? parseFloat(discountValue || 0)
      : (totalItemDiscount > 0 ? totalItemDiscount : jobLevelDiscountFallback);

    const studioLocationId =
      (isJobLinked && job?.studioLocationId) ||
      attachStudioLocationToPayload(req, {}).studioLocationId ||
      null;
    const scopedMeta = attachScopedToPayload(req, {});

    let resolvedShopId = scopedMeta.shopId || null;
    if (isJobLinked && job?.shopId) {
      resolvedShopId = job.shopId;
    }

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      jobId: isJobLinked ? jobId : null,
      customerId: resolvedCustomerId,
      tenantId: req.tenantId,
      studioLocationId,
      shopId: resolvedShopId,
      sourceType,
      invoiceDate: new Date(),
      dueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
      subtotal,
      taxRate: taxRate || 0,
      discountType: resolvedDiscountType,
      discountValue: resolvedDiscountValue,
      paymentTerms: paymentTerms || 'Net 30',
      items,
      notes,
      termsAndConditions: termsAndConditions || 'Payment is due within the specified payment terms. Late payments may incur additional charges.'
    });

    // Fetch the created invoice with relationships
    const createdInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoice.id }),
      include: invoiceResponseIncludes()
    });

    // Send webhook to Sabito (async, don't block response)
    try {
      const customer = await Customer.findOne({
        where: applyTenantFilter(req.tenantId, { id: createdInvoice.customerId }),
        attributes: [
          'id', 
          'sabitoCustomerId', 
          'sabitoBusinessId', 
          'email', 
          'name', 
          'phone'
        ]
      });

      if (customer) {
        sabitoWebhookService.sendInvoiceWebhook(createdInvoice, customer, req.tenantId)
          .then(async (result) => {
            if (result.success) {
              // Update invoice with Sabito project ID
              await createdInvoice.update({
                sabitoProjectId: result.projectId,
                sabitoSyncedAt: new Date(),
                sabitoSyncStatus: 'synced'
              });
            } else if (result.skipped) {
              await createdInvoice.update({
                sabitoSyncStatus: 'skipped'
              });
            }
          })
          .catch(async (error) => {
            console.error('Failed to send Sabito webhook:', error);
            await createdInvoice.update({
              sabitoSyncStatus: 'failed',
              sabitoSyncError: error.message
            });
          });
      }
    } catch (error) {
      // Don't fail invoice creation if webhook fails
      console.error('Error sending Sabito webhook:', error);
    }

    // Invalidate cache after creating invoice
    invalidateAfterMutation(req.tenantId);

    invalidateInvoiceListCache(req.tenantId);
    runHighValueInvoiceAutomations({
      tenantId: req.tenantId,
      invoice: createdInvoice,
      customer: createdInvoice.customer || null,
      actorUserId: req.user?.id || null,
    }).catch((err) =>
      console.error('[Invoice] high_value_invoice automations failed:', err?.message || err)
    );

    const responsePayload = await invoiceToResponsePayload(createdInvoice);
    res.status(201).json({
      success: true,
      data: responsePayload
    });

    const customerIdForBalance = invoice.customerId;
    const actorUserId = req.user?.id || null;
    const tenantIdForStamp = req.tenantId;
    setImmediate(async () => {
      try {
        await updateCustomerBalance(customerIdForBalance);
      } catch (error) {
        console.error('Failed to update customer balance:', error);
      }
      try {
        await createInvoiceRevenueJournal(createdInvoice, actorUserId);
      } catch (journalError) {
        console.error('Failed to create accounting revenue entry for invoice', journalError);
      }
      try {
        const evatService = require('../services/evatService');
        const plain = typeof createdInvoice.get === 'function'
          ? createdInvoice.get({ plain: true })
          : createdInvoice;
        plain.documentType = 'tax_invoice';
        const metadata = await evatService.stampDocumentIfEnabled(
          tenantIdForStamp,
          plain,
          plain.metadata || {}
        );
        if (metadata) {
          await Invoice.update(
            { metadata },
            { where: { id: createdInvoice.id, tenantId: tenantIdForStamp } }
          );
          if (metadata.graStampQueue?.lastError) {
            console.warn('[CreateInvoice] e-VAT stamp queued:', metadata.graStampQueue.lastError);
          }
        }
      } catch (stampErr) {
        console.warn('[CreateInvoice] e-VAT stamp skipped/failed:', stampErr?.message || stampErr);
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update invoice
// @route   PUT /api/invoices/:id
// @access  Private
exports.updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: invoiceReadWhere(req, { id: req.params.id })
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    assertShopRecordAccess(req, invoice);

    // Don't allow updating paid or cancelled invoices
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot update ${invoice.status} invoice`
      });
    }

    const oldStatus = invoice.status;
    await invoice.update(sanitizePayload(req.body));

    const updatedInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoice.id }),
      include: invoiceResponseIncludes()
    });

    // Log activity if status changed to 'sent'
    if (oldStatus !== 'sent' && updatedInvoice.status === 'sent') {
      try {
        await activityLogger.logInvoiceSent(updatedInvoice, req.user?.id || null);
      } catch (error) {
        console.error('Failed to log invoice sent activity:', error);
      }
    }

    invalidateAfterMutation(req.tenantId);
    invalidateInvoiceListCache(req.tenantId);
    res.status(200).json({
      success: true,
      data: await invoiceToResponsePayload(updatedInvoice)
    });

    if (!updatedInvoice.metadata?.graStamp?.irn) {
      const tenantIdForStamp = req.tenantId;
      setImmediate(async () => {
        try {
          const evatService = require('../services/evatService');
          const plain = typeof updatedInvoice.get === 'function'
            ? updatedInvoice.get({ plain: true })
            : updatedInvoice;
          plain.documentType = 'tax_invoice';
          const metadata = await evatService.stampDocumentIfEnabled(
            tenantIdForStamp,
            plain,
            plain.metadata || {}
          );
          if (metadata) {
            await Invoice.update(
              { metadata },
              { where: { id: updatedInvoice.id, tenantId: tenantIdForStamp } }
            );
          }
        } catch (stampErr) {
          console.warn('[UpdateInvoice] e-VAT stamp skipped/failed:', stampErr?.message || stampErr);
        }
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Delete invoice
// @route   DELETE /api/invoices/:id
// @access  Private (Admin only)
exports.deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: invoiceReadWhere(req, { id: req.params.id })
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Don't allow deleting invoices with recorded payments
    if (invoice.status === 'paid' || parseFloat(invoice.amountPaid || 0) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete invoice with recorded payments'
      });
    }

    const customerId = invoice.customerId;
    await invoice.destroy();

    // Update customer balance after deleting invoice
    try {
      await updateCustomerBalance(customerId);
    } catch (error) {
      console.error('Failed to update customer balance:', error);
    }

    // Invalidate cache after deleting invoice
    invalidateAfterMutation(req.tenantId);

    invalidateInvoiceListCache(req.tenantId);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete cancelled invoice
// @route   DELETE /api/invoices/:id/cancelled
// @access  Private (Admin only)
exports.deleteCancelledInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: invoiceReadWhere(req, { id: req.params.id })
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (invoice.status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Only cancelled invoices can be deleted with this action'
      });
    }

    if (parseFloat(invoice.amountPaid || 0) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete invoice with recorded payments'
      });
    }

    const customerId = invoice.customerId;
    await invoice.destroy();

    try {
      await updateCustomerBalance(customerId);
    } catch (error) {
      console.error('Failed to update customer balance:', error);
    }

    invalidateAfterMutation(req.tenantId);
    invalidateInvoiceListCache(req.tenantId);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record an income payment against an invoice (no HTTP).
 * Used by POST /invoices/:id/payment and job-create prepaid invoices.
 *
 * @param {object} params
 * @returns {Promise<{ duplicate: boolean, invoice: object, payment: object|null, previousStatus: string }>}
 */
async function applyInvoicePaymentInternal({
  tenantId,
  userId = null,
  invoice,
  amount,
  paymentMethod = 'cash',
  paymentDate = null,
  referenceNumber = '',
  clientRequestId = '',
  notes = null,
  enqueueSideEffects = true,
}) {
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.statusCode = 404;
    throw err;
  }
  if (invoice.status === 'cancelled') {
    const err = new Error('Cannot record payment on cancelled invoice');
    err.statusCode = 400;
    throw err;
  }

  const paymentReference = normalizePaymentReference(referenceNumber, clientRequestId);
  const existingPayment = await findExistingPaymentByReference({
    tenantId,
    referenceNumber: paymentReference,
  });
  if (existingPayment) {
    const hydratedInvoice = await Invoice.findOne({
      where: applyTenantFilter(tenantId, { id: invoice.id }),
      include: invoiceResponseIncludes(),
    });
    return {
      duplicate: true,
      invoice: hydratedInvoice || invoice,
      payment: existingPayment,
      previousStatus: invoice.status,
    };
  }

  const paymentAmount = parseFloat(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    const err = new Error('Payment amount must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  const totalAmount = parseFloat(invoice.totalAmount || 0);
  const newAmountPaid = parseFloat(invoice.amountPaid || 0) + paymentAmount;
  const newBalance = Math.max(totalAmount - newAmountPaid, 0);

  if (newAmountPaid > totalAmount + 0.01) {
    const err = new Error('Payment amount exceeds invoice total');
    err.statusCode = 400;
    throw err;
  }

  const effectivePaymentDate = parsePaymentDateInput(paymentDate);
  if (!effectivePaymentDate) {
    const err = new Error('Payment date is invalid');
    err.statusCode = 400;
    throw err;
  }

  const previousStatus = invoice.status;
  const updatePayload = {
    amountPaid: Math.min(newAmountPaid, totalAmount),
    balance: newBalance,
  };

  if (newBalance <= 0.01) {
    updatePayload.status = 'paid';
    updatePayload.paidDate = effectivePaymentDate;
    updatePayload.balance = 0;
  } else if (invoice.status === 'draft') {
    updatePayload.status = 'sent';
  }

  await invoice.update(updatePayload);

  const payment = await Payment.create({
    paymentNumber: `PAY-${Date.now()}`,
    type: 'income',
    customerId: invoice.customerId,
    jobId: invoice.jobId,
    tenantId,
    amount: paymentAmount,
    paymentMethod: paymentMethod || 'cash',
    paymentDate: effectivePaymentDate,
    referenceNumber: paymentReference || referenceNumber || undefined,
    status: 'completed',
    description: `invoice:${invoice.id}`,
    notes: notes || null,
  });

  try {
    await maybeCreateCommissionForPayment({
      tenantId,
      paymentAmount,
      paymentId: payment.id,
      saleId: invoice.saleId || null,
      invoiceId: invoice.id,
      customerId: invoice.customerId || null,
      jobId: invoice.jobId || null,
    });
  } catch (partnerErr) {
    console.error('[InvoiceRecordPayment] Partner commission failed:', partnerErr?.message || partnerErr);
  }

  const updatedInvoice = await Invoice.findOne({
    where: applyTenantFilter(tenantId, { id: invoice.id }),
    include: invoiceResponseIncludes(),
  });

  invalidateAfterMutation(tenantId);
  invalidateInvoiceListCache(tenantId);

  if (enqueueSideEffects) {
    enqueueInvoicePaymentSideEffects({
      tenantId,
      userId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      payment,
      paymentAmount,
      paymentDate: effectivePaymentDate,
      paymentMethod: paymentMethod || 'cash',
      referenceNumber: paymentReference || referenceNumber,
      updatedInvoice,
      wasFullyPaid: updatedInvoice?.status === 'paid',
      wasAlreadyPaid: previousStatus === 'paid',
    });
  }

  return {
    duplicate: false,
    invoice: updatedInvoice,
    payment,
    previousStatus,
  };
}

exports.applyInvoicePaymentInternal = applyInvoicePaymentInternal;

// @desc    Record payment on invoice
// @route   POST /api/invoices/:id/payment
// @access  Private
exports.recordPayment = async (req, res, next) => {
  try {
    const body = sanitizePayload(req.body);
    const { amount, paymentMethod, referenceNumber, clientRequestId, paymentDate } = body;
    const paymentNotes = resolvePaymentNotesFromBody(body);

    const invoice = await Invoice.findOne({
      where: invoiceReadWhere(req, { id: req.params.id })
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    let result;
    try {
      result = await applyInvoicePaymentInternal({
        tenantId: req.tenantId,
        userId: req.user?.id || null,
        invoice,
        amount,
        paymentMethod: paymentMethod || 'cash',
        paymentDate,
        referenceNumber,
        clientRequestId,
        notes: paymentNotes,
      });
    } catch (payErr) {
      if (payErr.statusCode) {
        return res.status(payErr.statusCode).json({
          success: false,
          message: payErr.message,
        });
      }
      throw payErr;
    }

    const hydratedInvoice = result.invoice;
    const payload = await invoiceToResponsePayload(hydratedInvoice);
    payload.payments = (await loadInvoicePayments(hydratedInvoice)).map((paymentRecord) => (
      typeof paymentRecord.toJSON === 'function' ? paymentRecord.toJSON() : paymentRecord
    ));
    const paymentJson = result.payment && typeof result.payment.toJSON === 'function'
      ? result.payment.toJSON()
      : result.payment;

    if (result.duplicate) {
      return res.status(200).json({
        success: true,
        message: 'Payment already recorded',
        data: payload,
        payment: paymentJson,
        duplicate: true
      });
    }

    res.status(200).json({
      success: true,
      data: payload,
      payment: paymentJson
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark invoice as fully paid without recording partial payment details
// @route   POST /api/invoices/:id/mark-paid
// @access  Private
exports.markInvoicePaid = async (req, res, next) => {
  try {
    const body = sanitizePayload(req.body || {});
    const { paymentDate, paidAt, clientRequestId } = body;
    const paymentNotes = resolvePaymentNotesFromBody(body);
    const paymentReference = normalizePaymentReference(null, clientRequestId);
    const effectivePaymentDate = parsePaymentDateInput(paymentDate || paidAt);
    if (!effectivePaymentDate) {
      return res.status(400).json({
        success: false,
        message: 'Payment date is invalid'
      });
    }

    const invoice = await Invoice.findOne({
      where: invoiceReadWhere(req, { id: req.params.id })
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot mark a cancelled invoice as paid'
      });
    }

    const existingPayment = await findExistingPaymentByReference({
      tenantId: req.tenantId,
      referenceNumber: paymentReference,
    });
    if (existingPayment) {
      const hydratedInvoice = await Invoice.findOne({
        where: applyTenantFilter(req.tenantId, { id: invoice.id }),
        include: invoiceResponseIncludes()
      });
      const payload = await invoiceToResponsePayload(hydratedInvoice);
      payload.payments = (await loadInvoicePayments(hydratedInvoice)).map((paymentRecord) => (
        typeof paymentRecord.toJSON === 'function' ? paymentRecord.toJSON() : paymentRecord
      ));

      return res.status(200).json({
        success: true,
        message: 'Payment already recorded',
        data: payload,
        payment: typeof existingPayment.toJSON === 'function' ? existingPayment.toJSON() : existingPayment,
        duplicate: true
      });
    }

    if (invoice.status === 'paid') {
      const hydratedInvoice = await Invoice.findOne({
        where: applyTenantFilter(req.tenantId, { id: invoice.id }),
        include: invoiceResponseIncludes()
      });
      const payload = await invoiceToResponsePayload(hydratedInvoice);
      payload.payments = (await loadInvoicePayments(hydratedInvoice)).map((paymentRecord) => (
        typeof paymentRecord.toJSON === 'function' ? paymentRecord.toJSON() : paymentRecord
      ));

      return res.status(200).json({
        success: true,
        message: 'Invoice is already marked as paid',
        data: payload
      });
    }

    const totalAmount = parseFloat(invoice.totalAmount || 0);
    const currentPaid = parseFloat(invoice.amountPaid || 0);
    const outstanding = Math.max(totalAmount - currentPaid, 0);
    await invoice.update({
      amountPaid: totalAmount,
      balance: 0,
      status: 'paid',
      paidDate: effectivePaymentDate
    });

    let manualPayment = null;
    if (outstanding > 0) {
      const paymentNumber = `PAY-${Date.now()}`;

      manualPayment = await Payment.create({
        paymentNumber,
        type: 'income',
        customerId: invoice.customerId,
        jobId: invoice.jobId,
        tenantId: req.tenantId,
        amount: outstanding,
        paymentMethod: 'other',
        paymentDate: effectivePaymentDate,
        referenceNumber: paymentReference || undefined,
        status: 'completed',
        description: `invoice:${invoice.id}`,
        notes: paymentNotes || null
      });
    }

    const updatedInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoice.id }),
      include: invoiceResponseIncludes()
    });

    invalidateAfterMutation(req.tenantId);
    invalidateInvoiceListCache(req.tenantId);
    const payload = await invoiceToResponsePayload(updatedInvoice);
    payload.payments = (await loadInvoicePayments(updatedInvoice)).map((paymentRecord) => (
      typeof paymentRecord.toJSON === 'function' ? paymentRecord.toJSON() : paymentRecord
    ));

    res.status(200).json({
      success: true,
      message: 'Invoice marked as paid successfully',
      data: payload,
      payment: manualPayment ? (typeof manualPayment.toJSON === 'function' ? manualPayment.toJSON() : manualPayment) : null
    });

    enqueueInvoicePaymentSideEffects({
      tenantId: req.tenantId,
      userId: req.user?.id || null,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      payment: manualPayment,
      paymentAmount: outstanding,
      paymentDate: effectivePaymentDate,
      paymentMethod: manualPayment?.paymentMethod || 'other',
      referenceNumber: paymentReference,
      updatedInvoice,
      wasFullyPaid: true,
      wasAlreadyPaid: invoice.status === 'paid',
      markedPaid: true,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send invoice to customer
// @route   POST /api/invoices/:id/send
// @access  Private
exports.sendInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: invoiceReadWhere(req, { id: req.params.id })
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Ensure payment token exists
    if (!invoice.paymentToken) {
      const crypto = require('crypto');
      await invoice.update({
        paymentToken: crypto.randomBytes(32).toString('hex')
      });
    }

    await invoice.update({
      status: 'sent',
      sentDate: new Date()
    });

    const updatedInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoice.id }),
      include: invoiceResponseIncludes()
    });

    // Generate payment link
    const paymentLink = buildInvoicePaymentLink(updatedInvoice, req);

    const prefsSetting = await Setting.findOne({ where: { tenantId: req.tenantId, key: 'customer-notification-preferences' } });

    // Log activity
    try {
      await activityLogger.logInvoiceSent(updatedInvoice, req.user?.id || null);
    } catch (error) {
      console.error('Failed to log invoice sent activity:', error);
    }

    const deliveryResult = await deliverInvoiceToCustomer({
      tenantId: req.tenantId,
      updatedInvoice,
      paymentLink,
      userId: req.user?.id || null,
      deliverySource: 'manual_invoice_send',
      actorUserId: req.user?.id || null,
      prefsSetting,
    });

    const { emailSent, smsSent, emailError } = deliveryResult;

    res.status(200).json({
      success: true,
      message: emailSent
        ? 'Invoice sent successfully via email and marked as sent'
        : 'Invoice marked as sent (email not sent: ' + (emailError || 'unknown error') + ')',
      data: await invoiceToResponsePayload(updatedInvoice),
      paymentLink,
      emailSent,
      emailError: emailSent ? null : emailError,
      smsSent
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create invoice from job (internal use, e.g. when customer accepts quote and auto-flow is on).
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @param {string|null} userId - User ID for audit (e.g. quote creator)
 * @returns {Promise<Object|null>} - Created invoice with customer, or null if job not found or invoice exists
 */
async function createInvoiceFromJobInternal(tenantId, jobId, userId = null) {
  const job = await Job.findOne({
    where: applyTenantFilter(tenantId, { id: jobId }),
    include: [
      { model: JobItem, as: 'items' },
      { model: Customer, as: 'customer' }
    ]
  });
  if (!job) {
    console.warn('[Invoice][createInvoiceFromJobInternal] job not found', { tenantId, jobId });
    return null;
  }
  const existingInvoice = await Invoice.findOne({ where: applyTenantFilter(tenantId, { jobId }) });
  if (existingInvoice) {
    console.log('[Invoice][createInvoiceFromJobInternal] skip: invoice already exists', {
      tenantId,
      jobId,
      invoiceId: existingInvoice.id,
      invoiceNumber: existingInvoice.invoiceNumber
    });
    return null;
  }

  const invoiceNumber = await generateInvoiceNumber(tenantId);
  let subtotal = 0;
  let items = [];
  if (job.items && job.items.length > 0) {
    items = job.items.map((item) => {
      const qty = parseFloat(item.quantity || 0);
      const unitPrice = parseFloat(item.unitPrice || 0);
      const lineGross = qty * unitPrice;
      const storedTotal = parseFloat(item.totalPrice != null ? item.totalPrice : lineGross);
      const explicitDiscount = parseFloat(item.discountAmount || 0);
      const derivedDiscount = Math.max(0, lineGross - storedTotal);
      const lineDiscount = explicitDiscount > 0 ? explicitDiscount : derivedDiscount;
      return {
        description: item.description || item.category,
        category: item.category,
        paperSize: item.paperSize,
        quantity: item.quantity,
        unitPrice,
        discountAmount: lineDiscount,
        discountPercent: parseFloat(item.discountPercent || 0),
        discountReason: item.discountReason || (lineDiscount > 0 ? 'Discount from job/quote line' : null),
        total: lineGross - lineDiscount
      };
    });
    subtotal = items.reduce((sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.unitPrice), 0);
  } else {
    subtotal = parseFloat(job.finalPrice || 0);
    items = [{ description: job.title, quantity: 1, unitPrice: subtotal, total: subtotal }];
  }

  const taxConfigJob = await getTaxConfigForTenant(tenantId);
  const jobTaxRate = taxConfigJob.enabled ? taxConfigJob.defaultRatePercent || 0 : 0;
  const jobPricesAreTaxInclusive = taxConfigJob.enabled && taxConfigJob.pricesAreTaxInclusive && jobTaxRate > 0;

  if (jobPricesAreTaxInclusive) {
    const conv = convertLineItemsFromTaxInclusive(items, jobTaxRate);
    items = conv.items;
    subtotal = conv.subtotal;
  }

  const totalItemDiscount = (job.items && job.items.length > 0)
    ? items.reduce((sum, item) => sum + parseFloat(item.discountAmount || 0), 0)
    : 0;
  const comparableFinalPrice = jobPricesAreTaxInclusive
    ? Math.round((parseFloat(job?.finalPrice || 0) / (1 + jobTaxRate / 100)) * 100) / 100
    : parseFloat(job?.finalPrice || 0);
  const jobLevelDiscountFallback = Math.max(
    0,
    (parseFloat(subtotal || 0) - comparableFinalPrice)
  );
  const effectiveDiscount = totalItemDiscount > 0 ? totalItemDiscount : jobLevelDiscountFallback;

  const invoicePayload = {
    invoiceNumber,
    jobId,
    customerId: job.customerId,
    tenantId,
    studioLocationId: job.studioLocationId || null,
    sourceType: 'job',
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    subtotal,
    taxRate: jobTaxRate,
    discountType: 'fixed',
    discountValue: effectiveDiscount,
    discountAmount: effectiveDiscount,
    discountReason: effectiveDiscount > 0
      ? (items.find((i) => i.discountReason)?.discountReason || 'Line discounts from job')
      : undefined,
    paymentTerms: 'Net 30',
    items,
    notes: null,
    termsAndConditions: 'Payment is due within the specified payment terms. Late payments may incur additional charges.'
  };

  if (totalItemDiscount <= 0) {
    invoicePayload.totalAmount = subtotal;
  }

  const invoice = await Invoice.create(invoicePayload);

  console.log('[Invoice][createInvoiceFromJobInternal] created', {
    tenantId,
    jobId,
    invoiceNumber: invoice.invoiceNumber,
    lineCount: items.length,
    subtotal,
    lineDiscountTotal: totalItemDiscount,
    effectiveDiscount
  });

  try {
    await updateCustomerBalance(invoice.customerId);
  } catch (e) {
    console.error('Failed to update customer balance:', e);
  }
  try {
    await createInvoiceRevenueJournal(invoice, userId);
  } catch (e) {
    console.error('Failed to create revenue journal:', e);
  }

  const createdInvoice = await Invoice.findOne({
    where: applyTenantFilter(tenantId, { id: invoice.id }),
    include: [{ model: Customer, as: 'customer' }, { model: Job, as: 'job' }]
  });
  return createdInvoice;
}

/**
 * Create invoice from quote (shop flow: accept quote → invoice). Items taken from quote items; productId stored in item for later sale.
 * @param {string} tenantId
 * @param {string} quoteId
 * @param {string|null} userId
 * @returns {Promise<Object|null>}
 */
async function createInvoiceFromQuoteInternal(tenantId, quoteId, userId = null) {
  const quote = await Quote.findOne({
    where: applyTenantFilter(tenantId, { id: quoteId }),
    include: [
      { model: QuoteItem, as: 'items' },
      { model: Customer, as: 'customer' }
    ]
  });
  if (!quote) return null;
  const existingInvoice = await Invoice.findOne({ where: applyTenantFilter(tenantId, { quoteId }) });
  if (existingInvoice) return null;

  const invoiceNumber = await generateInvoiceNumber(tenantId);
  const items = [];
  let headerSubtotal = parseFloat(quote.subtotal || 0);
  let discountTotal = parseFloat(quote.discountTotal || 0);
  if (quote.items && quote.items.length > 0) {
    for (const qi of quote.items) {
      const qty = parseFloat(qi.quantity || 0);
      const unitPrice = parseFloat(qi.unitPrice || 0);
      const discount = parseFloat(qi.discountAmount || 0);
      const lineTotal = qty * unitPrice - discount;
      items.push({
        description: qi.description || '',
        quantity: qi.quantity,
        unitPrice: qi.unitPrice,
        total: lineTotal,
        unit: pickTrimmed(qi.metadata?.unit),
        productCode: pickTrimmed(qi.metadata?.productCode, qi.metadata?.barcode, qi.metadata?.sku),
        sku: pickTrimmed(qi.metadata?.sku),
        productVariantId: qi.metadata?.productVariantId || undefined,
        productId: qi.productId || undefined
      });
    }
  } else {
    headerSubtotal = parseFloat(quote.subtotal || quote.totalAmount || 0);
    const fallbackLineTotal = Math.max(0, headerSubtotal - discountTotal);
    items.push({
      description: quote.title,
      quantity: 1,
      unitPrice: headerSubtotal,
      total: fallbackLineTotal
    });
  }

  const taxRate = parseFloat(quote.taxRate || 0);
  const taxCfgQuote = await getTaxConfigForTenant(tenantId);
  if (taxCfgQuote.enabled && taxCfgQuote.pricesAreTaxInclusive && taxRate > 0 && items.length > 0) {
    const conv = convertLineItemsFromTaxInclusive(items, taxRate);
    items.length = 0;
    conv.items.forEach((row) => items.push(row));
    headerSubtotal = conv.subtotal;
    discountTotal = conv.discountTotal;
  }

  const invoice = await Invoice.create({
    invoiceNumber,
    quoteId,
    customerId: quote.customerId,
    tenantId,
    shopId: quote.shopId || null,
    studioLocationId: quote.studioLocationId || null,
    sourceType: 'quote',
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    subtotal: headerSubtotal,
    taxRate,
    discountType: 'fixed',
    discountValue: discountTotal,
    discountAmount: discountTotal,
    amountPaid: 0,
    paymentTerms: 'Net 30',
    items,
    notes: quote.notes || null,
    termsAndConditions: 'Payment is due within the specified payment terms.'
  });

  try {
    await updateCustomerBalance(invoice.customerId);
  } catch (e) {
    console.error('Failed to update customer balance:', e);
  }
  try {
    await createInvoiceRevenueJournal(invoice, userId);
  } catch (e) {
    console.error('Failed to create revenue journal:', e);
  }

  return Invoice.findOne({
    where: applyTenantFilter(tenantId, { id: invoice.id }),
    include: [{ model: Customer, as: 'customer' }]
  });
}

/**
 * Send invoice to customer via configured channels (internal use). Marks invoice as sent and sends email/WhatsApp/SMS.
 * @param {string} tenantId - Tenant ID
 * @param {Object} invoice - Invoice with customer loaded
 * @param {{ forceCustomerChannels?: boolean, userId?: string|null, deliverySource?: string }} [options] - If forceCustomerChannels, notify customer even when global auto-send invoice pref is off (e.g. job-creation auto-send).
 */
async function sendInvoiceToCustomer(tenantId, invoice, options = {}) {
  const {
    forceCustomerChannels = false,
    userId = null,
    deliverySource = 'internal_invoice_send',
    skipPaidReceipt = false,
  } = options || {};
  if (!invoice.paymentToken) {
    const crypto = require('crypto');
    await invoice.update({ paymentToken: crypto.randomBytes(32).toString('hex') });
  }
  await invoice.reload();
  await invoice.update({ status: 'sent', sentDate: new Date() });
  const updatedInvoice = await Invoice.findOne({
    where: applyTenantFilter(tenantId, { id: invoice.id }),
    include: [{ model: Customer, as: 'customer' }, { model: Job, as: 'job' }]
  });
  const paymentLink = buildInvoicePaymentLink(updatedInvoice);

  await deliverInvoiceToCustomer({
    tenantId,
    updatedInvoice,
    paymentLink,
    userId,
    deliverySource,
    forceCustomerChannels,
    actorUserId: userId,
    skipPaidReceipt,
  });
}

// @desc    Ensure an invoice has a public payment link without sending customer notifications
// @route   POST /api/invoices/:id/payment-link
// @access  Private
exports.ensureInvoicePaymentLink = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: invoiceReadWhere(req, { id: req.params.id })
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot create a payment link for a cancelled invoice'
      });
    }

    if (!invoice.paymentToken) {
      const crypto = require('crypto');
      await invoice.update({
        paymentToken: crypto.randomBytes(32).toString('hex')
      });
    }

    const updatedInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoice.id }),
      include: invoiceResponseIncludes()
    });
    const paymentLink = buildInvoicePaymentLink(updatedInvoice, req);

    return res.status(200).json({
      success: true,
      data: {
        invoice: updatedInvoice,
        paymentToken: updatedInvoice.paymentToken,
        paymentLink
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.createInvoiceFromJobInternal = createInvoiceFromJobInternal;
exports.createInvoiceFromQuoteInternal = createInvoiceFromQuoteInternal;
exports.sendInvoiceToCustomer = sendInvoiceToCustomer;

// @desc    Get invoice by payment token (public)
// @route   GET /api/public/invoices/:token
// @access  Public
exports.getInvoiceByToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    const invoice = await Invoice.findOne({
      where: { paymentToken: token },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'company', 'email', 'phone']
        },
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'jobNumber', 'title'],
          required: false
        },
        {
          model: require('../models').Sale,
          as: 'sale',
          attributes: ['id', 'saleNumber', 'createdAt'],
          required: false
        },
        {
          model: require('../models').Prescription,
          as: 'prescription',
          attributes: ['id', 'prescriptionNumber', 'prescriptionDate'],
          include: [{
            model: require('../models').Customer,
            as: 'customer',
            attributes: ['id', 'name'],
            required: false
          }],
          required: false
        },
        {
          model: require('../models').Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'slug']
        },
        ...invoiceBranchIncludes(),
      ]
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found or invalid payment link'
      });
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This invoice has been cancelled'
      });
    }

    // Prevent caching so payment link always shows current status (e.g. after paid)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const tenantForPay = await Tenant.findByPk(invoice.tenantId);
    const airtelDirectOk = Boolean(
      process.env.AIRTEL_MONEY_CLIENT_ID && process.env.AIRTEL_MONEY_CLIENT_SECRET
    );
    const paymentOptions = buildPublicPaymentOptions(tenantForPay, { airtelDirectOk });

    let organization = null;
    try {
      const resolved = await resolveInvoiceOrganization(invoice);
      organization = {
        name: resolved.name,
        phone: resolved.phone ?? '',
        email: resolved.email ?? '',
        website: resolved.website ?? '',
        address: resolved.address ?? {},
        logoUrl: resolved.logoUrl ?? '',
        invoiceFooter: resolved.invoiceFooter ?? '',
        termsAndConditions: resolved.defaultTermsAndConditions ?? '',
        paymentDetails: resolved.paymentDetails ?? '',
        paymentDetailsEnabled: resolved.paymentDetailsEnabled === true,
        tax: resolved.tax
          ? {
              vatNumber: resolved.tax.vatNumber,
              tin: resolved.tax.tin,
              displayLabel: resolved.tax.displayLabel,
              pricesAreTaxInclusive: resolved.tax.pricesAreTaxInclusive === true
            }
          : {},
      };
    } catch (e) {
      // non-fatal
    }

    // Return invoice data (without sensitive tenant info)
    res.status(200).json({
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        subtotal: invoice.subtotal,
        taxRate: invoice.taxRate,
        taxAmount: invoice.taxAmount,
        discountAmount: invoice.discountAmount,
        totalAmount: invoice.totalAmount,
        amountPaid: invoice.amountPaid,
        balance: invoice.balance,
        status: invoice.status,
        paymentTerms: invoice.paymentTerms,
        items: invoice.items,
        notes: invoice.notes,
        termsAndConditions: invoice.termsAndConditions,
        customer: invoice.customer,
        job: invoice.job || null,
        tenant: {
          name: invoice.tenant?.name
        },
        organization: organization || { name: invoice.tenant?.name },
        source: invoice.sourceType,
        sourceDetails: invoice.job || invoice.sale || invoice.prescription || null,
        paymentOptions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @param {import('express').Response} res
 * @param {string} invoiceId
 * @param {import('axios').AxiosError} paystackErr
 */
function sendPaystackInitializeFailure(res, invoiceId, paystackErr) {
  const paystackService = require('../services/paystackService');
  const status = paystackErr?.response?.status;
  const fromProvider = paystackService.userFacingPaystackErrorMessage(paystackErr);
  const errMessage = paystackErr?.message || '';
  console.error('[Invoice] initialize-paystack Paystack error:', {
    invoiceId,
    status,
    fromProvider: fromProvider ? `${String(fromProvider).slice(0, 120)}…` : null,
    errMessage: errMessage.slice(0, 200)
  });
  const userMessage =
    fromProvider ||
    (status === 400
      ? 'Invalid payment details. Please check the amount and email and try again.'
      : status === 401
        ? 'Payment provider authentication failed. Please contact the business.'
        : status === 403
          ? 'Payment request was rejected. Please try again or use another method.'
          : status >= 500
            ? 'Payment provider is temporarily unavailable. Please try again later.'
            : 'Could not start payment. Please try again or contact the business.');
  return res.status(502).json({
    success: false,
    message: userMessage
  });
}

/**
 * Normalize MoMo subscriber number to 233XXXXXXXXX (digits only, no +).
 * @param {string} phone
 * @returns {string}
 */
function normalizePublicMoMoPhone(phone) {
  const raw = String(phone || '').replace(/\s/g, '');
  if (!raw) return '';
  if (raw.startsWith('+233')) return raw.slice(1);
  if (raw.startsWith('233')) return raw;
  if (raw.startsWith('0')) return `233${raw.slice(1)}`;
  if (/^\d{9}$/.test(raw)) return `233${raw}`;
  return raw.replace(/^\+/, '');
}

/**
 * Persist public-link invoice payment (manual /pay and direct MoMo poll success).
 * @param {object} invoice - Invoice instance with customer
 * @param {object} opts
 */
async function recordPublicInvoicePaymentCore(invoice, {
  paymentAmount,
  paymentMethod = 'online',
  referenceNumber,
  paymentDate,
  customerEmail,
  customerName
}) {
  const totalAmount = parseFloat(invoice.totalAmount || 0);
  const newAmountPaid = parseFloat(invoice.amountPaid || 0) + paymentAmount;
  const newBalance = Math.max(totalAmount - newAmountPaid, 0);

  const effectivePaymentDate = paymentDate ? new Date(paymentDate) : new Date();
  const updatePayload = {
    amountPaid: newAmountPaid,
    balance: newBalance
  };

  if (newBalance <= 0) {
    updatePayload.status = 'paid';
    updatePayload.paidDate = effectivePaymentDate;
  } else if (invoice.status === 'draft') {
    updatePayload.status = 'sent';
  } else if (invoice.status === 'sent' && newAmountPaid > 0) {
    updatePayload.status = 'partial';
  }

  await invoice.update(updatePayload);

  const paymentNumber = `PAY-${Date.now()}`;
  const paymentData = {
    paymentNumber,
    type: 'income',
    customerId: invoice.customerId,
    tenantId: invoice.tenantId,
    amount: paymentAmount,
    paymentMethod: paymentMethod || 'online',
    paymentDate: effectivePaymentDate,
    referenceNumber: referenceNumber || `PUBLIC-${paymentNumber}`,
    status: 'completed',
    notes: `Payment via public link for invoice ${invoice.invoiceNumber}`
  };

  if (invoice.jobId) paymentData.jobId = invoice.jobId;
  if (invoice.saleId) paymentData.saleId = invoice.saleId;
  if (invoice.prescriptionId) paymentData.prescriptionId = invoice.prescriptionId;

  try {
    paymentData.metadata = {
      publicPayment: true,
      customerEmail: customerEmail || invoice.customer?.email,
      customerName: customerName || invoice.customer?.name
    };
  } catch (e) {
    // Metadata field might not exist, skip it
  }

  const payment = await Payment.create(paymentData);

  const updatedInvoice = await Invoice.findOne({
    where: { id: invoice.id },
    include: invoiceResponseIncludes()
  });

  await ensureSaleFromPaidInvoice(invoice.id, payment.id, {
    tenantId: invoice.tenantId,
    paymentMethod: paymentMethod || 'online'
  });

  try {
    await activityLogger.logPaymentReceived(updatedInvoice, paymentAmount, null);
  } catch (error) {
    console.error('Failed to log payment received activity:', error);
  }
  if (updatedInvoice.status === 'paid') {
    try {
      await activityLogger.logInvoicePaid(updatedInvoice, null);
    } catch (error) {
      console.error('Failed to log payment activity:', error);
    }
    setImmediate(() => sendInvoicePaidConfirmationToCustomer(invoice.tenantId, updatedInvoice));
  }

  try {
    await updateCustomerBalance(invoice.customerId);
  } catch (error) {
    console.error('Failed to update customer balance:', error);
  }

  if (paymentAmount > 0 && payment) {
    setImmediate(() => {
      runPaymentReceivedAutomations({
        tenantId: invoice.tenantId,
        invoice: updatedInvoice,
        customer: invoice.customer || null,
        payment,
        paymentAmount,
        paymentMethod: paymentMethod || 'online',
        actorUserId: null,
      }).catch((error) => {
        console.error('[PublicInvoicePayment] payment_received automations failed:', error?.message || error);
      });
    });
  }

  if (
    updatedInvoice.status === 'paid'
    && !updatedInvoice.jobId
    && !updatedInvoice.saleId
    && updatedInvoice.customerId
  ) {
    setImmediate(() => {
      runReviewRequestAutomations({
        tenantId: invoice.tenantId,
        sourceType: 'invoice',
        source: updatedInvoice,
        customer: updatedInvoice.customer || invoice.customer || null,
        actorUserId: null,
      }).catch((error) => {
        console.error('[PublicInvoicePayment] review_request automations failed:', error?.message || error);
      });
    });
  }

  invalidateAfterMutation(invoice.tenantId);
  invalidateInvoiceListCache(invoice.tenantId);

  return { updatedInvoice: await invoiceToResponsePayload(updatedInvoice), payment };
}

// @desc    Process payment via public link
// @route   POST /api/public/invoices/:token/pay
// @access  Public
exports.processPublicPayment = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { amount, paymentMethod, referenceNumber, paymentDate, customerEmail, customerName } = sanitizePayload(req.body);

    const invoice = await Invoice.findOne({
      where: { paymentToken: token },
      include: [
        {
          model: Customer,
          as: 'customer'
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found or invalid payment link'
      });
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This invoice has been cancelled'
      });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'This invoice has already been paid'
      });
    }

    const paymentAmount = parseFloat(amount || invoice.balance);
    const totalAmount = parseFloat(invoice.totalAmount || 0);
    const newAmountPaid = parseFloat(invoice.amountPaid || 0) + paymentAmount;
    const newBalance = Math.max(totalAmount - newAmountPaid, 0);

    if (paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than zero'
      });
    }

    if (newAmountPaid > totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount exceeds invoice total'
      });
    }

    const { updatedInvoice, payment } = await recordPublicInvoicePaymentCore(invoice, {
      paymentAmount,
      paymentMethod,
      referenceNumber,
      paymentDate,
      customerEmail,
      customerName
    });

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        invoice: updatedInvoice,
        payment: {
          id: payment.id,
          paymentNumber: payment.paymentNumber,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          paymentDate: payment.paymentDate
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Initialize Paystack payment for public invoice link
// @route   POST /api/public/invoices/:token/initialize-paystack
// @access  Public
exports.initializePaystackForInvoice = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { email, mobileNumber } = sanitizePayload(req.body);

    const invoice = await Invoice.findOne({
      where: { paymentToken: token },
      include: [{ model: Customer, as: 'customer' }]
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found or invalid payment link'
      });
    }
    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This invoice has been cancelled'
      });
    }
    if (invoice.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'This invoice has already been paid'
      });
    }

    const balance = parseFloat(invoice.balance ?? invoice.totalAmount ?? 0);
    if (balance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No balance due on this invoice'
      });
    }

    const customerEmail = email || invoice.customer?.email;
    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email is required to pay with Paystack. Please enter your email.'
      });
    }

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(503).json({
        success: false,
        message: 'Online payment is not configured'
      });
    }

    const callbackUrl = `${buildInvoicePaymentLink({ paymentToken: token }, req)}?paystack=1`;
    const orgRow = await Setting.findOne({ where: { tenantId: invoice.tenantId, key: 'organization' } });
    const orgTax = orgRow?.value?.tax || {};
    const oc = orgTax?.otherCharges || {};
    const shouldApplyCustomerCharge =
      oc?.enabled === true &&
      oc?.customerBears === true &&
      ['online_payments', 'all_payments'].includes(String(oc?.appliesTo || ''));
    const chargeRate = shouldApplyCustomerCharge ? Math.max(0, Math.min(100, parseFloat(oc?.ratePercent) || 0)) : 0;
    const chargeAmount = Math.round((balance * chargeRate / 100) * 100) / 100;
    const payableAmount = shouldApplyCustomerCharge ? balance + chargeAmount : balance;
    const amountPesewas = Math.round(payableAmount * 100);

    const tenant = await findTenantWithOptionalColumns(invoice.tenantId);
    const subaccount = tenant?.paystackSubaccountCode || null;

    const makeReference = () => `INV-${invoice.id}-${Date.now()}`.slice(0, 50);
    const metadata = {
      type: 'invoice',
      paymentToken: token,
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      paymentSurcharge: shouldApplyCustomerCharge
        ? {
            label: typeof oc?.label === 'string' && oc.label.trim() ? oc.label.trim() : 'Transaction charge',
            ratePercent: chargeRate,
            amount: chargeAmount,
            customerBears: true
          }
        : undefined,
      ...(mobileNumber ? { mobileNumber: String(mobileNumber).trim() } : {})
    };

    const buildInit = (ref, channels) =>
      paystackService.initializeTransaction({
        email: customerEmail,
        amount: amountPesewas,
        currency: 'GHS',
        callback_url: callbackUrl,
        reference: ref,
        metadata,
        channels,
        ...(subaccount ? { subaccount } : {})
      });

    let result;
    let ref = makeReference();
    try {
      // Prefer card + Paystack MoMo when the business has it enabled; many accounts return 403 if mobile_money is not allowed
      result = await buildInit(ref, ['card', 'mobile_money']);
    } catch (paystackErr) {
      const st = paystackErr?.response?.status;
      // 403 often means this integration cannot use requested channels (e.g. mobile_money not enabled). Do not retry on 400 — likely bad payload.
      const retryable = st === 403;
      if (retryable) {
        ref = makeReference();
        console.warn('[Invoice] initialize-paystack: Paystack 403 — retrying with card-only channels', {
          invoiceId: invoice.id
        });
        try {
          result = await buildInit(ref, ['card']);
        } catch (retryErr) {
          return sendPaystackInitializeFailure(res, invoice.id, retryErr);
        }
      } else {
        return sendPaystackInitializeFailure(res, invoice.id, paystackErr);
      }
    }

    if (!result.status || !result.data?.authorization_url) {
      return res.status(502).json({
        success: false,
        message: result.message || 'Failed to initialize payment'
      });
    }

    const paystackReference = result.data.reference || ref;
    const { rememberPendingInvoicePaystackReference } = require('../services/paystackPublicInvoicePayment');
    rememberPendingInvoicePaystackReference(invoice.id, paystackReference);

    res.status(200).json({
      success: true,
      data: {
        authorization_url: result.data.authorization_url,
        reference: paystackReference,
        access_code: result.data.access_code
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Paystack transaction after customer returns (webhook fallback)
// @route   POST /api/public/invoices/:token/verify-paystack
// @access  Public
exports.verifyPaystackReturnForPublicInvoice = async (req, res, next) => {
  try {
    const { token } = req.params;
    const bodyRef = sanitizePayload(req.body || {});
    const reference = String(
      bodyRef.reference || req.query?.reference || req.query?.trxref || ''
    ).trim();

    if (!reference) {
      return res.status(400).json({
        success: false,
        message:
          'Missing Paystack reference. After payment, the URL usually includes reference= or trxref=. Refresh the page or try again.'
      });
    }

    const invoiceRow = await Invoice.findOne({ where: { paymentToken: token } });
    if (!invoiceRow) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found or invalid payment link'
      });
    }

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(503).json({ success: false, message: 'Online payment is not configured' });
    }

    let result;
    try {
      result = await paystackService.verifyTransaction(reference);
    } catch (err) {
      console.error('[Invoice] verify-paystack Paystack error:', err?.message);
      return res.status(502).json({
        success: false,
        message: 'Could not reach Paystack to verify this payment. Try again shortly.'
      });
    }

    if (!result.status || !result.data) {
      return res.status(400).json({
        success: false,
        message: result.message || 'Paystack could not verify this reference.'
      });
    }

    const tx = result.data;
    const txStatus = String(tx.status || '').toLowerCase();
    if (txStatus !== 'success') {
      return res.status(200).json({
        success: true,
        data: {
          applied: false,
          paystackStatus: tx.status,
          gatewayResponse: tx.gateway_response || null,
          message:
            txStatus === 'pending'
              ? 'Payment may still be processing. Wait a moment and refresh again.'
              : 'This transaction is not completed on Paystack yet.'
        }
      });
    }

    const {
      getPaystackInvoiceLinkMetadata,
      parseInvoiceIdFromPublicPaystackReference,
      applyPaystackChargeToInvoiceFromTx
    } = require('../services/paystackPublicInvoicePayment');

    const metadata =
      typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});
    const invLink = getPaystackInvoiceLinkMetadata(metadata);
    const refInvoiceId = parseInvoiceIdFromPublicPaystackReference(reference);

    const tokenMatch = invLink.paymentToken && String(invLink.paymentToken) === String(token);
    const idMatch =
      invLink.invoiceId &&
      String(invLink.invoiceId) === String(invoiceRow.id) &&
      invLink.tenantId &&
      String(invLink.tenantId) === String(invoiceRow.tenantId);
    const refMatch = refInvoiceId && String(refInvoiceId) === String(invoiceRow.id);

    if (!tokenMatch && !idMatch && !refMatch) {
      console.warn('[Invoice] verify-paystack: reference does not match this invoice link', {
        invoiceId: invoiceRow.id
      });
      return res.status(403).json({
        success: false,
        message: 'This Paystack receipt does not match this invoice page.'
      });
    }

    const outcome = await applyPaystackChargeToInvoiceFromTx(reference, tx);

    if (outcome.duplicate || outcome.reason === 'invoice_terminal_state') {
      return res.status(200).json({
        success: true,
        data: {
          applied: false,
          alreadyRecorded: true,
          paystackStatus: 'success',
          message: 'Payment was already recorded for this invoice.'
        }
      });
    }

    if (!outcome.applied) {
      return res.status(200).json({
        success: true,
        data: {
          applied: false,
          paystackStatus: 'success',
          reason: outcome.reason,
          message: 'Could not apply this payment to the invoice.'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        applied: true,
        paystackStatus: 'success',
        reference
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Paystack charge for workspace invoice (mobile/app return path; webhook fallback)
// @route   POST /api/invoices/:id/verify-paystack
// @access  Private
exports.verifyPaystackChargeForInvoice = async (req, res, next) => {
  try {
    const invoiceId = req.params.id;
    const bodyRef = sanitizePayload(req.body || {});
    const reference = String(bodyRef.reference || req.query?.reference || '').trim();

    const invoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoiceId }),
      include: [{ model: Customer, as: 'customer' }, ...invoiceBranchIncludes()]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    try {
      assertShopRecordAccess(req, invoice);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const totalAmount = parseFloat(invoice.totalAmount || 0);
    const paidAmount = parseFloat(invoice.amountPaid || 0);
    const balance = Math.max(totalAmount - paidAmount, 0);
    if (invoice.status === 'paid' || balance <= 0) {
      return res.status(200).json({
        success: true,
        data: { invoice, applied: false, alreadyRecorded: true }
      });
    }

    const now = Date.now();
    const last = paystackInvoiceCheckLastById.get(invoiceId) || 0;
    if (now - last < PAYSTACK_INVOICE_CHECK_THROTTLE_MS) {
      return res.status(200).json({
        success: true,
        data: { invoice, applied: false, throttled: true }
      });
    }
    paystackInvoiceCheckLastById.set(invoiceId, now);

    const { reconcileInvoicePaystackPayment } = require('../services/paystackPublicInvoicePayment');
    const outcome = await reconcileInvoicePaystackPayment(invoice, { reference: reference || undefined });

    const freshInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoiceId }),
      include: invoiceResponseIncludes()
    });

    if (outcome.applied) {
      try {
        invalidateInvoiceListCache(req.tenantId);
        invalidateAfterMutation(req.tenantId, ['invoices', 'sales', 'dashboard']);
      } catch (cacheErr) {
        console.error('[Invoice] verify-paystack cache invalidation error:', cacheErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        invoice: freshInvoice || invoice,
        applied: Boolean(outcome.applied),
        alreadyRecorded: Boolean(outcome.duplicate),
        reason: outcome.reason || null,
        reference: outcome.reference || reference || null,
        paystackStatus: outcome.paystackStatus || (outcome.applied ? 'success' : null)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Initiate Paystack Mobile Money payment for a workspace invoice
// @route   POST /api/invoices/:id/paystack-mobile-money
// @access  Private
exports.paystackMobileMoneyForInvoice = async (req, res, next) => {
  try {
    const invoiceId = req.params.id;
    const { phoneNumber, provider } = sanitizePayload(req.body || {});

    if (!phoneNumber || !provider) {
      return res.status(400).json({
        success: false,
        message: 'phoneNumber and provider are required'
      });
    }

    const invoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoiceId }),
      include: [{ model: Customer, as: 'customer' }, ...invoiceBranchIncludes()]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    try {
      assertShopRecordAccess(req, invoice);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot collect payment on a cancelled invoice' });
    }
    if (invoice.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Invoice is already fully paid' });
    }

    const totalAmount = parseFloat(invoice.totalAmount || 0);
    const currentPaid = parseFloat(invoice.amountPaid || 0);
    const balanceDue = Math.max(totalAmount - currentPaid, 0);
    if (!Number.isFinite(balanceDue) || balanceDue <= 0) {
      return res.status(400).json({ success: false, message: 'No balance due on this invoice' });
    }

    const tenant = await findTenantWithOptionalColumns(invoice.tenantId);
    const logicalProvider = String(provider || '').toUpperCase();

    // Prefer Hubtel / tenant MTN when available; Paystack charge path below stays as-is.
    try {
      const { resolveMoMoCollector } = require('../services/paymentCollectionRouter');
      const directRail = resolveMoMoCollector(tenant, { allowPaystack: false });
      if (directRail.rail === 'hubtel' || directRail.rail === 'mtn') {
        const externalId = `INV-${invoice.id}-${Date.now()}`.slice(0, 64);
        const direct = await initiateDirectMoMoCharge({
          tenant,
          phoneNumber,
          amount: balanceDue,
          currency: 'GHS',
          provider: logicalProvider,
          externalId,
          payerMessage: `Invoice ${invoice.invoiceNumber || invoice.id}`,
          customerName: invoice.customer?.name || 'Customer',
          customerEmail: invoice.customer?.email || req.user?.email || undefined
        });
        if (direct.success) {
          await Invoice.update(
            {
              metadata: sequelize.fn(
                'jsonb_set',
                sequelize.fn('COALESCE', sequelize.col('metadata'), '{}'),
                '{mobileMoneyRef}',
                JSON.stringify(
                  buildMobileMoneyRefMeta(direct, {
                    invoiceId: invoice.id,
                    tenantId: invoice.tenantId
                  })
                )
              )
            },
            { where: { id: invoice.id } }
          );
          return res.status(200).json({
            success: true,
            data: {
              reference: direct.referenceId,
              referenceId: direct.referenceId,
              provider: direct.provider,
              status: direct.status || 'PENDING',
              rail: direct.rail,
              message: direct.message || 'Approve the mobile money prompt on the customer phone.'
            }
          });
        }
      }
    } catch (directErr) {
      console.warn('[Invoice] Direct collector attempt failed; using Paystack:', directErr?.message);
    }

    const customerEmail =
      invoice.customer?.email ||
      req.user?.email ||
      tenant?.metadata?.companyEmail ||
      tenant?.email ||
      null;

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Customer or user email is required for mobile money payment'
      });
    }

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(503).json({
        success: false,
        message: 'Paystack is not configured'
      });
    }

    const reference = `INV-${invoice.id}-${Date.now()}`.slice(0, 50);

    const orgRow = await Setting.findOne({ where: { tenantId: invoice.tenantId, key: 'organization' } });
    const orgTax = orgRow?.value?.tax || {};
    const oc = orgTax?.otherCharges || {};
    const shouldApplyCustomerCharge =
      oc?.enabled === true &&
      oc?.customerBears === true &&
      ['online_payments', 'all_payments'].includes(String(oc?.appliesTo || ''));
    const chargeRate = shouldApplyCustomerCharge ? Math.max(0, Math.min(100, parseFloat(oc?.ratePercent) || 0)) : 0;
    const chargeAmount = Math.round((balanceDue * chargeRate / 100) * 100) / 100;
    const payableAmount = shouldApplyCustomerCharge ? balanceDue + chargeAmount : balanceDue;

    const result = await paystackService.chargeMobileMoney({
      email: customerEmail,
      amount: payableAmount,
      reference,
      phoneNumber,
      provider: logicalProvider,
      metadata: {
        type: 'invoice',
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        paymentToken: invoice.paymentToken || undefined,
        payment_source: 'invoice_direct_mobile_money',
        mobileNumber: String(phoneNumber).trim(),
        mobileMoneyProvider: logicalProvider,
        paymentSurcharge: shouldApplyCustomerCharge
          ? {
              label: typeof oc?.label === 'string' && oc.label.trim() ? oc.label.trim() : 'Transaction charge',
              ratePercent: chargeRate,
              amount: chargeAmount,
              customerBears: true
            }
          : undefined
      },
      ...(tenant?.paystackSubaccountCode ? { subaccount: tenant.paystackSubaccountCode } : {})
    });

    if (!result || result.status === false) {
      return res.status(502).json({
        success: false,
        message: result?.message || 'Failed to initiate mobile money payment'
      });
    }

    const { rememberPendingInvoicePaystackReference } = require('../services/paystackPublicInvoicePayment');
    rememberPendingInvoicePaystackReference(invoice.id, reference);

    const existingMetadata = invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
    await invoice.update({
      metadata: {
        ...existingMetadata,
        paystackMobileMoney: {
          ...(existingMetadata.paystackMobileMoney || {}),
          reference,
          provider: logicalProvider,
          phoneNumber,
          amount: balanceDue,
          initiatedAt: new Date().toISOString()
        }
      }
    });

    const nextAction = paystackService.normalizeChargeNextAction(result);
    res.status(200).json({
      success: true,
      data: {
        reference,
        provider: logicalProvider,
        status: nextAction.status || 'PENDING',
        message: nextAction.message,
        displayText: nextAction.displayText,
        requiresOtp: nextAction.requiresOtp,
      }
    });
  } catch (error) {
    console.error('[Invoice] paystackMobileMoneyForInvoice error:', {
      invoiceId: req.params?.id,
      error: error.message
    });
    next(error);
  }
};

/**
 * Submit Paystack charge OTP for invoice MoMo Automatic.
 * @route POST /api/invoices/:id/paystack-submit-otp
 */
exports.submitPaystackOtpForInvoice = async (req, res, next) => {
  try {
    const invoiceId = req.params.id;
    const { otp, reference: bodyReference } = sanitizePayload(req.body || {});
    const cleanedOtp = String(otp || '').trim();
    if (!cleanedOtp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const invoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoiceId }),
      include: [{ model: Customer, as: 'customer' }, ...invoiceBranchIncludes()]
    });
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    try {
      assertShopRecordAccess(req, invoice);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const reference = String(
      bodyReference
      || invoice.metadata?.paystackMobileMoney?.reference
      || ''
    ).trim();
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'No Paystack mobile money reference found for this invoice. Start the payment again.'
      });
    }

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(503).json({ success: false, message: 'Paystack is not configured' });
    }

    const result = await paystackService.submitChargeOtp({ otp: cleanedOtp, reference });
    if (!result || result.status === false) {
      return res.status(400).json({
        success: false,
        message: result?.message || 'Invalid or expired OTP. Try again or restart the payment.'
      });
    }

    const existingMetadata = invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
    await invoice.update({
      metadata: {
        ...existingMetadata,
        paystackMobileMoney: {
          ...(existingMetadata.paystackMobileMoney || {}),
          reference,
          otpSubmittedAt: new Date().toISOString(),
          lastChargeStatus: result?.data?.status || null
        }
      }
    });

    const nextAction = paystackService.normalizeChargeNextAction(result);
    return res.status(200).json({
      success: true,
      data: {
        reference,
        status: nextAction.status || 'PENDING',
        message: nextAction.message,
        displayText: nextAction.displayText,
        requiresOtp: nextAction.requiresOtp,
      }
    });
  } catch (error) {
    console.error('[Invoice] submitPaystackOtpForInvoice error:', {
      invoiceId: req.params?.id,
      error: error.message
    });
    next(error);
  }
};

// @desc    Initiate direct mobile money collection for public invoice (tenant MoMo APIs)
// @route   POST /api/public/invoices/:token/mobile-money/initiate
// @access  Public
exports.initiateMobileMoneyForPublicInvoice = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { phoneNumber, provider } = sanitizePayload(req.body || {});

    const invoice = await Invoice.findOne({
      where: { paymentToken: token },
      include: [{ model: Customer, as: 'customer' }]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found or invalid payment link' });
    }
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This invoice has been cancelled' });
    }
    if (invoice.status === 'paid') {
      return res.status(400).json({ success: false, message: 'This invoice has already been paid' });
    }

    const normalized = normalizePublicMoMoPhone(phoneNumber);
    if (!normalized || normalized.length < 12) {
      return res.status(400).json({ success: false, message: 'Enter a valid mobile money number (e.g. 0XX XXX XXXX).' });
    }

    const balance = parseFloat(invoice.balance ?? invoice.totalAmount ?? 0);
    if (balance <= 0) {
      return res.status(400).json({ success: false, message: 'No balance due on this invoice' });
    }

    const detectedProvider = (provider && String(provider).trim()) || mobileMoneyService.detectProvider(normalized);
    if (detectedProvider === 'UNKNOWN') {
      return res.status(400).json({
        success: false,
        message: 'Could not detect network. Choose MTN or AirtelTigo and check the number.'
      });
    }

    const tenant = await Tenant.findByPk(invoice.tenantId);
    if (!tenant) {
      return res.status(503).json({
        success: false,
        message: 'This business is not available for payment collection.'
      });
    }

    const externalId = `INV-PUB-${invoice.id}-${Date.now()}`.slice(0, 64);
    const result = await initiateDirectMoMoCharge({
      tenant,
      phoneNumber: normalized,
      amount: balance,
      currency: 'GHS',
      provider: detectedProvider,
      externalId,
      payerMessage: `Invoice ${invoice.invoiceNumber || invoice.id}`,
      customerName: invoice.customer?.name || 'Customer',
      customerEmail: invoice.customer?.email || undefined
    });

    if (!result.success) {
      // Public invoice: Prefer clear setup errors. Paystack redirect remains available via paymentOptions.paystack.
      const status = result.rail === 'none' || result.allowPaystackFallback ? 503 : 400;
      return res.status(status).json({
        success: false,
        message: result.error || 'Failed to start mobile money payment',
        rail: result.rail,
        allowPaystackFallback: Boolean(result.allowPaystackFallback)
      });
    }

    await Invoice.update(
      {
        metadata: sequelize.fn(
          'jsonb_set',
          sequelize.fn('COALESCE', sequelize.col('metadata'), '{}'),
          '{mobileMoneyRef}',
          JSON.stringify(
            buildMobileMoneyRefMeta(result, {
              publicToken: token,
              amountDue: balance,
              invoiceId: invoice.id,
              tenantId: invoice.tenantId
            })
          )
        )
      },
      { where: { id: invoice.id } }
    );

    res.status(200).json({
      success: true,
      data: {
        referenceId: result.referenceId,
        provider: result.provider,
        status: result.status,
        message: result.message,
        rail: result.rail,
        invoiceId: invoice.id
      }
    });
  } catch (error) {
    console.error('[Invoice] public MoMo initiate error:', error);
    next(error);
  }
};

// @desc    Poll direct mobile money status for public invoice; completes invoice when successful
// @route   POST /api/public/invoices/:token/mobile-money/poll
// @access  Public
exports.pollMobileMoneyForPublicInvoice = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { token } = req.params;

    const invoice = await Invoice.findOne({
      where: { paymentToken: token },
      include: [{ model: Customer, as: 'customer' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found or invalid payment link' });
    }

    if (invoice.status === 'paid') {
      await transaction.commit();
      return res.status(200).json({
        success: true,
        data: { paymentStatus: 'SUCCESSFUL', invoiceStatus: 'paid', alreadyPaid: true }
      });
    }

    const mobileMoneyRef = invoice.metadata?.mobileMoneyRef;
    if (!mobileMoneyRef?.referenceId || !mobileMoneyRef?.provider) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No mobile money payment in progress for this invoice'
      });
    }

    const tenantForPoll = await Tenant.findByPk(invoice.tenantId);
    if (!tenantForPoll) {
      await transaction.rollback();
      return res.status(503).json({
        success: false,
        message: 'This business is not available for payment collection.'
      });
    }
    if (mobileMoneyRef.provider === 'MTN' && !getResolvedMtnConfigForTenant(tenantForPoll)) {
      await transaction.rollback();
      return res.status(503).json({
        success: false,
        message: 'MTN MoMo is not configured for this business.'
      });
    }
    if (mobileMoneyRef.provider === 'HUBTEL' && !getResolvedHubtelConfigForTenant(tenantForPoll)) {
      await transaction.rollback();
      return res.status(503).json({
        success: false,
        message: 'Hubtel is not configured for this business.'
      });
    }

    const statusResult = await checkDirectMoMoStatus({
      tenant: tenantForPoll,
      referenceId: mobileMoneyRef.referenceId,
      provider: mobileMoneyRef.provider
    });

    const updatedMeta = {
      ...invoice.metadata,
      mobileMoneyRef: {
        ...mobileMoneyRef,
        status: statusResult.status,
        lastChecked: new Date().toISOString(),
        financialTransactionId: statusResult.financialTransactionId
      }
    };

    if (statusResult.status !== 'SUCCESSFUL') {
      await invoice.update({ metadata: updatedMeta }, { transaction });
      await transaction.commit();
      return res.status(200).json({
        success: true,
        data: {
          paymentStatus: statusResult.status,
          invoiceStatus: invoice.status,
          provider: mobileMoneyRef.provider,
          referenceId: mobileMoneyRef.referenceId
        }
      });
    }

    await invoice.update({ metadata: updatedMeta }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('[Invoice] public MoMo poll error:', error);
    return next(error);
  }

  try {
    const { token } = req.params;
    const invoiceRow = await Invoice.findOne({
      where: { paymentToken: token },
      include: [{ model: Customer, as: 'customer' }]
    });
    if (!invoiceRow) {
      return res.status(404).json({ success: false, message: 'Invoice not found or invalid payment link' });
    }

    const mobileMoneyRef = invoiceRow.metadata?.mobileMoneyRef;
    if (!mobileMoneyRef?.referenceId) {
      return res.status(400).json({
        success: false,
        message: 'No mobile money payment in progress for this invoice'
      });
    }

    if (invoiceRow.status === 'paid') {
      return res.status(200).json({
        success: true,
        data: { paymentStatus: 'SUCCESSFUL', invoiceStatus: 'paid' }
      });
    }

    const paymentAmount = parseFloat(invoiceRow.balance ?? invoiceRow.totalAmount ?? 0);
    if (paymentAmount <= 0) {
      return res.status(200).json({
        success: true,
        data: { paymentStatus: 'SUCCESSFUL', invoiceStatus: invoiceRow.status }
      });
    }

    const { updatedInvoice, payment } = await recordPublicInvoicePaymentCore(invoiceRow, {
      paymentAmount,
      paymentMethod: 'mobile_money',
      referenceNumber: mobileMoneyRef.referenceId,
      customerEmail: invoiceRow.customer?.email,
      customerName: invoiceRow.customer?.name
    });

    return res.status(200).json({
      success: true,
      data: {
        paymentStatus: 'SUCCESSFUL',
        invoiceStatus: updatedInvoice.status,
        invoice: updatedInvoice,
        payment: {
          id: payment.id,
          paymentNumber: payment.paymentNumber,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod
        }
      }
    });
  } catch (error) {
    console.error('[Invoice] public MoMo finalize error:', error);
    return next(error);
  }
};

// @desc    Cancel invoice
// @route   POST /api/invoices/:id/cancel
// @access  Private
exports.cancelInvoice = async (req, res, next) => {
  try {
    const invoice = await findVisibleInvoiceById(req, req.params.id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel paid invoice'
      });
    }

    await invoice.update({
      status: 'cancelled'
    });

    const updatedInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoice.id }),
      include: invoiceResponseIncludes()
    });

    try {
      await updateCustomerBalance(invoice.customerId);
    } catch (error) {
      console.error('Failed to update customer balance after invoice cancel:', error);
    }

    invalidateAfterMutation(req.tenantId);
    invalidateInvoiceListCache(req.tenantId);
    res.status(200).json({
      success: true,
      data: await invoiceToResponsePayload(updatedInvoice)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get invoice statistics
// @route   GET /api/invoices/stats/summary
// @access  Private
exports.getInvoiceStats = async (req, res, next) => {
  try {
    const baseWhere = await buildInvoiceVisibilityWhere(req);
    const paidWhere = { ...baseWhere, status: 'paid' };
    const unpaidWhere = { ...baseWhere, status: { [Op.in]: ['sent', 'draft'] } };
    const overdueWhere = { ...baseWhere, status: 'overdue' };
    const revenueWhere = {
      ...baseWhere,
      status: { [Op.ne]: 'cancelled' },
      amountPaid: { [Op.gt]: 0 },
    };
    const outstandingWhere = {
      ...baseWhere,
      status: { [Op.notIn]: ['paid', 'cancelled'] },
      balance: { [Op.gt]: 0 },
    };

    const [
      totalInvoices,
      paidInvoices,
      unpaidInvoices,
      overdueInvoices,
      totalRevenue,
      outstandingAmount,
    ] = await Promise.all([
      Invoice.count({ where: baseWhere }),
      Invoice.count({ where: paidWhere }),
      Invoice.count({ where: unpaidWhere }),
      Invoice.count({ where: overdueWhere }),
      Invoice.sum('amountPaid', { where: revenueWhere }),
      Invoice.sum('balance', { where: outstandingWhere }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalInvoices,
        paidInvoices,
        unpaidInvoices,
        overdueInvoices,
        totalRevenue: totalRevenue || 0,
        outstandingAmount: outstandingAmount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};







