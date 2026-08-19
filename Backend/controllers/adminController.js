const crypto = require('crypto');
const dayjs = require('dayjs');
const jwt = require('jsonwebtoken');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const config = require('../config/config');
const { plans: PLANS_CONFIG } = require('../config/plans');
const {
  DEFAULT_PLAN_SEAT_LIMITS,
  DEFAULT_PLAN_BRANCH_LIMITS,
  PLAN_SEAT_PRICING,
  DEFAULT_STORAGE_LIMITS,
  STORAGE_PRICING,
} = require('../config/features');
const { getPagination } = require('../utils/paginationUtils');
const { resolvePaymentNotesFromBody } = require('../utils/paymentNoteUtils');
const {
  Tenant,
  User,
  UserTenant,
  Notification,
  Vendor,
  Job,
  InviteToken,
  SubscriptionPlan,
  SubscriptionPayment,
  TenantAccessAudit,
  Setting,
  Product,
  ProductVariant,
  ProductCategory,
  SaleItem,
  Invoice,
  Customer,
  Shop,
  Sale,
  JournalEntry,
  Barcode,
  OnlineProductListing,
  StockTransfer,
  StockCountItem,
  QuoteItem,
  Quote,
  QuoteActivity,
  SaleActivity,
} = require('../models');
const {
  resolveBillingStatus,
  recordSubscriptionPaymentAndActivate,
  resetTenantTrial,
  toBillingPayload,
  normalizePlan,
  normalizeBillingPeriod,
  normalizePaymentStatus,
  PAID_PLANS,
} = require('../services/subscriptionBillingService');
const emailService = require('../services/emailService');
const { inviteTenantEmail } = require('../services/emailTemplates');
const { getFrontendBaseUrl } = require('../utils/frontendUrl');
const {
  ACCESS_STATES,
  normalizeFeatureOverrides,
  getTenantEffectiveEntitlements
} = require('../utils/tenantEntitlements');
const { ENTERPRISE_TIER_IDS, getEnterpriseTier } = require('../config/enterpriseTiers');
const { buildEnterprisePaymentMetadata } = require('../services/subscriptionPlanCatalogService');
const { getSeatUsageSummary } = require('../utils/seatLimitHelper');
const { getStorageUsageSummary } = require('../utils/storageLimitHelper');
const { invalidateProductListCache, invalidateInvoiceListCache, invalidateSaleListCache, invalidateAfterMutation } = require('../middleware/cache');
const { updateCustomerBalance } = require('../services/customerBalanceService');
const { getRecentSlowOperations } = require('../utils/performanceLogger');
const { permanentlyDeleteTenant } = require('../services/permanentDeleteTenantService');

const PLAN_PRICING = {
  trial: 0,
  starter: 129,
  professional: 250,
  enterprise: 0, // contact sales
};

const PLAN_ALIASES = {
  free: 'trial',
  standard: 'starter',
  pro: 'professional',
  launch: 'starter',
  scale: 'professional',
};

const TENANT_CLEANUP_MAX_BATCH = 50;

const normalizeCleanupIds = (ids) => (
  Array.isArray(ids)
    ? Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))
    : []
).slice(0, TENANT_CLEANUP_MAX_BATCH);

const ensureTenantCleanupConfirmed = (req, tenant) => {
  const confirmSlug = String(req.body?.confirmSlug || '').trim();
  if (!confirmSlug || confirmSlug !== tenant.slug) {
    const error = new Error('Type the tenant slug exactly to confirm cleanup.');
    error.statusCode = 400;
    error.code = 'CONFIRM_SLUG_REQUIRED';
    throw error;
  }
};

const createTenantCleanupAudit = async ({
  tenantId,
  actorUserId,
  action,
  before,
  after,
  reason,
  transaction
}) => TenantAccessAudit.create({
  tenantId,
  actorUserId: actorUserId || null,
  action,
  before,
  after,
  reason: reason || null
}, { transaction });

const archiveProductForCleanup = async ({ product, actorUserId, reason, linkCounts, transaction }) => {
  const existingMetadata = product.metadata || {};
  await product.update({
    isActive: false,
    metadata: {
      ...existingMetadata,
      superadminCleanup: {
        action: 'archived',
        archivedAt: new Date().toISOString(),
        archivedBy: actorUserId || null,
        reason: reason || null,
        linkCounts
      }
    }
  }, { transaction });
};

const getProductCleanupLinkCounts = async (tenantId, productId, transaction) => {
  const variants = await ProductVariant.findAll({
    where: { productId },
    attributes: ['id'],
    transaction
  });
  const variantIds = variants.map((variant) => variant.id);
  const [
    saleItems,
    stockTransfers,
    stockCountItems,
    quoteItems
  ] = await Promise.all([
    SaleItem.count({
      where: {
        [Op.or]: [
          { productId },
          ...(variantIds.length ? [{ productVariantId: { [Op.in]: variantIds } }] : [])
        ]
      },
      transaction
    }),
    StockTransfer
      ? StockTransfer.count({
          where: {
            tenantId,
            [Op.or]: [
              { sourceProductId: productId },
              { destinationProductId: productId },
              ...(variantIds.length ? [
                { sourceVariantId: { [Op.in]: variantIds } },
                { destinationVariantId: { [Op.in]: variantIds } }
              ] : [])
            ]
          },
          transaction
        })
      : Promise.resolve(0),
    StockCountItem
      ? StockCountItem.count({
          where: {
            tenantId,
            [Op.or]: [
              { productId },
              ...(variantIds.length ? [{ productVariantId: { [Op.in]: variantIds } }] : [])
            ]
          },
          transaction
        })
      : Promise.resolve(0),
    QuoteItem ? QuoteItem.count({ where: { productId }, transaction }) : Promise.resolve(0)
  ]);

  return {
    variants: variantIds.length,
    saleItems,
    stockTransfers,
    stockCountItems,
    quoteItems,
    hasHistoricalLinks: saleItems > 0 || stockTransfers > 0 || stockCountItems > 0 || quoteItems > 0
  };
};

const cleanupProductRecord = async ({ tenant, productId, actorUserId, reason, transaction }) => {
  const product = await Product.findOne({
    where: { tenantId: tenant.id, id: productId },
    transaction
  });

  if (!product) {
    return { id: productId, status: 'not_found', message: 'Product not found for tenant' };
  }

  const before = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    shopId: product.shopId,
    isActive: product.isActive
  };
  const linkCounts = await getProductCleanupLinkCounts(tenant.id, product.id, transaction);

  if (linkCounts.hasHistoricalLinks) {
    await archiveProductForCleanup({ product, actorUserId, reason, linkCounts, transaction });
    await createTenantCleanupAudit({
      tenantId: tenant.id,
      actorUserId,
      action: 'tenant_product_archived_by_superadmin',
      before,
      after: { id: product.id, isActive: false, linkCounts },
      reason,
      transaction
    });
    return {
      id: product.id,
      name: product.name,
      status: 'archived',
      message: 'Product was archived because it has sales, stock, or quote history.',
      linkCounts
    };
  }

  try {
    const variants = await ProductVariant.findAll({
      where: { productId: product.id },
      attributes: ['id'],
      transaction
    });
    const variantIds = variants.map((variant) => variant.id);
    if (variantIds.length > 0) {
      await Barcode.destroy({
        where: { tenantId: tenant.id, productVariantId: { [Op.in]: variantIds } },
        transaction
      });
      await OnlineProductListing.destroy({
        where: { tenantId: tenant.id, productVariantId: { [Op.in]: variantIds } },
        transaction
      });
      await ProductVariant.destroy({
        where: { productId: product.id },
        transaction
      });
    }
    await Barcode.destroy({ where: { tenantId: tenant.id, productId: product.id }, transaction });
    await OnlineProductListing.destroy({ where: { tenantId: tenant.id, productId: product.id }, transaction });
    await product.destroy({ transaction });
    await createTenantCleanupAudit({
      tenantId: tenant.id,
      actorUserId,
      action: 'tenant_product_deleted_by_superadmin',
      before,
      after: { id: product.id, deleted: true, linkCounts },
      reason,
      transaction
    });
    return {
      id: product.id,
      name: product.name,
      status: 'deleted',
      message: 'Product was permanently deleted.'
    };
  } catch (error) {
    await archiveProductForCleanup({ product, actorUserId, reason, linkCounts, transaction });
    await createTenantCleanupAudit({
      tenantId: tenant.id,
      actorUserId,
      action: 'tenant_product_archived_by_superadmin',
      before,
      after: {
        id: product.id,
        isActive: false,
        linkCounts,
        fallbackFromDeleteError: error?.name || error?.message || 'delete_failed'
      },
      reason,
      transaction
    });
    return {
      id: product.id,
      name: product.name,
      status: 'archived',
      message: 'Product delete was blocked by related data, so it was archived instead.',
      linkCounts
    };
  }
};

const invoiceHasPayments = (invoice) => (
  ['paid', 'partial'].includes(String(invoice.status || '').toLowerCase()) ||
  parseFloat(invoice.amountPaid || 0) > 0
);

const archiveInvoiceForCleanup = async ({ invoice, actorUserId, reason, transaction }) => {
  await invoice.update({
    status: 'cancelled',
    notes: [
      invoice.notes,
      `Superadmin archived this invoice on ${new Date().toISOString()}${actorUserId ? ` by ${actorUserId}` : ''}${reason ? `: ${reason}` : ''}.`
    ].filter(Boolean).join('\n\n')
  }, { transaction });
};

const cleanupInvoiceRecord = async ({ tenant, invoiceId, actorUserId, reason, transaction }) => {
  const invoice = await Invoice.findOne({
    where: { tenantId: tenant.id, id: invoiceId },
    transaction
  });

  if (!invoice) {
    return { id: invoiceId, status: 'not_found', message: 'Invoice not found for tenant' };
  }

  const before = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    amountPaid: invoice.amountPaid,
    totalAmount: invoice.totalAmount,
    customerId: invoice.customerId,
    saleId: invoice.saleId,
    jobId: invoice.jobId,
    prescriptionId: invoice.prescriptionId
  };

  if (invoiceHasPayments(invoice)) {
    await archiveInvoiceForCleanup({ invoice, actorUserId, reason, transaction });
    await createTenantCleanupAudit({
      tenantId: tenant.id,
      actorUserId,
      action: 'tenant_invoice_archived_by_superadmin',
      before,
      after: { id: invoice.id, status: 'cancelled', archived: true },
      reason,
      transaction
    });
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: 'archived',
      message: 'Paid or partially paid invoice was cancelled and archived instead of hard-deleted.'
    };
  }

  await JournalEntry.destroy({
    where: {
      tenantId: tenant.id,
      sourceId: invoice.id,
      source: { [Op.in]: ['invoice_revenue', 'invoice_payment'] }
    },
    transaction
  });
  await invoice.destroy({ transaction });
  await createTenantCleanupAudit({
    tenantId: tenant.id,
    actorUserId,
    action: 'tenant_invoice_deleted_by_superadmin',
    before,
    after: { id: invoice.id, deleted: true },
    reason,
    transaction
  });

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: 'deleted',
    message: 'Unpaid invoice was permanently deleted.'
  };
};

const appendCleanupNote = (existingNotes, recordType, actorUserId, reason) => [
  existingNotes,
  `Superadmin archived this ${recordType} on ${new Date().toISOString()}${actorUserId ? ` by ${actorUserId}` : ''}${reason ? `: ${reason}` : ''}.`
].filter(Boolean).join('\n\n');

const restoreSaleStockForCleanup = async (sale, transaction) => {
  if (['cancelled', 'refunded'].includes(String(sale.status || '').toLowerCase())) {
    return false;
  }

  for (const item of sale.items || []) {
    if (!item.productId && !item.productVariantId) {
      continue;
    }

    const product = item.productId ? await Product.findByPk(item.productId, { transaction }) : null;
    if (!item.productVariantId && product && product.trackStock !== false) {
      const newQuantity = parseFloat(product.quantityOnHand || 0) + parseFloat(item.quantity || 0);
      await product.update({ quantityOnHand: newQuantity }, { transaction });
    }

    if (item.productVariantId) {
      const variant = await ProductVariant.findByPk(item.productVariantId, { transaction });
      const parent = product || (item.productId ? await Product.findByPk(item.productId, { transaction }) : null);
      if (variant && parent?.trackStock !== false && variant.trackStock !== false) {
        const newVariantQuantity = parseFloat(variant.quantityOnHand || 0) + parseFloat(item.quantity || 0);
        await variant.update({ quantityOnHand: newVariantQuantity }, { transaction });
      }
    }
  }

  return true;
};

const cleanupSaleRecord = async ({ tenant, saleId, actorUserId, reason, transaction }) => {
  const sale = await Sale.findOne({
    where: { tenantId: tenant.id, id: saleId },
    include: [
      { model: SaleItem, as: 'items', required: false },
      { model: Invoice, as: 'invoice', required: false }
    ],
    transaction
  });

  if (!sale) {
    return { id: saleId, status: 'not_found', message: 'Sale/order not found for tenant' };
  }

  const before = {
    id: sale.id,
    saleNumber: sale.saleNumber,
    status: sale.status,
    orderStatus: sale.orderStatus,
    amountPaid: sale.amountPaid,
    total: sale.total,
    customerId: sale.customerId,
    invoiceId: sale.invoiceId
  };
  const hasHistoricalLinks = (sale.items || []).length > 0 || !!sale.invoice || parseFloat(sale.amountPaid || 0) > 0;

  if (!hasHistoricalLinks) {
    await SaleActivity.destroy({ where: { tenantId: tenant.id, saleId: sale.id }, transaction });
    await SaleItem.destroy({ where: { saleId: sale.id }, transaction });
    await sale.destroy({ transaction });
    await createTenantCleanupAudit({
      tenantId: tenant.id,
      actorUserId,
      action: 'tenant_sale_deleted_by_superadmin',
      before,
      after: { id: sale.id, deleted: true },
      reason,
      transaction
    });
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      status: 'deleted',
      message: 'Unlinked sale/order was permanently deleted.'
    };
  }

  const stockRestored = await restoreSaleStockForCleanup(sale, transaction);
  await sale.update({
    status: 'cancelled',
    orderStatus: sale.orderStatus ? 'cancelled' : sale.orderStatus,
    notes: appendCleanupNote(sale.notes, 'sale/order', actorUserId, reason),
    metadata: {
      ...(sale.metadata || {}),
      superadminCleanup: {
        action: 'archived',
        archivedAt: new Date().toISOString(),
        archivedBy: actorUserId || null,
        reason: reason || null,
        stockRestored,
        invoiceId: sale.invoiceId || null,
        itemCount: (sale.items || []).length
      }
    }
  }, { transaction });
  await createTenantCleanupAudit({
    tenantId: tenant.id,
    actorUserId,
    action: 'tenant_sale_archived_by_superadmin',
    before,
    after: {
      id: sale.id,
      status: 'cancelled',
      orderStatus: sale.orderStatus ? 'cancelled' : sale.orderStatus,
      archived: true,
      stockRestored
    },
    reason,
    transaction
  });

  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    status: 'archived',
    message: stockRestored
      ? 'Sale/order was cancelled, archived, and stock was restored.'
      : 'Sale/order was archived as cancelled without changing stock again.'
  };
};

const getQuoteCleanupLinkCounts = async (tenantId, quoteId, transaction) => {
  const [jobs, invoices, sales] = await Promise.all([
    Job.count({ where: { tenantId, quoteId }, transaction }),
    Invoice.count({ where: { tenantId, quoteId }, transaction }),
    Sale.count({ where: { tenantId, metadata: { quoteId } }, transaction })
  ]);

  return {
    jobs,
    invoices,
    sales,
    hasHistoricalLinks: jobs > 0 || invoices > 0 || sales > 0
  };
};

const cleanupQuoteRecord = async ({ tenant, quoteId, actorUserId, reason, transaction }) => {
  const quote = await Quote.findOne({
    where: { tenantId: tenant.id, id: quoteId },
    transaction
  });

  if (!quote) {
    return { id: quoteId, status: 'not_found', message: 'Quote not found for tenant' };
  }

  const before = {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    title: quote.title,
    status: quote.status,
    customerId: quote.customerId
  };
  const linkCounts = await getQuoteCleanupLinkCounts(tenant.id, quote.id, transaction);

  if (quote.status === 'accepted' || linkCounts.hasHistoricalLinks) {
    const targetStatus = quote.status === 'draft' ? 'expired' : 'declined';
    await quote.update({
      status: targetStatus,
      notes: appendCleanupNote(quote.notes, 'quote', actorUserId, reason)
    }, { transaction });
    await QuoteActivity.create({
      tenantId: tenant.id,
      quoteId: quote.id,
      type: 'status_change',
      subject: 'Superadmin cleanup',
      notes: 'Quote was archived by superadmin cleanup because it has linked jobs, invoices, sales, or accepted history.',
      createdBy: actorUserId || null,
      metadata: {
        superadminCleanup: true,
        reason: reason || null,
        linkCounts
      }
    }, { transaction });
    await createTenantCleanupAudit({
      tenantId: tenant.id,
      actorUserId,
      action: 'tenant_quote_archived_by_superadmin',
      before,
      after: { id: quote.id, status: targetStatus, archived: true, linkCounts },
      reason,
      transaction
    });
    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      status: 'archived',
      message: 'Quote was archived because it has linked jobs, invoices, sales, or accepted history.',
      linkCounts
    };
  }

  await QuoteActivity.destroy({ where: { tenantId: tenant.id, quoteId: quote.id }, transaction });
  await QuoteItem.destroy({ where: { tenantId: tenant.id, quoteId: quote.id }, transaction });
  await quote.destroy({ transaction });
  await createTenantCleanupAudit({
    tenantId: tenant.id,
    actorUserId,
    action: 'tenant_quote_deleted_by_superadmin',
    before,
    after: { id: quote.id, deleted: true, linkCounts },
    reason,
    transaction
  });

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: 'deleted',
    message: 'Unlinked quote was permanently deleted.'
  };
};

const buildCleanupSearchWhere = (tenantId, search, fields) => {
  const where = { tenantId };
  const term = String(search || '').trim();
  if (term) {
    where[Op.or] = fields.map((field) => ({ [field]: { [Op.iLike]: `%${term}%` } }));
  }
  return where;
};

const normalizePlanId = (plan = '') => PLAN_ALIASES[String(plan).trim().toLowerCase()] || String(plan).trim().toLowerCase();
const MANUAL_PAYMENT_METHODS = new Set(['bank_transfer', 'mobile_money', 'card', 'cash', 'cheque', 'other']);
const TRIAL_PLAN_IDS = ['trial', 'free'];

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const pesewasToGhs = (amount) => roundCurrency((Number(amount) || 0) / 100);

const isEnterpriseCloudRenewalPayment = (payment) =>
  normalizePlanId(payment?.plan) === 'enterprise' &&
  payment?.metadata?.paymentType === 'enterprise_cloud_renewal';

const isRecurringRevenuePayment = (payment) => {
  if (normalizePlanId(payment?.plan) !== 'enterprise') return true;
  return isEnterpriseCloudRenewalPayment(payment);
};

const getPaymentEstimatedMrrGhs = (payment) => {
  if (!isRecurringRevenuePayment(payment)) return 0;
  const amountGhs = pesewasToGhs(payment?.amount);
  return payment?.billingPeriod === 'yearly' ? roundCurrency(amountGhs / 12) : amountGhs;
};

const isCurrentPeriodSubscriptionPayment = (payment, at = new Date()) => {
  if (!payment?.periodStart || !payment?.periodEnd) return false;
  const periodStart = new Date(payment.periodStart);
  const periodEnd = new Date(payment.periodEnd);
  return periodStart <= at && periodEnd > at;
};

const pickLatestPaymentByTenant = (payments = []) => {
  const latestByTenant = new Map();
  payments.forEach((payment) => {
    if (!payment?.tenantId || latestByTenant.has(payment.tenantId)) return;
    latestByTenant.set(payment.tenantId, payment);
  });
  return latestByTenant;
};

const selectEnterprisePaymentsForRevenue = (payments = [], tenantIds = [], at = new Date()) => {
  const currentPeriodPayments = payments.filter((payment) => isCurrentPeriodSubscriptionPayment(payment, at));
  const tenantsWithCurrentPayment = new Set(
    currentPeriodPayments.map((payment) => payment.tenantId).filter(Boolean)
  );
  const latestByTenant = pickLatestPaymentByTenant(payments);
  const fallbackPayments = tenantIds
    .filter((tenantId) => !tenantsWithCurrentPayment.has(tenantId))
    .map((tenantId) => latestByTenant.get(tenantId))
    .filter(Boolean);

  return [...currentPeriodPayments, ...fallbackPayments];
};

const getPaymentMethodFromPayment = (payment) => payment?.metadata?.paymentMethod || payment?.provider || null;

const parseOptionalDate = (value, fieldName) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error(`${fieldName} must be a valid date`), { statusCode: 400 });
  }
  return parsed;
};

const amountGhsToPesewas = (value) => {
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error('amount must be a valid non-negative number'), { statusCode: 400 });
  }
  return Math.round(amount * 100);
};

const resolveManualPaymentAmountPesewas = (body, fallbackAmountGhs = null) => {
  if (body?.amountPesewas != null && body.amountPesewas !== '') {
    const amountPesewas = Number(body.amountPesewas);
    if (!Number.isInteger(amountPesewas) || amountPesewas < 0) {
      throw Object.assign(new Error('amountPesewas must be a valid non-negative integer'), { statusCode: 400 });
    }
    return amountPesewas;
  }
  const amountGhs = body?.amount ?? fallbackAmountGhs;
  return amountGhsToPesewas(amountGhs);
};

/**
 * Ensures a SubscriptionPlan row exists for canonical plan IDs from config/plans.js
 * (e.g. enterprise missing when DB was partially seeded).
 * @param {string} planId - Normalized plan id (lowercase)
 * @returns {Promise<object|null>}
 */
async function ensureCanonicalSubscriptionPlan(planId) {
  const existing = await SubscriptionPlan.findOne({
    where: { planId },
    attributes: ['id', 'planId', 'isActive']
  });
  if (existing) return existing;
  const def = PLANS_CONFIG.find((p) => p.id === planId);
  if (!def) return null;
  try {
    return await SubscriptionPlan.create({
      planId: def.id,
      order: def.order ?? 0,
      name: def.name,
      description: def.description || '',
      price: def.price || {},
      highlights: def.highlights || [],
      marketing: def.marketing || {},
      onboarding: def.onboarding || {},
      seatLimit: DEFAULT_PLAN_SEAT_LIMITS[def.id] ?? null,
      seatPricePerAdditional: PLAN_SEAT_PRICING[def.id] ?? null,
      branchLimit: DEFAULT_PLAN_BRANCH_LIMITS[def.id] ?? null,
      storageLimitMB: DEFAULT_STORAGE_LIMITS[def.id] ?? null,
      storagePrice100GB: STORAGE_PRICING[def.id] ?? null,
      isActive: true,
      metadata: {}
    });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return SubscriptionPlan.findOne({
        where: { planId },
        attributes: ['id', 'planId', 'isActive']
      });
    }
    throw e;
  }
}

const generateToken = (id) =>
  jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expire,
  });

const serverStartedAt = new Date();

const formatDuration = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${remaining}s`);
  return parts.join(' ');
};

/**
 * Prefer business/company email from tenant metadata, then first membership (owner) email.
 * Matches how Admin Tenants identify workspaces.
 * @param {object|null} tenant
 * @param {string|null} primaryUserEmail
 * @returns {string|null}
 */
const resolveTenantIdentityEmail = (tenant, primaryUserEmail = null) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const candidates = [metadata.email, metadata.companyEmail, primaryUserEmail];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

/**
 * Attach tenant/user display fields to in-memory slow operations for Admin Health.
 * @param {{ operations?: object[] } & object} performance
 * @returns {Promise<object>}
 */
const enrichSlowOperationsWithIdentity = async (performance) => {
  const operations = Array.isArray(performance?.operations) ? performance.operations : [];
  if (!operations.length) return performance;

  const tenantIds = [...new Set(operations.map((op) => op.tenantId).filter(Boolean))];
  const userIds = [...new Set(operations.map((op) => op.userId).filter(Boolean))];

  const [tenants, users, firstMemberships] = await Promise.all([
    tenantIds.length
      ? Tenant.findAll({
          where: { id: { [Op.in]: tenantIds } },
          attributes: ['id', 'name', 'slug', 'metadata'],
        })
      : Promise.resolve([]),
    userIds.length
      ? User.findAll({
          where: { id: { [Op.in]: userIds } },
          attributes: ['id', 'email', 'name'],
        })
      : Promise.resolve([]),
    tenantIds.length
      ? UserTenant.findAll({
          where: { tenantId: { [Op.in]: tenantIds } },
          attributes: ['tenantId', 'userId'],
          include: [{ model: User, as: 'user', attributes: ['email'], required: true }],
          order: [['createdAt', 'ASC']],
        })
      : Promise.resolve([]),
  ]);

  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const primaryEmailsByTenant = {};
  firstMemberships.forEach((ut) => {
    if (primaryEmailsByTenant[ut.tenantId] == null && ut.user?.email) {
      primaryEmailsByTenant[ut.tenantId] = ut.user.email;
    }
  });

  return {
    ...performance,
    operations: operations.map((op) => {
      const tenant = op.tenantId ? tenantsById.get(op.tenantId) : null;
      const user = op.userId ? usersById.get(op.userId) : null;
      const primaryUserEmail = op.tenantId ? primaryEmailsByTenant[op.tenantId] || null : null;
      return {
        ...op,
        tenantName: tenant?.name || null,
        tenantSlug: tenant?.slug || null,
        tenantEmail: resolveTenantIdentityEmail(tenant, primaryUserEmail),
        userName: user?.name || null,
        userEmail: user?.email || null,
      };
    }),
  };
};

exports.getPlatformSummary = async (req, res, next) => {
  try {
    const sevenDaysAgo = dayjs().subtract(7, 'day').toDate();

    const [
      totalTenants,
      activeTenants,
      trialTenants,
      totalUsers,
      newTenantsLast7Days,
      totalMemberships
    ] = await Promise.all([
      Tenant.count(),
      Tenant.count({ where: { status: 'active' } }),
      Tenant.count({ where: { plan: 'trial' } }),
      User.count(),
      Tenant.count({ where: { createdAt: { [Op.gte]: sevenDaysAgo } } }),
      UserTenant.count()
    ]);

    const avgUsersPerTenant =
      totalTenants > 0 ? Number((totalMemberships / totalTenants).toFixed(1)) : 0;

    res.status(200).json({
      success: true,
      data: {
        totalTenants,
        activeTenants,
        trialTenants,
        totalUsers,
        newTenantsLast7Days,
        avgUsersPerTenant
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getTenants = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const { plan, status, search } = req.query;

    const where = {};
    if (plan) {
      const normalizedPlan = normalizePlanId(plan);
      const aliasKeysForPlan = Object.entries(PLAN_ALIASES)
        .filter(([, canonical]) => canonical === normalizedPlan)
        .map(([alias]) => alias);
      const matchedPlans = Array.from(new Set([normalizedPlan, ...aliasKeysForPlan]));
      where.plan = matchedPlans.length > 1 ? { [Op.in]: matchedPlans } : normalizedPlan;
    }
    if (status) {
      where.status = status;
    }
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const [tenants, total] = await Promise.all([
      Tenant.findAll({
        where,
        attributes: [
          'id',
          'name',
          'slug',
          'plan',
          'status',
          'createdAt',
          'trialEndsAt',
          'metadata',
          [sequelize.fn('COUNT', sequelize.col('memberships.id')), 'userCount']
        ],
        include: [
          {
            model: UserTenant,
            as: 'memberships',
            attributes: []
          }
        ],
        group: ['Tenant.id'],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        subQuery: false
      }),
      Tenant.count({ where })
    ]);

    const tenantIds = tenants.map((t) => t.id);
    const primaryEmailsByTenant = {};
    if (tenantIds.length > 0) {
      const firstMemberships = await UserTenant.findAll({
        where: { tenantId: tenantIds },
        attributes: ['tenantId', 'userId'],
        include: [{ model: User, as: 'user', attributes: ['email'], required: true }],
        order: [['createdAt', 'ASC']]
      });
      firstMemberships.forEach((ut) => {
        if (primaryEmailsByTenant[ut.tenantId] == null && ut.user?.email) {
          primaryEmailsByTenant[ut.tenantId] = ut.user.email;
        }
      });
    }

    const serialized = tenants.map((tenant) => {
      const item = tenant.toJSON();
      item.userCount = Number(item.userCount) || 0;
      item.primaryUserEmail = primaryEmailsByTenant[tenant.id] || null;
      return item;
    });

    res.status(200).json({
      success: true,
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Invite a new tenant (platform admin only). Creates an invite token and sends email with signup link.
 * Invitee opens /signup?token=... and completes signup; backend then creates tenant + user as owner.
 * @route   POST /api/admin/tenants/invite
 */
exports.inviteTenant = async (req, res, next) => {
  try {
    const { email, name } = req.body || {};
    const inviteRequestId = `adm_inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }

    const existingInvite = await InviteToken.findOne({
      where: {
        email: normalizedEmail,
        inviteType: 'new_tenant',
        used: false,
        tenantId: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    if (existingInvite) {
      const frontendUrl = getFrontendBaseUrl(req);
      const inviteUrl = `${frontendUrl}/signup?token=${existingInvite.token}`;
      return res.status(400).json({
        success: false,
        message: 'An active invite already exists for this email. Revoke it or use the existing link.',
        data: { inviteUrl, invite: existingInvite },
      });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await InviteToken.create({
      token,
      email: normalizedEmail,
      name: name ? String(name).trim() || null : null,
      role: 'admin',
      inviteType: 'new_tenant',
      tenantId: null,
      createdBy: req.user.id,
      expiresAt,
      used: false,
    });
    console.log('[Admin Invite] Invite created', {
      inviteRequestId,
      inviteId: invite.id,
      inviteType: 'new_tenant',
      email: emailService.maskEmail(normalizedEmail),
      createdBy: req.user?.id,
      expiresAt: invite.expiresAt,
    });

    const frontendUrl = getFrontendBaseUrl(req);
    const inviteUrl = `${frontendUrl}/signup?token=${token}`;
    const inviterName = req.user?.name || req.user?.email || 'African Business Suite';

    setImmediate(async () => {
      try {
        const platformConfig = await emailService.resolvePlatformConfig?.();
        const platformDiag = platformConfig ? emailService.getConfigDiagnostic(platformConfig) : null;
        console.log('[Admin Invite Email] Dispatch started', {
          inviteRequestId,
          inviteId: invite.id,
          to: emailService.maskEmail(normalizedEmail),
          inviterUserId: req.user?.id,
          provider: platformConfig?.provider || 'unknown',
          fromEmail: platformDiag?.effectiveFromMasked || '(empty)',
          fromMatchesSmtpUser: platformDiag?.fromMatchesSmtpUser || 'n/a',
          frontendUrl,
        });
        const { subject, html, text } = inviteTenantEmail(normalizedEmail, inviteUrl, inviterName);
        const result = await emailService.sendPlatformMessage(
          normalizedEmail,
          subject,
          html,
          text,
          [],
          {
            categories: ['transactional', 'signup'],
            context: {
              requestId: req.id || req.headers?.['x-request-id'],
              inviteRequestId,
              inviteId: invite.id,
              userId: req.user?.id,
              source: 'platform_admin_tenant_invite',
            },
          }
        );
        if (!result?.success) {
          throw new Error(result?.error || 'Invite email send failed');
        }
        console.log('[Admin Invite Email] Dispatch success', {
          inviteRequestId,
          inviteId: invite.id,
          to: emailService.maskEmail(normalizedEmail),
          messageId: result?.messageId || null,
          provider: platformConfig?.provider || 'unknown',
        });
      } catch (err) {
        console.error('[Admin Invite Email] Dispatch failed', {
          inviteRequestId,
          inviteId: invite.id,
          to: emailService.maskEmail(normalizedEmail),
          error: emailService.maskEmailsInText(err?.message),
        });
      }
    });

    res.status(201).json({
      success: true,
      data: { invite, inviteUrl },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List pending tenant invites created by platform admins.
 * @route   GET /api/admin/tenants/invites
 */
exports.getTenantInvites = async (req, res, next) => {
  try {
    const invites = await InviteToken.findAll({
      where: {
        inviteType: 'new_tenant',
        tenantId: null,
        used: false,
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      success: true,
      data: invites,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Revoke a pending tenant invite.
 * @route   DELETE /api/admin/tenants/invites/:id
 */
exports.revokeTenantInvite = async (req, res, next) => {
  try {
    const invite = await InviteToken.findOne({
      where: {
        id: req.params.id,
        inviteType: 'new_tenant',
        tenantId: null,
      },
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invite not found',
      });
    }

    if (invite.used) {
      return res.status(400).json({
        success: false,
        message: 'Cannot revoke an already used invite',
      });
    }

    await invite.destroy();

    return res.status(200).json({
      success: true,
      message: 'Invite revoked successfully',
    });
  } catch (error) {
    return next(error);
  }
};

exports.bootstrapPlatformAdmin = async (req, res, next) => {
  const { name, email, password } = req.body || {};

  try {
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    const existingAdmin = await User.findOne({
      where: { isPlatformAdmin: true },
    });

    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: 'A platform administrator already exists. Please sign in instead.',
      });
    }

    const duplicateEmail = await User.findOne({
      where: { email: normalizedEmail },
    });

    if (duplicateEmail) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }

    let user;
    let defaultTenant;

    const transaction = await sequelize.transaction();

    try {
      [defaultTenant] = await Tenant.findOrCreate({
        where: { slug: 'default' },
        defaults: {
          name: 'Default Tenant',
          plan: 'trial',
          status: 'active',
          metadata: {},
        },
        transaction,
      });

      user = await User.create(
        {
          name: trimmedName,
          email: normalizedEmail,
          password,
          role: 'admin',
          isPlatformAdmin: true,
        },
        { transaction }
      );

      await UserTenant.create(
        {
          tenantId: defaultTenant.id,
          userId: user.id,
          role: 'owner',
          status: 'active',
          isDefault: true,
          invitedBy: null,
          invitedAt: new Date(),
          joinedAt: new Date(),
        },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    const memberships = await UserTenant.findAll({
      where: { userId: user.id },
      include: [{ model: Tenant, as: 'tenant' }],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'ASC'],
      ],
    });

    const token = generateToken(user.id);
    const safeUser = user.toJSON();
    const safeMemberships = memberships.map((membership) => membership.toJSON());

    return res.status(201).json({
      success: true,
      data: {
        user: safeUser,
        token,
        memberships: safeMemberships,
        defaultTenantId: defaultTenant.id,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getTenantMetrics = async (req, res, next) => {
  try {
    const sinceDate = dayjs().subtract(30, 'day').startOf('day').toDate();

    const signupTrendRaw = await sequelize.query(
      `
        SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
        FROM tenants
        WHERE "createdAt" >= :since
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt")
      `,
      {
        replacements: { since: sinceDate },
        type: QueryTypes.SELECT
      }
    );

    const signupTrend = signupTrendRaw.map((row) => ({
      date: dayjs(row.date).format('YYYY-MM-DD'),
      count: Number(row.count) || 0
    }));

    const planDistributionRaw = await Tenant.findAll({
      attributes: [
        'plan',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['plan'],
      raw: true
    });

    const statusDistributionRaw = await Tenant.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const planCounts = planDistributionRaw.reduce((acc, row) => {
      const normalizedPlan = normalizePlanId(row.plan || 'unknown');
      acc[normalizedPlan] = (acc[normalizedPlan] || 0) + (Number(row.count) || 0);
      return acc;
    }, {});
    const planDistribution = Object.entries(planCounts).map(([plan, count]) => ({ plan, count }));

    const statusDistribution = statusDistributionRaw.map((row) => ({
      status: row.status || 'unknown',
      count: Number(row.count) || 0
    }));

    const totalByPlan = planDistribution.reduce((acc, item) => acc + item.count, 0);

    res.status(200).json({
      success: true,
      data: {
        signupTrend,
        planDistribution,
        statusDistribution,
        total: totalByPlan
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getPlatformAlerts = async (req, res, next) => {
  try {
    const today = dayjs().startOf('day');
    const trialThreshold = today.add(7, 'day').endOf('day').toDate();

    const upcomingTrials = await Tenant.findAll({
      where: {
        trialEndsAt: {
          [Op.not]: null,
          [Op.gte]: today.toDate(),
          [Op.lte]: trialThreshold
        },
        status: 'active'
      },
      attributes: ['id', 'name', 'plan', 'trialEndsAt', 'createdAt'],
      order: [['trialEndsAt', 'ASC']],
      limit: 10
    });

    const attentionRequired = await Tenant.findAll({
      where: {
        status: {
          [Op.notIn]: ['active']
        }
      },
      attributes: ['id', 'name', 'plan', 'status', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit: 10
    });

    res.status(200).json({
      success: true,
      data: {
        upcomingTrials: upcomingTrials.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          plan: tenant.plan,
          trialEndsAt: tenant.trialEndsAt,
          createdAt: tenant.createdAt
        })),
        attentionRequired: attentionRequired.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          plan: tenant.plan,
          status: tenant.status,
          updatedAt: tenant.updatedAt
        })),
        openCriticalHealthIssues: await require('../services/systemHealthIssueService')
          .countOpenCriticalIssues()
          .catch(() => 0),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getTenantVendors = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }
    const vendors = await Vendor.findAll({
      where: { tenantId: tenant.id },
      attributes: ['id', 'name', 'company'],
      order: [['name', 'ASC']]
    });
    res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    next(error);
  }
};

exports.getTenantJobs = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }
    const jobs = await Job.findAll({
      where: { tenantId: tenant.id },
      attributes: ['id', 'jobNumber', 'title'],
      order: [['jobNumber', 'DESC']],
      limit: 200
    });
    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
};

exports.getTenantById = async (req, res, next) => {
  try {
    const { Setting } = require('../models');
    
    const tenant = await Tenant.scope('withOptionalColumns').findByPk(req.params.id, {
      include: [
        {
          model: UserTenant,
          as: 'memberships',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'role', 'isActive', 'lastLogin']
            }
          ]
        }
      ]
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Get organization settings (includes logo) for branding display
    // This shows the logo that tenants manage themselves in Settings
    let organizationSettings = {};
    try {
      const organizationSetting = await Setting.findOne({
        where: { tenantId: tenant.id, key: 'organization' }
      });
      organizationSettings = organizationSetting ? organizationSetting.value : {};
    } catch (error) {
      // If organization settings don't exist, use empty object
      console.warn('Could not fetch organization settings for tenant:', tenant.id);
    }

    const tenantData = tenant.toJSON();
    tenantData.organizationSettings = organizationSettings;
    tenantData.accessControl = await getTenantEffectiveEntitlements(tenant, {
      logContext: 'admin_tenant_detail',
    });

    try {
      tenantData.seatUsage = await getSeatUsageSummary(tenant.id);
    } catch (seatErr) {
      console.warn('[admin] seat usage summary failed:', seatErr?.message);
      tenantData.seatUsage = null;
    }
    try {
      tenantData.storageUsage = await getStorageUsageSummary(tenant.id);
    } catch (storageErr) {
      console.warn('[admin] storage usage summary failed:', storageErr?.message);
      tenantData.storageUsage = null;
    }

    res.status(200).json({
      success: true,
      data: tenantData
    });
  } catch (error) {
    next(error);
  }
};

exports.updateTenantAccess = async (req, res, next) => {
  try {
    const { plan, accessState, featureOverrides, note, enterpriseTier } = req.body || {};
    const tenant = await Tenant.findByPk(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const beforeSnapshot = {
      plan: tenant.plan,
      accessState: tenant?.metadata?.entitlements?.accessState || null,
      featureOverrides: tenant?.metadata?.entitlements?.featureOverrides || {},
      enterpriseTier: tenant?.metadata?.entitlements?.enterpriseTier || null,
      note: tenant?.metadata?.entitlements?.note || '',
    };

    if (plan != null) {
      const nextPlan = normalizePlanId(plan);
      if (!nextPlan) {
        return res.status(400).json({
          success: false,
          message: 'Plan cannot be empty'
        });
      }
      let planRow = await SubscriptionPlan.findOne({
        where: { planId: nextPlan },
        attributes: ['id']
      });
      if (!planRow) {
        planRow = await ensureCanonicalSubscriptionPlan(nextPlan);
      }
      if (!planRow) {
        return res.status(400).json({
          success: false,
          message: `Plan "${nextPlan}" does not exist`
        });
      }
      tenant.plan = nextPlan;
    }

    if (accessState != null && !ACCESS_STATES.includes(accessState)) {
      return res.status(400).json({
        success: false,
        message: `Invalid accessState. Expected one of: ${ACCESS_STATES.join(', ')}`
      });
    }

    const metadata = tenant.metadata && typeof tenant.metadata === 'object' ? { ...tenant.metadata } : {};
    const entitlements = metadata.entitlements && typeof metadata.entitlements === 'object'
      ? { ...metadata.entitlements }
      : {};

    if (accessState != null) {
      entitlements.accessState = accessState;
    }
    if (featureOverrides !== undefined) {
      entitlements.featureOverrides = normalizeFeatureOverrides(featureOverrides);
    }
    if (note != null) {
      entitlements.note = String(note).trim().slice(0, 500);
    }

    const { billingOverride, billingGraceDays } = req.body || {};
    if (billingOverride !== undefined) {
      if (billingOverride === null || billingOverride === '') {
        delete entitlements.billingOverride;
      } else if (['unlocked', 'locked'].includes(String(billingOverride))) {
        entitlements.billingOverride = String(billingOverride);
      } else {
        return res.status(400).json({
          success: false,
          message: 'billingOverride must be unlocked, locked, or null',
        });
      }
    }
    if (billingGraceDays !== undefined) {
      const days = Number(billingGraceDays);
      if (!Number.isFinite(days) || days < 0 || days > 90) {
        return res.status(400).json({
          success: false,
          message: 'billingGraceDays must be between 0 and 90',
        });
      }
      entitlements.billingGraceDays = days;
    }

    const effectivePlan = tenant.plan;
    if (effectivePlan === 'enterprise' && entitlements.billingOverride !== 'locked') {
      entitlements.billingOverride = 'unlocked';
    }
    if (enterpriseTier !== undefined) {
      if (enterpriseTier === null || enterpriseTier === '') {
        delete entitlements.enterpriseTier;
      } else if (effectivePlan === 'enterprise') {
        const tierKey = String(enterpriseTier).toLowerCase();
        if (!ENTERPRISE_TIER_IDS.includes(tierKey)) {
          return res.status(400).json({
            success: false,
            message: `Invalid enterprise tier. Expected one of: ${ENTERPRISE_TIER_IDS.join(', ')}`,
          });
        }
        entitlements.enterpriseTier = tierKey;
      } else {
        delete entitlements.enterpriseTier;
      }
    } else if (effectivePlan !== 'enterprise') {
      delete entitlements.enterpriseTier;
    }

    entitlements.updatedAt = new Date().toISOString();
    entitlements.updatedBy = req.user?.id || null;

    metadata.entitlements = entitlements;
    tenant.metadata = metadata;
    if (typeof tenant.changed === 'function') {
      tenant.changed('metadata', true);
    }

    await tenant.save();

    if (plan != null) {
      const [subSetting] = await Setting.findOrCreate({
        where: { tenantId: tenant.id, key: 'subscription' },
        defaults: {
          tenantId: tenant.id,
          key: 'subscription',
          value: {},
        },
      });
      const prevSub =
        subSetting.value && typeof subSetting.value === 'object' ? { ...subSetting.value } : {};
      const nextPlan = tenant.plan;
      prevSub.plan = nextPlan;
      prevSub.status =
        nextPlan === 'trial'
          ? prevSub.status === 'active'
            ? 'trialing'
            : prevSub.status || 'trialing'
          : 'active';
      subSetting.value = prevSub;
      await subSetting.save();
    }

    const afterSnapshot = {
      plan: tenant.plan,
      accessState: metadata?.entitlements?.accessState || null,
      featureOverrides: metadata?.entitlements?.featureOverrides || {},
      enterpriseTier: metadata?.entitlements?.enterpriseTier || null,
      note: metadata?.entitlements?.note || '',
    };

    await TenantAccessAudit.create({
      tenantId: tenant.id,
      actorUserId: req.user?.id || null,
      action: 'tenant_access_updated',
      before: beforeSnapshot,
      after: afterSnapshot,
      reason: metadata?.entitlements?.note || null
    });

    const freshTenant = await Tenant.findByPk(tenant.id);
    const accessControl = await getTenantEffectiveEntitlements(freshTenant, {
      logContext: 'admin_update_tenant_access',
    });
    const billing = toBillingPayload(await resolveBillingStatus(freshTenant));

    res.status(200).json({
      success: true,
      data: {
        id: tenant.id,
        plan: tenant.plan,
        metadata: tenant.metadata,
        accessControl,
        billing,
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset a tenant's free trial (grant another ~1 month)
 * @route   POST /api/admin/tenants/:id/reset-trial
 * @access  Platform admin (tenants.update)
 */
exports.resetTenantTrial = async (req, res, next) => {
  try {
    const result = await resetTenantTrial(req.params.id, {
      actorUserId: req.user?.id || null,
      reason: req.body?.reason,
    });

    const freshTenant = await Tenant.scope('withOptionalColumns').findByPk(req.params.id, {
      attributes: ['id', 'name', 'slug', 'plan', 'status', 'trialEndsAt', 'metadata', 'createdAt'],
    });

    res.status(200).json({
      success: true,
      message: 'Free trial reset successfully',
      data: {
        ...result,
        tenant: freshTenant,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errorCode: error.errorCode || undefined,
      });
    }
    next(error);
  }
};

exports.getTenantSubscriptionPayments = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, { attributes: ['id', 'name', 'plan'] });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const payments = await SubscriptionPayment.findAll({
      where: { tenantId: tenant.id },
      order: [['createdAt', 'DESC']],
      limit,
    });
    const billing = toBillingPayload(await resolveBillingStatus(tenant.id));
    return res.status(200).json({
      success: true,
      data: { payments, billing },
    });
  } catch (error) {
    next(error);
  }
};

exports.createTenantSubscriptionPayment = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    const plan = normalizePlan(req.body?.plan);
    const billingPeriod = normalizeBillingPeriod(req.body?.billingPeriod);
    const statusInput = req.body?.status == null ? 'success' : String(req.body.status).trim().toLowerCase();
    const status = normalizePaymentStatus(statusInput);
    if (status !== statusInput) {
      return res.status(400).json({
        success: false,
        message: 'status must be one of: success, pending, failed, refunded',
      });
    }
    const paymentMethod = String(req.body?.paymentMethod || 'bank_transfer').trim().toLowerCase();
    if (!MANUAL_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'paymentMethod must be one of: bank_transfer, mobile_money, card, cash, cheque, other',
      });
    }
    const paymentDate = parseOptionalDate(req.body?.paymentDate || req.body?.date, 'paymentDate') || new Date();
    const periodStart = parseOptionalDate(req.body?.periodStart, 'periodStart') || paymentDate;
    const requestedPeriodEnd = parseOptionalDate(req.body?.periodEnd, 'periodEnd');
    const enterpriseTier = req.body?.enterpriseTier;
    if (!PAID_PLANS.has(plan)) {
      return res.status(400).json({
        success: false,
        message: 'plan must be starter, professional, or enterprise',
      });
    }
    if (plan === 'enterprise') {
      const tierKey = String(enterpriseTier || '').toLowerCase();
      if (!ENTERPRISE_TIER_IDS.includes(tierKey)) {
        return res.status(400).json({
          success: false,
          message: `enterpriseTier must be one of: ${ENTERPRISE_TIER_IDS.join(', ')}`,
        });
      }
    }

    let paymentMetadata = {
      source: 'admin_manual',
      paymentMethod,
      paymentDate: paymentDate.toISOString(),
      enterpriseTier: plan === 'enterprise' ? String(enterpriseTier).toLowerCase() : null,
    };
    let periodEnd = requestedPeriodEnd;
    let fallbackAmountGhs = null;

    if (plan === 'enterprise') {
      const tierKey = String(enterpriseTier).toLowerCase();
      const existingMeta =
        tenant.metadata?.entitlements?.enterpriseBilling || {};
      const enterpriseMeta = buildEnterprisePaymentMetadata({
        enterpriseTier: tierKey,
        paymentType: req.body?.paymentType || 'enterprise_license',
        at: paymentDate,
        existingCloudNextDueAt: existingMeta.cloudNextDueAt,
        existingCloudRenewalStartsAt: existingMeta.cloudRenewalStartsAt,
      });
      paymentMetadata = { ...paymentMetadata, ...enterpriseMeta };
      if (periodEnd == null && enterpriseMeta.periodEnd) {
        periodEnd = enterpriseMeta.periodEnd;
      }
      fallbackAmountGhs = enterpriseMeta.suggestedAmountGhs ?? null;
    }

    const amount = resolveManualPaymentAmountPesewas(req.body, fallbackAmountGhs);

    const activation = await recordSubscriptionPaymentAndActivate({
      tenantId: tenant.id,
      plan,
      billingPeriod: plan === 'enterprise' ? 'yearly' : billingPeriod,
      amount,
      currency: req.body?.currency || 'GHS',
      provider: 'manual',
      providerReference: req.body?.providerReference || req.body?.reference || null,
      status,
      recordedBy: req.user?.id || null,
      notes: resolvePaymentNotesFromBody(req.body || {}) || null,
      periodStart,
      periodEnd,
      metadata: paymentMetadata,
    });

    if (plan === 'enterprise' && status === 'success') {
      const metadata = tenant.metadata && typeof tenant.metadata === 'object' ? { ...tenant.metadata } : {};
      const entitlements = metadata.entitlements && typeof metadata.entitlements === 'object'
        ? { ...metadata.entitlements }
        : {};
      const tier = getEnterpriseTier(enterpriseTier);
      entitlements.enterpriseTier = String(enterpriseTier).toLowerCase();
      entitlements.enterpriseBilling = {
        enterpriseTier: tier?.id || String(enterpriseTier).toLowerCase(),
        licenseFeeGhs: paymentMetadata.licenseFeeGhs ?? tier?.licenseFeeGhs ?? null,
        cloudPlanAnnualGhs: paymentMetadata.cloudPlanAnnualGhs ?? tier?.cloudPlanAnnualGhs ?? null,
        cloudRenewalStartsAt: paymentMetadata.cloudRenewalStartsAt || null,
        cloudNextDueAt: paymentMetadata.cloudNextDueAt || null,
        lastPaymentType: paymentMetadata.paymentType || 'enterprise_license',
        updatedAt: new Date().toISOString(),
      };
      entitlements.updatedAt = new Date().toISOString();
      entitlements.updatedBy = req.user?.id || null;
      metadata.entitlements = entitlements;
      await tenant.update({ metadata });
    }

    const billing = toBillingPayload(await resolveBillingStatus(tenant.id));

    return res.status(201).json({
      success: true,
      message: activation.alreadyRecorded
        ? 'Payment already recorded for this reference'
        : 'Subscription payment recorded',
      data: {
        payment: activation.payment,
        alreadyRecorded: activation.alreadyRecorded,
        billing,
      },
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

exports.getTenantAccessAudit = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, { attributes: ['id'] });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const logs = await TenantAccessAudit.findAll({
      where: { tenantId: tenant.id },
      include: [
        {
          model: User,
          as: 'actor',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};

exports.getTenantCleanupRecords = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      attributes: ['id', 'name', 'slug']
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const search = String(req.query.search || req.query.q || '').trim();
    const productWhere = buildCleanupSearchWhere(tenant.id, search, ['name', 'sku', 'barcode']);
    const invoiceWhere = buildCleanupSearchWhere(tenant.id, search, ['invoiceNumber', 'status']);
    const saleWhere = buildCleanupSearchWhere(tenant.id, search, ['saleNumber', 'status', 'orderStatus']);
    const quoteWhere = buildCleanupSearchWhere(tenant.id, search, ['quoteNumber', 'title', 'status']);
    const [
      products,
      invoices,
      sales,
      quotes,
      productCount,
      invoiceCount,
      saleCount,
      quoteCount
    ] = await Promise.all([
      Product.findAll({
        where: productWhere,
        attributes: ['id', 'name', 'sku', 'barcode', 'shopId', 'quantityOnHand', 'isActive', 'createdAt'],
        include: [
          { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
          { model: ProductCategory, as: 'category', attributes: ['id', 'name'], required: false }
        ],
        order: [['createdAt', 'DESC']],
        limit
      }),
      Invoice.findAll({
        where: invoiceWhere,
        attributes: ['id', 'invoiceNumber', 'status', 'amountPaid', 'totalAmount', 'customerId', 'saleId', 'jobId', 'createdAt'],
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'company'], required: false },
          { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
          { model: Sale, as: 'sale', attributes: ['id', 'saleNumber'], required: false }
        ],
        order: [['createdAt', 'DESC']],
        limit
      }),
      Sale.findAll({
        where: saleWhere,
        attributes: ['id', 'saleNumber', 'status', 'orderStatus', 'amountPaid', 'total', 'customerId', 'invoiceId', 'shopId', 'createdAt'],
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'company'], required: false },
          { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
          { model: Invoice, as: 'invoice', attributes: ['id', 'invoiceNumber', 'status', 'amountPaid', 'totalAmount'], required: false }
        ],
        order: [['createdAt', 'DESC']],
        limit
      }),
      Quote.findAll({
        where: quoteWhere,
        attributes: ['id', 'quoteNumber', 'title', 'status', 'totalAmount', 'customerId', 'shopId', 'createdAt'],
        include: [
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'company'], required: false },
          { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false }
        ],
        order: [['createdAt', 'DESC']],
        limit
      }),
      Product.count({ where: productWhere }),
      Invoice.count({ where: invoiceWhere }),
      Sale.count({ where: saleWhere }),
      Quote.count({ where: quoteWhere })
    ]);

    res.status(200).json({
      success: true,
      data: {
        tenant,
        products,
        invoices,
        sales,
        quotes,
        counts: {
          products: productCount,
          invoices: invoiceCount,
          sales: saleCount,
          quotes: quoteCount
        },
        hasMore: {
          products: productCount > products.length,
          invoices: invoiceCount > invoices.length,
          sales: saleCount > sales.length,
          quotes: quoteCount > quotes.length
        },
        filters: { search },
        limits: { maxBatchSize: TENANT_CLEANUP_MAX_BATCH, listLimit: limit }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.cleanupTenantProducts = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      attributes: ['id', 'name', 'slug']
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    ensureTenantCleanupConfirmed(req, tenant);

    const productIds = normalizeCleanupIds(req.body?.productIds || req.body?.ids);
    if (productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one product to clean up.'
      });
    }

    const reason = String(req.body?.reason || 'Superadmin tenant cleanup').trim();
    const results = await sequelize.transaction(async (transaction) => {
      const output = [];
      for (const productId of productIds) {
        output.push(await cleanupProductRecord({
          tenant,
          productId,
          actorUserId: req.user?.id || null,
          reason,
          transaction
        }));
      }
      return output;
    });

    invalidateProductListCache(tenant.id);
    invalidateAfterMutation(tenant.id);

    console.log('[AdminCleanup] products tenantId=%s actor=%s results=%j', tenant.id, req.user?.id, results);

    res.status(200).json({
      success: true,
      message: 'Product cleanup completed.',
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        results
      }
    });
  } catch (error) {
    if (error.code === 'CONFIRM_SLUG_REQUIRED') {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code
      });
    }
    next(error);
  }
};

exports.cleanupTenantInvoices = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      attributes: ['id', 'name', 'slug']
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    ensureTenantCleanupConfirmed(req, tenant);

    const invoiceIds = normalizeCleanupIds(req.body?.invoiceIds || req.body?.ids);
    if (invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one invoice to clean up.'
      });
    }

    const reason = String(req.body?.reason || 'Superadmin tenant cleanup').trim();
    const affectedCustomers = await Invoice.findAll({
      where: { tenantId: tenant.id, id: invoiceIds },
      attributes: ['customerId'],
      raw: true
    });
    const results = await sequelize.transaction(async (transaction) => {
      const output = [];
      for (const invoiceId of invoiceIds) {
        output.push(await cleanupInvoiceRecord({
          tenant,
          invoiceId,
          actorUserId: req.user?.id || null,
          reason,
          transaction
        }));
      }
      return output;
    });

    await Promise.all(
      Array.from(new Set(affectedCustomers.map((row) => row.customerId).filter(Boolean)))
        .map((customerId) => updateCustomerBalance(customerId).catch((err) => {
          console.error('[AdminCleanup] Failed to update customer balance', { customerId, error: err?.message });
        }))
    );

    invalidateInvoiceListCache(tenant.id);
    invalidateAfterMutation(tenant.id);

    console.log('[AdminCleanup] invoices tenantId=%s actor=%s results=%j', tenant.id, req.user?.id, results);

    res.status(200).json({
      success: true,
      message: 'Invoice cleanup completed.',
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        results
      }
    });
  } catch (error) {
    if (error.code === 'CONFIRM_SLUG_REQUIRED') {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code
      });
    }
    next(error);
  }
};

exports.cleanupTenantSales = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      attributes: ['id', 'name', 'slug']
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    ensureTenantCleanupConfirmed(req, tenant);

    const saleIds = normalizeCleanupIds(req.body?.saleIds || req.body?.ids);
    if (saleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one sale/order to clean up.'
      });
    }

    const reason = String(req.body?.reason || 'Superadmin tenant cleanup').trim();
    const affectedCustomers = await Sale.findAll({
      where: { tenantId: tenant.id, id: saleIds },
      attributes: ['customerId'],
      raw: true
    });
    const results = await sequelize.transaction(async (transaction) => {
      const output = [];
      for (const saleId of saleIds) {
        output.push(await cleanupSaleRecord({
          tenant,
          saleId,
          actorUserId: req.user?.id || null,
          reason,
          transaction
        }));
      }
      return output;
    });

    await Promise.all(
      Array.from(new Set(affectedCustomers.map((row) => row.customerId).filter(Boolean)))
        .map((customerId) => updateCustomerBalance(customerId).catch((err) => {
          console.error('[AdminCleanup] Failed to update customer balance after sale cleanup', { customerId, error: err?.message });
        }))
    );

    invalidateSaleListCache(tenant.id);
    invalidateAfterMutation(tenant.id);

    console.log('[AdminCleanup] sales tenantId=%s actor=%s results=%j', tenant.id, req.user?.id, results);

    res.status(200).json({
      success: true,
      message: 'Sale/order cleanup completed.',
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        results
      }
    });
  } catch (error) {
    if (error.code === 'CONFIRM_SLUG_REQUIRED') {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code
      });
    }
    next(error);
  }
};

exports.cleanupTenantQuotes = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      attributes: ['id', 'name', 'slug']
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    ensureTenantCleanupConfirmed(req, tenant);

    const quoteIds = normalizeCleanupIds(req.body?.quoteIds || req.body?.ids);
    if (quoteIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one quote to clean up.'
      });
    }

    const reason = String(req.body?.reason || 'Superadmin tenant cleanup').trim();
    const results = await sequelize.transaction(async (transaction) => {
      const output = [];
      for (const quoteId of quoteIds) {
        output.push(await cleanupQuoteRecord({
          tenant,
          quoteId,
          actorUserId: req.user?.id || null,
          reason,
          transaction
        }));
      }
      return output;
    });

    invalidateAfterMutation(tenant.id);

    console.log('[AdminCleanup] quotes tenantId=%s actor=%s results=%j', tenant.id, req.user?.id, results);

    res.status(200).json({
      success: true,
      message: 'Quote cleanup completed.',
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        results
      }
    });
  } catch (error) {
    if (error.code === 'CONFIRM_SLUG_REQUIRED') {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code
      });
    }
    next(error);
  }
};

// @desc    Permanently delete a tenant and all workspace data
// @route   DELETE /api/admin/tenants/:id
// @access  Platform admin (tenants.delete)
exports.deleteTenant = async (req, res, next) => {
  try {
    const tenant = await permanentlyDeleteTenant({
      tenantId: req.params.id,
      confirmName: req.body?.confirmName,
      actor: {
        id: req.user?.id,
        isPlatformAdmin: req.user?.isPlatformAdmin,
        tenantId: req.tenantId,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Tenant "${tenant.name}" and all related data were permanently deleted.`,
      data: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    });
  } catch (error) {
    if (error.statusCode) {
      const requestId = req.id || req.headers?.['x-request-id'];
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        errorCode: error.errorCode || error.code || 'INTERNAL_ERROR',
        ...(requestId ? { requestId } : {}),
      });
    }
    next(error);
  }
};

exports.updateTenantStatus = async (req, res, next) => {
  try {
    const { action } = req.body || {};
    const tenant = await Tenant.findByPk(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const validActions = ['activate', 'pause', 'suspend'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Expected activate, pause, or suspend.'
      });
    }

    let nextStatus = tenant.status;
    switch (action) {
      case 'activate':
        nextStatus = 'active';
        break;
      case 'pause':
        nextStatus = 'paused';
        break;
      case 'suspend':
        nextStatus = 'suspended';
        break;
      default:
        break;
    }

    await tenant.update({
      status: nextStatus,
      metadata: {
        ...tenant.metadata,
        lastStatusChange: new Date().toISOString(),
        statusChangedBy: req.user?.id || null,
        statusAction: action
      }
    });

    res.status(200).json({
      success: true,
      data: tenant
    });
  } catch (error) {
    next(error);
  }
};

exports.getBillingSummary = async (req, res, next) => {
  try {
    const now = new Date();
    const [planBreakdownRaw, enterpriseTenants] = await Promise.all([
      Tenant.findAll({
        where: {
          plan: {
            [Op.notIn]: TRIAL_PLAN_IDS
          },
          status: 'active'
        },
        attributes: [
          'plan',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['plan'],
        raw: true
      }),
      Tenant.findAll({
        where: {
          plan: 'enterprise',
          status: 'active',
        },
        attributes: ['id'],
        raw: true,
      }),
    ]);
    const enterpriseTenantIds = enterpriseTenants.map((tenant) => tenant.id).filter(Boolean);
    const enterpriseLedgerPayments = enterpriseTenantIds.length
      ? await SubscriptionPayment.findAll({
          where: {
            tenantId: { [Op.in]: enterpriseTenantIds },
            plan: 'enterprise',
            status: 'success',
          },
          order: [['createdAt', 'DESC']],
        })
      : [];
    const enterpriseRevenuePayments = selectEnterprisePaymentsForRevenue(
      enterpriseLedgerPayments,
      enterpriseTenantIds,
      now
    );

    const trialingCount = await Tenant.count({
      where: {
        plan: { [Op.in]: TRIAL_PLAN_IDS },
        status: 'active'
      }
    });

    const planBreakdownByPlan = new Map();
    planBreakdownRaw.forEach((row) => {
      const normalizedPlan = normalizePlanId(row.plan);
      if (normalizedPlan === 'trial') return;
      const count = Number(row.count) || 0;
      const price = PLAN_PRICING[normalizedPlan] || 0;
      const existing = planBreakdownByPlan.get(normalizedPlan) || {
        plan: normalizedPlan,
        count: 0,
        price,
        mrr: 0,
      };
      existing.count += count;
      existing.price = price;
      existing.mrr = roundCurrency(existing.mrr + (price * count));
      planBreakdownByPlan.set(normalizedPlan, existing);
    });

    const enterpriseMrr = enterpriseRevenuePayments.reduce(
      (sum, payment) => roundCurrency(sum + getPaymentEstimatedMrrGhs(payment)),
      0
    );
    const enterpriseOneTimeRevenue = roundCurrency(
      enterpriseRevenuePayments
        .filter((payment) => !isRecurringRevenuePayment(payment))
        .reduce((sum, payment) => sum + pesewasToGhs(payment.amount), 0)
    );
    const enterpriseRecurringRevenue = roundCurrency(
      enterpriseRevenuePayments
        .filter(isRecurringRevenuePayment)
        .reduce((sum, payment) => sum + pesewasToGhs(payment.amount), 0)
    );
    if (enterpriseMrr > 0 || planBreakdownByPlan.has('enterprise')) {
      const enterpriseBreakdown = planBreakdownByPlan.get('enterprise') || {
        plan: 'enterprise',
        count: 0,
        price: 0,
        mrr: 0,
      };
      enterpriseBreakdown.mrr = enterpriseMrr;
      enterpriseBreakdown.recordedRevenue = roundCurrency(
        enterpriseRevenuePayments.reduce((sum, payment) => sum + pesewasToGhs(payment.amount), 0)
      );
      enterpriseBreakdown.oneTimeRevenue = enterpriseOneTimeRevenue;
      enterpriseBreakdown.recurringRevenue = enterpriseRecurringRevenue;
      planBreakdownByPlan.set('enterprise', enterpriseBreakdown);
    }

    const planBreakdown = Array.from(planBreakdownByPlan.values());
    const estimatedMRR = roundCurrency(planBreakdown.reduce((acc, item) => acc + item.mrr, 0));
    const oneTimeRevenue = roundCurrency(planBreakdown.reduce((acc, item) => acc + (item.oneTimeRevenue || 0), 0));
    const recordedRevenue = roundCurrency(planBreakdown.reduce((acc, item) => acc + (item.recordedRevenue || 0), 0));
    const payingTenants = planBreakdown.reduce((acc, item) => acc + item.count, 0);

    const upcomingRenewals = await Tenant.findAll({
      where: {
        plan: {
          [Op.notIn]: TRIAL_PLAN_IDS
        },
        status: 'active'
      },
      attributes: ['id', 'name', 'plan', 'status', 'metadata', 'createdAt', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit: 10
    });

    res.status(200).json({
      success: true,
      data: {
        planBreakdown,
        estimatedMRR,
        oneTimeRevenue,
        recordedRevenue,
        payingTenants,
        trialingTenants: trialingCount,
        upcomingRenewals
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getBillingTenants = async (req, res, next) => {
  try {
    const tenants = await Tenant.findAll({
      where: {
        plan: {
          [Op.notIn]: TRIAL_PLAN_IDS
        }
      },
      order: [['updatedAt', 'DESC']],
      attributes: [
        'id',
        'slug',
        'name',
        'plan',
        'status',
        'createdAt',
        'updatedAt',
        'metadata'
      ]
    });

    const tenantIds = tenants.map((tenant) => tenant.id).filter(Boolean);
    const latestPayments = tenantIds.length
      ? await SubscriptionPayment.findAll({
          where: { tenantId: { [Op.in]: tenantIds } },
          order: [['createdAt', 'DESC']],
        })
      : [];
    const latestPaymentByTenant = new Map();
    latestPayments.forEach((payment) => {
      if (!latestPaymentByTenant.has(payment.tenantId)) {
        latestPaymentByTenant.set(payment.tenantId, payment);
      }
    });
    const tenantsWithBilling = tenants.map((tenant) => {
      const tenantData = tenant.toJSON ? tenant.toJSON() : { ...tenant };
      const latestPayment = latestPaymentByTenant.get(tenantData.id);
      return {
        ...tenantData,
        billingMethod: getPaymentMethodFromPayment(latestPayment) || tenantData.metadata?.paymentMethod || null,
        lastSubscriptionPayment: latestPayment
          ? {
              id: latestPayment.id,
              amount: latestPayment.amount,
              amountGhs: pesewasToGhs(latestPayment.amount),
              currency: latestPayment.currency,
              status: latestPayment.status,
              plan: latestPayment.plan,
              billingPeriod: latestPayment.billingPeriod,
              provider: latestPayment.provider,
              paymentMethod: getPaymentMethodFromPayment(latestPayment),
              providerReference: latestPayment.providerReference,
              periodStart: latestPayment.periodStart,
              periodEnd: latestPayment.periodEnd,
              paymentDate: latestPayment.metadata?.paymentDate || latestPayment.createdAt,
              metadata: latestPayment.metadata || {},
              notes: latestPayment.notes,
              createdAt: latestPayment.createdAt,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      data: tenantsWithBilling
    });
  } catch (error) {
    next(error);
  }
};

exports.updateTenantBranding = async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const { logoUrl } = req.body || {};

    const updatedMetadata = {
      ...(tenant.metadata || {}),
      logoUrl: logoUrl || ''
    };

    await tenant.update({
      metadata: updatedMetadata,
      updatedAt: new Date()
    });

    // Reload tenant to get fresh data
    await tenant.reload();

    res.status(200).json({
      success: true,
      data: tenant
    });
  } catch (error) {
    next(error);
  }
};

exports.getSystemHealth = async (req, res, next) => {
  try {
    const dbStart = Date.now();
    let dbStatus = 'online';
    let dbLatencyMs = 0;
    try {
      await sequelize.query('SELECT 1');
      dbLatencyMs = Date.now() - dbStart;
      if (dbLatencyMs > 1000) dbStatus = 'slow';
    } catch (dbErr) {
      dbStatus = 'offline';
      dbLatencyMs = Date.now() - dbStart;
    }

    const [pendingNotifications, pausedTenants, suspendedTenants, activeAdmins] =
      await Promise.all([
        Notification.count({ where: { isRead: false } }),
        Tenant.count({ where: { status: 'paused' } }),
        Tenant.count({ where: { status: 'suspended' } }),
        User.count({ where: { isPlatformAdmin: true, isActive: true } }),
      ]);

    const recentTenants = await Tenant.findAll({
      attributes: ['id', 'name', 'plan', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    const recentNotifications = await Notification.findAll({
      attributes: ['id', 'title', 'type', 'isRead', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    const performance = await enrichSlowOperationsWithIdentity(
      getRecentSlowOperations(req.query.limit)
    );

    let healthExtras = {
      overallStatus: dbStatus === 'offline' ? 'critical' : 'healthy',
      openCriticalCount: 0,
      openIssues: [],
      channels: {
        email: { success24h: 0, failed24h: 0, lastFailureAt: null },
        sms: { success24h: 0, failed24h: 0, lastFailureAt: null },
        whatsapp: { success24h: 0, failed24h: 0, lastFailureAt: null },
      },
      recentFailures: [],
      configChecks: [],
    };
    try {
      healthExtras = await require('../services/systemHealthIssueService').buildHealthDashboardExtras();
    } catch (healthErr) {
      console.warn('[AdminHealth] extras failed:', healthErr?.message);
    }

    if (dbStatus === 'offline') {
      healthExtras.overallStatus = 'critical';
    } else if (dbStatus === 'slow' && healthExtras.overallStatus === 'healthy') {
      healthExtras.overallStatus = 'degraded';
    }

    res.status(200).json({
      success: true,
      data: {
        overallStatus: healthExtras.overallStatus,
        openCriticalCount: healthExtras.openCriticalCount,
        openIssues: healthExtras.openIssues,
        channels: healthExtras.channels,
        recentFailures: healthExtras.recentFailures,
        configChecks: healthExtras.configChecks,
        serverStartedAt,
        uptimeSeconds: process.uptime(),
        uptimeHuman: formatDuration(process.uptime()),
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        counts: {
          pendingNotifications,
          pausedTenants,
          suspendedTenants,
          activeAdmins,
        },
        performance,
        recentTenants,
        recentNotifications,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Acknowledge a System Health issue.
 * @route POST /api/admin/health/issues/:id/acknowledge
 */
exports.acknowledgeSystemHealthIssue = async (req, res, next) => {
  try {
    const issue = await require('../services/systemHealthIssueService').acknowledgeIssue(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, message: 'Issue not found' });
    }
    res.status(200).json({ success: true, data: issue });
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve a System Health issue.
 * @route POST /api/admin/health/issues/:id/resolve
 */
exports.resolveSystemHealthIssue = async (req, res, next) => {
  try {
    const issue = await require('../services/systemHealthIssueService').resolveIssue(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, message: 'Issue not found' });
    }
    res.status(200).json({ success: true, data: issue });
  } catch (error) {
    next(error);
  }
};

