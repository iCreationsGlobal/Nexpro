const { Sale, SaleItem, Product, ProductVariant, Customer, Dealer, Shop, Invoice, User, SaleActivity, Tenant, Payment, Setting, Barcode } = require('../models');
const { createInvoiceRevenueJournal } = require('../services/invoiceAccountingService');
const { updateCustomerBalance } = require('../services/customerBalanceService');
const { syncSaleInvoiceAndRefreshCustomerBalance } = require('../services/invoiceSaleService');
const { checkCreditLimit } = require('../services/dealerBalanceService');
const { recordSaleCharge } = require('../services/dealerLedgerService');
const { createSaleCogsJournal, createSaleRevenueJournal } = require('../services/saleAccountingService');
const { hardDeleteSaleInTransaction } = require('../services/saleHardDeleteService');
const { maybeCreateCommissionForPayment } = require('../services/partnerCommissionService');
const { Op } = require('sequelize');
const { applyTenantFilter, sanitizePayload, findTenantWithOptionalColumns } = require('../utils/tenantUtils');
const { resolvePaymentNotesFromBody } = require('../utils/paymentNoteUtils');
const { parseDeliveryStatusInput } = require('../utils/deliveryStatus');
const { getPagination } = require('../utils/paginationUtils');
const { invalidateSaleListCache, invalidateInvoiceListCache, invalidateAfterMutation } = require('../middleware/cache');
const { sequelize } = require('../config/database');
const config = require('../config/config');
const { emitNewSale, emitSaleStatusChange, emitInventoryAlert } = require('../services/websocketService');
const { notifyOrderStatusChanged, notifyNewOrder } = require('../services/notificationService');
const { getTaxConfigForTenant, hasTaxConfigCache } = require('../utils/taxConfig');
const { computeDocumentTax } = require('../utils/taxCalculation');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { resolveDeliveryForSale } = require('../services/deliverySettingsService');
const { notifyOrderCreatedForCustomer } = require('../services/orderCustomerNotificationService');
const {
  runReviewRequestAutomations,
  runSaleCompletedAutomations,
  runOrderCreatedAutomations,
  runLowProfitMarginAutomations,
  runStockChangeAutomations,
} = require('../services/automationEngineService');
const { getTenantShopType } = require('../config/businessTypes');
const {
  applyShopFilter,
  attachShopToPayload,
  assertShopRecordAccess,
  userCanAccessShopId,
} = require('../utils/shopUtils');
const {
  pickTrimmed,
  resolveDocumentLineItemProductCode,
  getLineItemUnitSymbol,
  enrichDocumentLineItems,
} = require('../utils/documentLineItemUtils');
const {
  CUSTOMER_CONFIRMED_DELIVERY_ERROR_CODE,
  CUSTOMER_CONFIRMED_DELIVERY_ERROR_MESSAGE,
  hasCustomerConfirmedDelivery,
} = require('../utils/marketplaceOrderStatus');
const { getEffectiveRole } = require('../middleware/auth');
const {
  applyStockChange,
  applyStockChanges,
  parseQuantity: parseStockQuantity,
} = require('../utils/productStockUtils');

/** Throttle check-Paystack calls per sale (avoid hitting Paystack every poll) */
const paystackCheckLastBySaleId = new Map();
const PAYSTACK_CHECK_THROTTLE_MS = 4000;

const saleItemCatalogIncludes = [
  { model: Product, as: 'product', required: false },
  { model: ProductVariant, as: 'variant', required: false },
];
/** Separate query avoids Sequelize join alias errors when loading product + variant on sale items. */
const saleItemDetailInclude = {
  model: SaleItem,
  as: 'items',
  separate: true,
  include: saleItemCatalogIncludes,
};
const ACTIVE_KITCHEN_ORDER_STATUSES = ['received', 'preparing', 'ready'];
const isRestaurantTenant = (tenant) => getTenantShopType(tenant) === 'restaurant';
const getEffectiveTenantRole = (req) => req.tenantRole || req.user?.role || null;
const shouldRestrictStaffToOwnSales = (req) =>
  getEffectiveTenantRole(req) === 'staff' && !req.shopScoped;

const invalidateSaleMutationCaches = (tenantId) => {
  invalidateSaleListCache(tenantId);
  invalidateAfterMutation(tenantId);
};

const getTodayDateRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { [Op.between]: [start, end] };
};

/**
 * Scope for today's active kitchen queue (matches Kitchen Orders board and table row flags).
 * Uses tenant/shop/staff scope only — not list filters like payment status or date range.
 * @param {import('express').Request} req
 * @param {object} [listWhere]
 */
const buildActiveKitchenOrderScopeWhere = (req, listWhere = {}) => {
  let where = applyTenantFilter(req.tenantId, {});
  if (shouldRestrictStaffToOwnSales(req)) {
    where.soldBy = req.user.id;
  }
  if (req.shopScoped) {
    where = applyShopFilter(req, where);
  } else if (listWhere.shopId) {
    where.shopId = listWhere.shopId;
  }
  where.orderStatus = { [Op.in]: ACTIVE_KITCHEN_ORDER_STATUSES };
  where.createdAt = getTodayDateRange();
  return where;
};

const isActiveKitchenOrderRow = (sale) => {
  const plainSale = typeof sale?.get === 'function' ? sale.get({ plain: true }) : sale;
  if (!plainSale || !ACTIVE_KITCHEN_ORDER_STATUSES.includes(plainSale.orderStatus)) return false;

  const createdAt = plainSale.createdAt ? new Date(plainSale.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return createdAt >= start && createdAt <= end;
};

const getSaleItemProductCode = (item) => {
  const alias = item?.metadata?.productCode
    || item?.productCode
    || item?.product?.productCode
    || item?.variant?.productCode
    || item?.product?.barcode
    || item?.variant?.barcode
    || item?.product?.barcodeAliases?.[0]
    || item?.variant?.barcodeAliases?.[0]
    || item?.product?.barcodes?.find?.((barcode) => barcode?.isActive !== false)?.barcode
    || item?.variant?.barcodes?.find?.((barcode) => barcode?.isActive !== false)?.barcode;

  return String(alias || '').trim();
};

const parseSaleUnitPriceOverride = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numericValue = parseFloat(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return Math.round(numericValue * 100) / 100;
};

const salePricesDiffer = (left, right) => (
  Math.round((parseFloat(left) || 0) * 100) !== Math.round((parseFloat(right) || 0) * 100)
);

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

const createSaleTimer = (tenantId) => {
  const requestId = `sale_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();
  let lastAt = startedAt;

  return {
    id: requestId,
    mark(label, extra = {}) {
      if (config.nodeEnv !== 'development') return;
      const now = Date.now();
      console.log('[SaleCreatePerf]', {
        requestId,
        tenantId,
        phase: label,
        stepMs: now - lastAt,
        totalMs: now - startedAt,
        ...extra
      });
      lastAt = now;
    }
  };
};

const saleNumberCounters = new Map();
const saleNumberSeedPromises = new Map();

// Generate unique sale number; seed once per tenant/day, then increment in memory.
const generateSaleNumber = async (tenantId) => {
  const prefix = 'SALE';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numberPrefix = `${prefix}-${dateStr}-`;
  const counterKey = `${tenantId}:${dateStr}`;

  let state = saleNumberCounters.get(counterKey);
  let sequenceCacheHit = true;

  if (!state) {
    sequenceCacheHit = false;
    let seedPromise = saleNumberSeedPromises.get(counterKey);
    if (!seedPromise) {
      seedPromise = Sale.findOne({
        where: {
          tenantId,
          saleNumber: { [Op.like]: `${numberPrefix}%` }
        },
        order: [['saleNumber', 'DESC']],
        attributes: ['saleNumber']
      }).then((lastSale) => {
        if (!lastSale?.saleNumber) return 1;
        const lastSeq = parseInt(String(lastSale.saleNumber).split('-').pop(), 10);
        return Number.isFinite(lastSeq) && lastSeq >= 0 ? lastSeq + 1 : 1;
      });
      saleNumberSeedPromises.set(counterKey, seedPromise);
    }

    const nextSequence = await seedPromise;
    state = saleNumberCounters.get(counterKey);
    if (!state) {
      state = { nextSequence };
      saleNumberCounters.set(counterKey, state);
      saleNumberSeedPromises.delete(counterKey);
    } else {
      sequenceCacheHit = true;
    }
  }

  const sequence = state.nextSequence;
  state.nextSequence += 1;

  return {
    saleNumber: `${numberPrefix}${String(sequence).padStart(4, '0')}`,
    sequenceCacheHit
  };
};

// Generate invoice number
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

// Helper function to automatically create invoice for ALL completed sales
// Credit sales: invoice status 'sent' (pay later)
// Cash/card/etc: invoice status 'paid' (immediate payment - acts as receipt)
const isDealerSale = (saleOrData) => {
  const channel = String(saleOrData?.saleChannel || '').toLowerCase();
  return channel === 'dealer' || !!saleOrData?.dealerId;
};

const dealerReceiptInclude = {
  model: Dealer,
  as: 'dealer',
  attributes: ['id', 'businessName', 'contactName', 'phone', 'email', 'creditLimit', 'balance'],
};

const autoCreateInvoiceFromSale = async (saleId, tenantId) => {
  try {
    console.log(`[AutoInvoice] Starting invoice creation for saleId: ${saleId}, tenantId: ${tenantId}`);

    const existingInvoice = await Invoice.findOne({
      where: { saleId, tenantId }
    });

    const sale = await Sale.findByPk(saleId, {
      include: [
        { model: Customer, as: 'customer' },
        dealerReceiptInclude,
        { model: SaleItem, as: 'items' }
      ]
    });

    if (!sale) {
      console.log(`[AutoInvoice] Sale ${saleId} not found, cannot create invoice`);
      return null;
    }

    if (isDealerSale(sale)) {
      console.log(`[AutoInvoice] Skipping invoice for dealer sale ${saleId}`);
      return null;
    }

    if (existingInvoice) {
      console.log(`[AutoInvoice] Invoice already exists for sale ${saleId}, syncing payment state`);
      if (sale.customerId) {
        try {
          await syncSaleInvoiceAndRefreshCustomerBalance(
            { ...sale.toJSON(), invoiceId: existingInvoice.id, tenantId },
            { tenantId }
          );
        } catch (balanceError) {
          console.error('[AutoInvoice] Failed to sync existing invoice/customer balance:', balanceError?.message);
        }
      }
      return existingInvoice;
    }

    const totalAmount = parseFloat(sale.total || 0);
    const amountPaid = parseFloat(sale.amountPaid || 0);
    const balance = Math.max(totalAmount - amountPaid, 0);
    const invoiceStatus = balance <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'sent';
    console.log(
      `[AutoInvoice] Sale found: ${sale.saleNumber}, items: ${sale.items?.length || 0}, total: ${totalAmount}, amountPaid: ${amountPaid}, status: ${invoiceStatus}`
    );

    const invoiceNumber = await generateInvoiceNumber(tenantId);
    const td = sale.metadata?.taxDetail || {};
    const taxAmt = parseFloat(sale.tax || 0);
    let taxableExclusive =
      td.taxableExclusive != null && td.taxableExclusive !== ''
        ? parseFloat(td.taxableExclusive)
        : Math.max(0, parseFloat(sale.subtotal || 0) - parseFloat(sale.discount || 0));
    if (!Number.isFinite(taxableExclusive)) taxableExclusive = 0;

    let taxRate =
      taxAmt > 0 && taxableExclusive > 0
        ? Math.round((taxAmt / taxableExclusive) * 10000) / 100
        : 0;
    if (taxRate === 0 && td.ratePercent != null && taxAmt > 0) {
      taxRate = Math.min(100, Math.max(0, parseFloat(td.ratePercent) || 0));
    }

    const totalDiscount = parseFloat(sale.discount || 0);

    /** @type {Array<Record<string, unknown>>} */
    let items = [];
    if (sale.items && sale.items.length > 0) {
      items = sale.items.map((item) => {
        const qty = parseFloat(item.quantity || 0);
        const itemTax = parseFloat(item.tax || 0);
        const itemTotal = parseFloat(item.total || 0);
        const itemExclusive = Math.max(0, itemTotal - itemTax);
        const unitPriceNet = qty > 0 ? itemExclusive / qty : itemExclusive;
        const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        return {
          description: item.name || 'Sale item',
          category: 'Sale',
          productId: item.productId || undefined,
          productVariantId: item.productVariantId || undefined,
          productCode: pickTrimmed(metadata.productCode, item.sku),
          sku: item.sku || null,
          unit: pickTrimmed(metadata.unit),
          metadata,
          quantity: item.quantity,
          unitPrice: unitPriceNet,
          discountAmount: 0,
          discountPercent: 0,
          discountReason: null,
          total: itemExclusive
        };
      });

      const productIds = new Set();
      const variantIds = new Set();
      sale.items.forEach((item) => {
        if (item.productId) productIds.add(item.productId);
        if (item.productVariantId) variantIds.add(item.productVariantId);
      });

      const catalogBarcodeInclude = {
        model: Barcode,
        as: 'barcodes',
        attributes: ['id', 'barcode', 'isActive'],
        required: false,
      };

      const [products, variants] = await Promise.all([
        productIds.size
          ? Product.findAll({
            where: applyTenantFilter(tenantId, { id: { [Op.in]: [...productIds] } }),
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

      const plainRecord = (record) => (
        typeof record?.get === 'function' ? record.get({ plain: true }) : record
      );
      const productsById = new Map(products.map((product) => [product.id, plainRecord(product)]));
      const variantsById = new Map(variants.map((variant) => [variant.id, plainRecord(variant)]));
      const saleItems = sale.items.map((item) => plainRecord(item));

      items = enrichDocumentLineItems(items, { productsById, variantsById, saleItems });
    } else {
      items = [
        {
          description: `Sale ${sale.saleNumber}`,
          quantity: 1,
          unitPrice: taxableExclusive,
          total: taxableExclusive,
          discountAmount: 0,
          discountPercent: 0,
          discountReason: null,
          category: 'Sale'
        }
      ];
    }

    const invoicePayload = {
      invoiceNumber,
      saleId,
      customerId: sale.customerId,
      tenantId,
      sourceType: 'sale',
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: taxableExclusive,
      taxRate,
      discountType: 'fixed',
      discountValue: 0,
      discountAmount: 0,
      discountReason: totalDiscount > 0 ? 'Discounts included in line totals' : null,
      paymentTerms: balance <= 0 ? 'Due on Receipt' : 'Net 30',
      status: invoiceStatus,
      totalAmount,
      amountPaid,
      balance,
      items,
      notes: `Invoice generated from sale ${sale.saleNumber}`,
      termsAndConditions:
        'Payment is due within the specified payment terms. Late payments may incur additional charges.',
      shopId: sale.shopId || null,
    };
    if (balance <= 0) {
      invoicePayload.paidDate = new Date();
    }
    const invoice = await Invoice.create(invoicePayload);

    await sale.update({ invoiceId: invoice.id });
    invalidateInvoiceListCache(tenantId);

    try {
      await createInvoiceRevenueJournal(invoice);
    } catch (journalError) {
      console.error('[AutoInvoice] Failed to create accounting revenue entry:', journalError?.message);
    }

    console.log(`[AutoInvoice] ✅ Invoice created successfully: ${invoice.invoiceNumber} (ID: ${invoice.id}), status: ${invoiceStatus}`);

    if (sale.customerId) {
      try {
        await updateCustomerBalance(sale.customerId);
      } catch (balanceError) {
        console.error('[AutoInvoice] Failed to update customer balance:', balanceError?.message);
      }
    }

    try {
      const prefsSetting = await Setting.findOne({ where: { tenantId, key: 'customer-notification-preferences' } });
      const prefValue = prefsSetting?.value?.autoSendInvoiceToCustomer;
      console.log('[AutoInvoiceDelivery]', {
        event: 'sale_invoice_created',
        tenantId,
        saleId,
        saleNumber: sale.saleNumber || null,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        sourceType: invoice.sourceType,
        customerId: sale.customerId || null,
        hasCustomerEmail: !!sale.customer?.email,
        customerEmail: maskEmailForLogs(sale.customer?.email),
        autoSendInvoiceToCustomer: prefValue !== false,
        autoSendInvoiceToCustomerRaw: typeof prefValue === 'boolean' ? prefValue : null,
        decision: 'not_attempted',
        reason: 'sale_auto_invoice_creation_does_not_send_customer_channels'
      });
    } catch (logError) {
      console.warn('[AutoInvoiceDelivery] Failed to log sale invoice delivery decision:', logError?.message);
    }
    return invoice;
  } catch (error) {
    console.error('Error auto-creating invoice from sale:', error);
    return null;
  }
};

const fetchSaleWithReceiptRelations = (saleId) => Sale.findByPk(saleId, {
  include: [
    { model: Shop, as: 'shop' },
    { model: Customer, as: 'customer' },
    dealerReceiptInclude,
    { model: User, as: 'seller' },
    {
      model: Invoice,
      as: 'invoice',
      include: [{ model: Customer, as: 'customer' }]
    },
    saleItemDetailInclude
  ]
});

/** Fields needed for idempotent replay and lightweight POS responses. */
const SALE_RESPONSE_ATTRIBUTES = [
  'id',
  'tenantId',
  'shopId',
  'customerId',
  'dealerId',
  'saleChannel',
  'saleNumber',
  'status',
  'orderStatus',
  'paymentMethod',
  'subtotal',
  'discount',
  'tax',
  'total',
  'deliveryRequired',
  'deliveryFee',
  'deliveryBandId',
  'amountPaid',
  'change',
  'invoiceId',
  'soldBy',
  'createdAt',
  'updatedAt'
];

const findExistingSaleByClientId = (tenantId, clientId) =>
  Sale.findOne({
    where: { tenantId, clientId },
    attributes: SALE_RESPONSE_ATTRIBUTES
  });

const resolveSaleItemCatalogData = async ({ items, tenantId, shopId, transaction }) => {
  const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  const variantIds = [...new Set(items.map((item) => item.productVariantId).filter(Boolean))];

  const [products, variants] = await Promise.all([
    productIds.length
      ? Product.findAll({
        where: applyTenantFilter(tenantId, { id: { [Op.in]: productIds } }),
        include: [{
          model: Barcode,
          as: 'barcodes',
          attributes: ['id', 'barcode', 'isActive'],
          required: false,
        }],
        transaction
      })
      : [],
    variantIds.length
      ? ProductVariant.findAll({
        where: { id: { [Op.in]: variantIds } },
        include: [
          {
            model: Product,
            as: 'product',
            where: applyTenantFilter(tenantId, {}),
            required: true,
            include: [{
              model: Barcode,
              as: 'barcodes',
              attributes: ['id', 'barcode', 'isActive'],
              required: false,
            }],
          },
          {
            model: Barcode,
            as: 'barcodes',
            attributes: ['id', 'barcode', 'isActive'],
            required: false,
          },
        ],
        transaction
      })
      : []
  ]);

  const productsById = new Map(products.map((product) => [product.id, product]));
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

  return Promise.all(items.map(async (item) => {
    const hasCatalogReference = !!(item.productId || item.productVariantId);
    if (!hasCatalogReference) {
      const name = String(item.name || '').trim();
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseSaleUnitPriceOverride(item.unitPrice);

      if (!name) {
        throw new Error('Custom sale item name is required');
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Custom sale item quantity must be greater than 0');
      }
      if (unitPrice === null) {
        throw new Error('Custom sale item unitPrice must be greater than or equal to 0');
      }

      let savedProduct = null;
      if (item.saveAsProduct === true) {
        savedProduct = await Product.create({
          tenantId,
          shopId: shopId || null,
          name,
          sku: item.sku || null,
          barcode: item.barcode || null,
          description: item.description || null,
          costPrice: 0,
          sellingPrice: unitPrice,
          quantityOnHand: 0,
          unit: item.unit || 'pcs',
          trackStock: false,
          metadata: {
            ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
            source: 'pos_custom_item'
          }
        }, { transaction });
      }

      return {
        ...item,
        productId: savedProduct?.id || null,
        productVariantId: null,
        name,
        sku: savedProduct?.sku || item.sku || null,
        baseUnitPrice: unitPrice,
        catalogUnitPrice: savedProduct ? unitPrice : null,
        originalUnitPrice: savedProduct ? unitPrice : null,
        unitPrice,
        priceOverridden: false,
        productCode: item.productCode || savedProduct?.barcode || null,
        metadata: {
          ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
          customItem: true,
          saveAsProduct: item.saveAsProduct === true,
          ...(savedProduct ? { savedProductId: savedProduct.id } : {})
        }
      };
    }

    const product = productsById.get(item.productId);
    const variant = item.productVariantId ? variantsById.get(item.productVariantId) : null;
    const catalogProduct = variant?.product || product;

    if (!catalogProduct) {
      throw new Error('Sale item product not found');
    }

    if (shopId && catalogProduct.shopId && catalogProduct.shopId !== shopId) {
      throw new Error('Sale item product does not belong to this shop');
    }

    if (item.productVariantId && !variant) {
      throw new Error('Sale item variant not found');
    }

    if (variant && item.productId && variant.productId !== item.productId) {
      throw new Error('Sale item variant does not belong to product');
    }

    const variantName = variant?.name ? String(variant.name).trim() : '';
    const productName = catalogProduct.name || item.name || 'Sale item';
    const resolvedName = variantName && !String(productName).includes(variantName)
      ? `${productName} - ${variantName}`
      : productName;
    const resolvedPrice = variant && variant.sellingPrice != null
      ? variant.sellingPrice
      : catalogProduct.sellingPrice;
    const catalogUnitPrice = parseSaleUnitPriceOverride(resolvedPrice) ?? 0;
    const clientUnitPrice = parseSaleUnitPriceOverride(item.unitPrice);
    const effectiveUnitPrice = clientUnitPrice ?? catalogUnitPrice;
    const resolvedSku = variant?.sku || catalogProduct.sku || item.sku || null;
    const plainProduct = typeof catalogProduct?.get === 'function'
      ? catalogProduct.get({ plain: true })
      : catalogProduct;
    const plainVariant = variant
      ? (typeof variant?.get === 'function' ? variant.get({ plain: true }) : variant)
      : null;
    const resolvedProductCode = resolveDocumentLineItemProductCode({
      item,
      product: plainProduct,
      variant: plainVariant,
    });
    const resolvedUnit = getLineItemUnitSymbol(item, { product: plainProduct, variant: plainVariant });
    const priceOverridden = salePricesDiffer(effectiveUnitPrice, catalogUnitPrice);

    return {
      ...item,
      productId: catalogProduct.id,
      productVariantId: variant?.id || null,
      name: resolvedName,
      sku: resolvedSku,
      unit: resolvedUnit || undefined,
      baseUnitPrice: catalogUnitPrice,
      catalogUnitPrice,
      originalUnitPrice: catalogUnitPrice,
      unitPrice: effectiveUnitPrice,
      priceOverridden,
      productCode: resolvedProductCode
    };
  }));
};

const buildLightweightSaleResponse = (sale, items = []) => {
  const plainSale = typeof sale?.get === 'function' ? sale.get({ plain: true }) : sale;
  return {
    id: plainSale.id,
    tenantId: plainSale.tenantId,
    shopId: plainSale.shopId || null,
    customerId: plainSale.customerId || null,
    dealerId: plainSale.dealerId || null,
    saleChannel: plainSale.saleChannel || 'retail',
    saleNumber: plainSale.saleNumber,
    status: plainSale.status,
    orderStatus: plainSale.orderStatus || null,
    paymentMethod: plainSale.paymentMethod,
    subtotal: plainSale.subtotal,
    discount: plainSale.discount,
    tax: plainSale.tax,
    total: plainSale.total,
    deliveryRequired: plainSale.deliveryRequired === true,
    deliveryFee: plainSale.deliveryFee,
    deliveryBandId: plainSale.deliveryBandId || null,
    amountPaid: plainSale.amountPaid,
    change: plainSale.change,
    invoiceId: plainSale.invoiceId || null,
    balance: plainSale.balance,
    soldBy: plainSale.soldBy,
    createdAt: plainSale.createdAt,
    updatedAt: plainSale.updatedAt,
    items: items.map((item) => {
      const plainItem = typeof item?.get === 'function' ? item.get({ plain: true }) : item;
      return {
        id: plainItem.id,
        productId: plainItem.productId,
        productVariantId: plainItem.productVariantId || null,
        name: plainItem.name,
        sku: plainItem.sku,
        productCode: plainItem.metadata?.productCode || null,
        originalUnitPrice: plainItem.metadata?.originalUnitPrice ?? null,
        catalogUnitPrice: plainItem.metadata?.catalogUnitPrice ?? plainItem.metadata?.originalUnitPrice ?? null,
        priceOverridden: plainItem.metadata?.priceOverridden === true,
        metadata: plainItem.metadata || {},
        quantity: plainItem.quantity,
        unitPrice: plainItem.unitPrice,
        discount: plainItem.discount,
        tax: plainItem.tax,
        subtotal: plainItem.subtotal,
        total: plainItem.total
      };
    })
  };
};

const bulkDecrementStock = async ({ tableName, quantityById, transaction }) => {
  // Legacy SQL bulk path kept for tests that spy on it; prefer applySaleStockDecrements.
  const ids = [...quantityById.keys()].filter(Boolean);
  if (ids.length === 0) return 0;

  const replacements = {};
  const whenClauses = ids.map((id, index) => {
    replacements[`id${index}`] = id;
    replacements[`qty${index}`] = quantityById.get(id) || 0;
    return `WHEN target.id = :id${index} THEN :qty${index}`;
  });
  const idListSql = ids.map((_, index) => `:id${index}`).join(', ');

  if (tableName === 'product_variants') {
    await sequelize.query(
      `
      UPDATE product_variants AS target
      SET "quantityOnHand" = GREATEST(0, target."quantityOnHand" - CASE ${whenClauses.join(' ')} ELSE 0 END),
          "updatedAt" = NOW()
      FROM products AS parent
      WHERE target.id IN (${idListSql})
        AND target."productId" = parent.id
        AND COALESCE(parent."trackStock", true) = true
        AND COALESCE(target."trackStock", true) = true
      `,
      { replacements, transaction }
    );

    return ids.length;
  }

  await sequelize.query(
    `
    UPDATE products AS target
    SET "quantityOnHand" = GREATEST(0, target."quantityOnHand" - CASE ${whenClauses.join(' ')} ELSE 0 END),
        "updatedAt" = NOW()
    WHERE target.id IN (${idListSql})
      AND COALESCE("trackStock", true) = true
    `,
    { replacements, transaction }
  );

  return ids.length;
};

/**
 * Decrement shop stock + write sale ledger rows for resolved sale lines.
 * @param {object} params
 * @returns {Promise<object[]>}
 */
const applySaleStockDecrements = async ({
  tenantId,
  shopId,
  resolvedItems,
  saleId,
  saleNumber,
  userId,
  transaction,
}) => {
  if (!shopId) {
    // Fallback: legacy product-row decrement when sale has no shop
    const productQuantityById = new Map();
    const variantQuantityById = new Map();
    for (const item of resolvedItems) {
      const quantity = parseFloat(item.quantity || 0);
      if (item.productId && !item.productVariantId) {
        productQuantityById.set(
          item.productId,
          (productQuantityById.get(item.productId) || 0) + quantity
        );
      }
      if (item.productVariantId) {
        variantQuantityById.set(
          item.productVariantId,
          (variantQuantityById.get(item.productVariantId) || 0) + quantity
        );
      }
    }
    await bulkDecrementStock({
      tableName: 'products',
      quantityById: productQuantityById,
      transaction,
    });
    await bulkDecrementStock({
      tableName: 'product_variants',
      quantityById: variantQuantityById,
      transaction,
    });
    return [];
  }

  const items = [];
  for (const item of resolvedItems) {
    const quantity = parseStockQuantity(item.quantity);
    if (!item.productId || quantity <= 0) continue;
    items.push({
      productId: item.productId,
      productVariantId: item.productVariantId || null,
      delta: -quantity,
      metadata: {
        saleItemName: item.name || null,
      },
    });
  }

  return applyStockChanges({
    tenantId,
    shopId,
    items,
    type: 'sale',
    reason: saleNumber ? `Sale ${saleNumber}` : 'Sale',
    reference: saleId ? `sale:${saleId}` : (saleNumber || null),
    userId,
    metadata: { source: 'createSale' },
    transaction,
  });
};

const runPostSaleAutomation = async ({ sale, items, tenantId, userId, isRestaurant, timer = null }) => {
  const mark = (phase, extra = {}) => timer?.mark(`background:${phase}`, extra);

  try {
    mark('activity:start');
    try {
      await createSaleCreatedActivity({ sale, tenantId, userId });
    } catch (activityError) {
      console.error('[CreateSale] Failed to create sale activity:', activityError?.message);
    }
    mark('activity:end');

    if (sale.status === 'completed') {
      mark('journals:start');
      await Promise.all([
        createSaleRevenueJournal(tenantId, sale.id, userId).catch((revError) => {
          console.error('[CreateSale] Failed to create sale revenue journal entry:', revError?.message);
        }),
        createSaleCogsJournal(tenantId, sale.id, userId).catch((cogsError) => {
          console.error('[CreateSale] Failed to create COGS journal entry:', cogsError?.message);
        })
      ]);
      mark('journals:end');
    }

    const needsFullSale = sale.status === 'completed' || isRestaurant;
    let createdSale = sale;
    if (needsFullSale) {
      mark('fetch-relations:start');
      createdSale = await fetchSaleWithReceiptRelations(sale.id);
      mark('fetch-relations:end', { found: !!createdSale });
      if (!createdSale) {
        console.error('[CreateSale] Post-sale automation skipped: sale not found', sale.id);
        return;
      }
    }

    if (sale.status === 'completed' && sale.customerId && !isDealerSale(sale)) {
      mark('invoice:start');
      try {
        console.log(`[CreateSale] Attempting to auto-create invoice for sale ${sale.id}`);
        const autoGeneratedInvoice = await autoCreateInvoiceFromSale(sale.id, tenantId);
        if (autoGeneratedInvoice) {
          console.log(`[CreateSale] ✅ Invoice auto-created: ${autoGeneratedInvoice.invoiceNumber}`);
        }
      } catch (invoiceError) {
        console.error('[CreateSale] ❌ Failed to auto-create invoice, but sale was created:', invoiceError);
      }
      mark('invoice:end');
    } else if (sale.status === 'completed') {
      console.log(`[CreateSale] Skipping auto-invoice for walk-in sale ${sale.id}`);
    }

    if (createdSale.customer) {
      mark('customer-order-alert:start');
      await runOrderCreatedAutomations({
        tenantId,
        sale: createdSale,
        customer: createdSale.customer || null,
        actorUserId: userId || null,
      }).catch((err) =>
        console.error('[CreateSale] order_created automations failed:', err?.message || err)
      );
      const { runOrderCreatedStaffAutomations } = require('../services/automationEngineService');
      await runOrderCreatedStaffAutomations({
        tenantId,
        sale: createdSale,
        customer: createdSale.customer || null,
        actorUserId: userId || null,
      }).catch((err) =>
        console.error('[CreateSale] order_created_staff automations failed:', err?.message || err)
      );
      await notifyOrderCreatedForCustomer({
        tenantId,
        sale: createdSale
      }).catch((alertError) =>
        console.error('[CreateSale] Customer order-created alert failed:', alertError?.message || alertError)
      );
      mark('customer-order-alert:end');
    } else if (isRestaurant && createdSale.orderStatus) {
      const { runOrderCreatedStaffAutomations } = require('../services/automationEngineService');
      await runOrderCreatedStaffAutomations({
        tenantId,
        sale: createdSale,
        customer: null,
        actorUserId: userId || null,
      }).catch((err) =>
        console.error('[CreateSale] order_created_staff automations failed:', err?.message || err)
      );
    }

    if (isRestaurant && createdSale.orderStatus) {
      notifyNewOrder({ sale: createdSale, triggeredBy: userId }).catch((err) =>
        console.error('[createSale] New order notification failed:', err?.message)
      );
    }

    mark('emit:start');
    try {
      emitNewSale(tenantId, createdSale);

      const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
      if (productIds.length > 0) {
        const products = await Product.findAll({
          where: { id: { [Op.in]: productIds }, tenantId },
          attributes: ['id', 'trackStock', 'quantityOnHand', 'reorderLevel', 'name', 'sku']
        });
        for (const product of products) {
          if (product.trackStock === false) continue;
          if (product.quantityOnHand <= 0) {
            emitInventoryAlert(tenantId, product, 'out_of_stock');
          } else if (product.quantityOnHand <= (product.reorderLevel || 10)) {
            emitInventoryAlert(tenantId, product, 'low_stock');
          }
          runStockChangeAutomations({
            tenantId,
            product,
            stockEvent: 'auto',
            actorUserId: userId || null,
          }).catch((err) =>
            console.error('[CreateSale] stock change automations failed:', err?.message || err)
          );
        }
      }
    } catch (wsError) {
      console.error('[WebSocket] Failed to emit sale event:', wsError);
    }
    mark('emit:end');

    if (createdSale.status === 'completed') {
      mark('auto-receipt:start');
      await autoSendReceiptIfEnabled(tenantId, createdSale.id).catch((err) =>
        console.error('[CreateSale] Auto-send receipt failed:', err?.message || err)
      );
      mark('auto-receipt:end');

      if (createdSale.customerId && !isDealerSale(createdSale)) {
        mark('review-request:start');
        await runReviewRequestAutomations({
          tenantId,
          sourceType: 'sale',
          source: createdSale,
          customer: createdSale.customer || null,
          actorUserId: userId || null,
        }).catch((err) =>
          console.error('[CreateSale] review_request automations failed:', err?.message || err)
        );
        mark('review-request:end');
      }

      if (createdSale.customer) {
        mark('sale-completed:start');
        await runSaleCompletedAutomations({
          tenantId,
          sale: createdSale,
          customer: createdSale.customer || null,
          actorUserId: userId || null,
        }).catch((err) =>
          console.error('[CreateSale] sale_completed automations failed:', err?.message || err)
        );
        const { runSaleCompletedStaffAutomations } = require('../services/automationEngineService');
        await runSaleCompletedStaffAutomations({
          tenantId,
          sale: createdSale,
          customer: createdSale.customer || null,
          actorUserId: userId || null,
        }).catch((err) =>
          console.error('[CreateSale] sale_completed_staff automations failed:', err?.message || err)
        );
        mark('sale-completed:end');
      }

      mark('low-profit-margin:start');
      const saleItemsForMargin = await SaleItem.findAll({
        where: { saleId: createdSale.id },
        attributes: ['id', 'productId', 'quantity', 'total', 'metadata'],
      });
      const marginProductIds = [...new Set(saleItemsForMargin.map((item) => item.productId).filter(Boolean))];
      const marginProducts = marginProductIds.length
        ? await Product.findAll({
          where: { id: { [Op.in]: marginProductIds }, tenantId },
          attributes: ['id', 'costPrice'],
        })
        : [];
      await runLowProfitMarginAutomations({
        tenantId,
        sale: createdSale,
        saleItems: saleItemsForMargin,
        productsById: new Map(marginProducts.map((product) => [product.id, product])),
        customer: createdSale.customer || null,
        actorUserId: userId || null,
      }).catch((err) =>
        console.error('[CreateSale] low_profit_margin automations failed:', err?.message || err)
      );
      mark('low-profit-margin:end');
    }
  } catch (error) {
    console.error('[CreateSale] Post-sale automation failed:', error?.message || error);
  }
};

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
exports.getSales = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const shopId = req.query.shopId;
    const customerId = req.query.customerId;
    const status = req.query.status;
    const orderStatus = req.query.orderStatus;
    const source = req.query.source;
    const activeOrders = req.query.activeOrders === 'true';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    let where = applyTenantFilter(req.tenantId, { deletedAt: null });
    // Shop-scoped staff see all sales in their assigned/current shop; non-shop staff keep owner-only visibility.
    if (shouldRestrictStaffToOwnSales(req)) {
      where.soldBy = req.user.id;
    }
    if (req.shopScoped) {
      where = applyShopFilter(req, where);
    } else if (shopId) {
      where.shopId = shopId;
    }
    if (customerId) {
      where.customerId = customerId;
    }
    if (status) {
      where.status = status;
    }
    if (orderStatus) {
      where.orderStatus = orderStatus;
    }
    if (source) {
      where[Op.and] = Array.isArray(where[Op.and]) ? [...where[Op.and]] : (where[Op.and] ? [where[Op.and]] : []);
      where[Op.and].push(sequelize.where(sequelize.json('metadata.source'), source));
    }
    if (activeOrders) {
      where.orderStatus = ACTIVE_KITCHEN_ORDER_STATUSES.includes(orderStatus)
        ? orderStatus
        : { [Op.in]: ACTIVE_KITCHEN_ORDER_STATUSES };
    }
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      where.createdAt = {
        [Op.between]: [start, end]
      };
    }
    if (search) {
      // Sale # lookup for returns/POS find-sale (customer name search deferred to avoid join edge cases)
      where.saleNumber = { [Op.iLike]: `%${search}%` };
    }

    const baseInclude = [
      { model: Shop, as: 'shop', attributes: ['id', 'name'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
      dealerReceiptInclude,
      { model: User, as: 'seller', attributes: ['id', 'name'] },
      { model: Invoice, as: 'invoice', attributes: ['id', 'status'], required: false },
      {
        model: SaleItem,
        as: 'items',
        attributes: ['id', 'productId', 'name', 'quantity', 'unitPrice', 'total'],
        required: false,
        include: [
          { model: Product, as: 'product', attributes: ['id', 'name', 'imageUrl'], required: false }
        ]
      }
    ];

    const { count, rows } = await Sale.findAndCountAll({
      where,
      attributes: { exclude: ['notes'] },
      limit,
      offset,
      include: baseInclude,
      order: [['createdAt', 'DESC']]
    });

    rows.forEach((row) => {
      const activeKitchenOrder = isActiveKitchenOrderRow(row);
      row.setDataValue('isActiveKitchenOrder', activeKitchenOrder);
      row.setDataValue('kitchenQueueStatus', activeKitchenOrder ? row.orderStatus : null);
    });

    // Cast status enum to text in CASE expressions — PostgreSQL does not match enum columns
    // to string literals inside CASE WHEN without ::text, which zeroed completed/revenue stats.
    const summary = await Sale.findOne({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
        [sequelize.literal(`COUNT(CASE WHEN "Sale"."status"::text = 'completed' THEN 1 END)`), 'completedCount'],
        [sequelize.literal(`COUNT(CASE WHEN "Sale"."status"::text = 'pending' THEN 1 END)`), 'pendingCount'],
        [sequelize.literal(`COALESCE(SUM(CASE WHEN "Sale"."status"::text = 'completed' THEN "Sale"."total" ELSE 0 END), 0)`), 'completedRevenue']
      ],
      raw: true
    });
    const activeKitchenPendingCount = await Sale.count({
      where: buildActiveKitchenOrderScopeWhere(req, where),
    });

    res.status(200).json({
      success: true,
      count,
      summary: {
        totalSales: Number(summary?.totalSales || count || 0),
        completedCount: Number(summary?.completedCount || 0),
        pendingCount: Number(summary?.pendingCount || 0),
        kitchenPendingCount: activeKitchenPendingCount,
        completedRevenue: Number(summary?.completedRevenue || 0)
      },
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      },
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export sales to CSV/Excel
// @route   GET /api/sales/export
// @access  Private (admin, manager)
exports.exportSales = async (req, res, next) => {
  try {
    const { format = 'csv', status } = req.query;
    const { sendCSV, sendExcel, COLUMN_DEFINITIONS } = require('../utils/dataExport');

    const where = applyTenantFilter(req.tenantId, {});
    if (status) where.status = status;

    const sales = await Sale.findAll({
      where,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      raw: false
    });
    const rows = sales.map((s) => {
      const plain = s.get({ plain: true });
      return { ...plain, customer: plain.customer || {} };
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No sales to export' });
    }

    const filename = `sales_${new Date().toISOString().split('T')[0]}`;
    const columns = COLUMN_DEFINITIONS.sales;

    if (format === 'excel') {
      await sendExcel(res, rows, `${filename}.xlsx`, { columns, sheetName: 'Sales', title: 'Sales List' });
    } else {
      sendCSV(res, rows, `${filename}.csv`, columns);
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get single sale
// @route   GET /api/sales/:id
// @access  Private
exports.getSale = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        { model: Shop, as: 'shop' },
        { model: Customer, as: 'customer' },
        dealerReceiptInclude,
        { model: User, as: 'seller' },
        {
          model: Invoice,
          as: 'invoice',
          include: [{ model: Customer, as: 'customer' }]
        },
        saleItemDetailInclude
      ]
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    // Soft-deleted sales stay in the database for audit purposes but are hidden from
    // everyday views; only admins (via getEffectiveRole) may still look them up.
    if (sale.deletedAt && getEffectiveRole(req) !== 'admin') {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    if (shouldRestrictStaffToOwnSales(req) && sale.soldBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this sale'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (error) {
    next(error);
  }
};

const createSaleCore = async (transaction, tenantId, userId, body, clientId = null, tenant = null, timer = null) => {
  const { items, cartDiscount: bodyCartDiscount, delivery, ...saleData } = sanitizePayload(body);
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Sale must have at least one item');
  }

  timer?.mark('catalog-resolve:start', { itemCount: items.length });
  const resolvedItems = await resolveSaleItemCatalogData({
    items,
    tenantId,
    shopId: saleData.shopId || null,
    transaction
  });
  timer?.mark('catalog-resolve:end', { itemCount: resolvedItems.length });

  const taxCacheHit = hasTaxConfigCache(tenantId);
  timer?.mark('tax-config-and-sale-number:start', { itemCount: resolvedItems.length, taxCacheHit });
  const taxConfigPromise = getTaxConfigForTenant(tenantId).then((config) => {
    timer?.mark('tax-config:end', { taxEnabled: !!config.enabled, taxCacheHit });
    return config;
  });
  const saleNumberPromise = generateSaleNumber(tenantId).then((result) => {
    timer?.mark('sale-number:end', {
      saleNumber: result.saleNumber,
      sequenceCacheHit: result.sequenceCacheHit
    });
    return result.saleNumber;
  });
  const [taxConfig, saleNumber] = await Promise.all([taxConfigPromise, saleNumberPromise]);
  const cartDiscount = Math.max(0, parseFloat(bodyCartDiscount) || 0);
  const lines = resolvedItems.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount || 0
  }));
  const computed = computeDocumentTax({
    lines,
    cartDiscount,
    config: taxConfig
  });
  timer?.mark('tax-compute:end', { itemCount: resolvedItems.length });
  const subtotal = computed.subtotal;
  const totalDiscount = computed.discount;
  const totalTax = computed.taxAmount;
  const deliveryResult = await resolveDeliveryForSale(tenantId, delivery);
  const deliveryFee = deliveryResult.fee;
  const total = Math.round((computed.total + deliveryFee) * 100) / 100;
  const amountPaid = saleData.amountPaid != null ? parseFloat(saleData.amountPaid) : total;
  const change = amountPaid > total ? Math.round((amountPaid - total) * 100) / 100 : 0;
  const isRestaurant = isRestaurantTenant(tenant);
  const saleStatus = saleData.status || 'completed';
  const paymentMethod = saleData.paymentMethod || 'cash';
  const saleChannel = saleData.saleChannel || (saleData.dealerId ? 'dealer' : 'retail');
  const isDealerChannel = saleChannel === 'dealer' || !!saleData.dealerId;
  const priorMeta = saleData.metadata && typeof saleData.metadata === 'object' ? saleData.metadata : {};
  let dealerChargeToAccount = 0;
  let dealer = null;

  if (isDealerChannel) {
    if (!saleData.dealerId) {
      throw new Error('Dealer is required for dealer sales');
    }
    const dealerWhereClause = applyTenantFilter(tenantId, {
      id: saleData.dealerId,
      isActive: true,
    });
    dealer = await Dealer.findOne({
      where: dealerWhereClause,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!dealer) {
      throw new Error('Dealer not found or inactive');
    }

    const chargeToAccount = saleData.chargeToAccount != null
      ? Math.max(0, parseFloat(saleData.chargeToAccount) || 0)
      : Math.max(0, Math.round((total - amountPaid) * 100) / 100);

    if (chargeToAccount > total + 0.001) {
      throw new Error('Charge to account cannot exceed sale total');
    }
    if (Math.abs((amountPaid + chargeToAccount) - total) > 0.02) {
      throw new Error('Amount paid plus charge to account must equal sale total');
    }

    const creditOverride = saleData.creditOverride === true
      || priorMeta.creditOverride === true;
    const creditCheck = checkCreditLimit(dealer, chargeToAccount, creditOverride);
    if (!creditCheck.allowed) {
      throw new Error('Sale exceeds dealer credit limit');
    }
    saleData.dealerId = dealer.id;
    saleData.saleChannel = 'dealer';
    saleData.customerId = null;
    dealerChargeToAccount = chargeToAccount;
  }

  if (
    isCreditInvoiceRequiredForSale({
      paymentMethod,
      status: saleStatus,
      total,
      amountPaid,
      saleChannel: saleData.saleChannel,
      dealerId: saleData.dealerId,
    })
    && !saleData.customerId
  ) {
    throw new Error('Customer is required for credit or partially unpaid sales');
  }
  const sendToKitchen = saleData.sendToKitchen !== false;
  const orderStatus = isRestaurant && sendToKitchen ? 'received' : null;

  delete saleData.chargeToAccount;
  delete saleData.creditOverride;
  timer?.mark('sale-insert:start');
  const sale = await Sale.create({
    ...saleData,
    tenantId,
    clientId: clientId || null,
    saleNumber,
    subtotal,
    discount: totalDiscount,
    tax: totalTax,
    total,
    deliveryRequired: deliveryResult.required,
    deliveryFee,
    deliveryBandId: deliveryResult.bandId,
    amountPaid,
    change,
    soldBy: userId,
    status: saleStatus,
    orderStatus,
    metadata: {
      ...priorMeta,
      ...(isDealerChannel ? {
        dealerChargeToAccount: dealerChargeToAccount,
        dealerSettlement: priorMeta.dealerSettlement || (dealerChargeToAccount >= total ? 'account' : amountPaid <= 0 ? 'account' : 'split'),
      } : {}),
      taxDetail: {
        ratePercent: taxConfig.enabled
          ? (computed.appliedRatePercent ?? taxConfig.defaultRatePercent)
          : 0,
        pricesAreTaxInclusive: taxConfig.pricesAreTaxInclusive,
        taxableExclusive: computed.netTaxable,
        taxAmount: totalTax,
        levies: computed.levies || [],
        scheme: taxConfig.scheme || 'standard',
      },
      delivery: deliveryResult.snapshot
    }
  }, { transaction });
  timer?.mark('sale-insert:end', { saleId: sale.id });

  timer?.mark('items-and-stock:start', { itemCount: resolvedItems.length });
  const saleItemRows = resolvedItems.map((item, index) => {
    const lr = computed.lineResults[index] || { exclusive: 0, tax: 0, gross: 0 };
    const lineSub = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    const lineItemTotal = Math.round((lr.exclusive + lr.tax) * 100) / 100;
    return {
      saleId: sale.id,
      productId: item.productId,
      productVariantId: item.productVariantId || null,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount || 0,
      tax: lr.tax,
      subtotal: lineSub,
      total: lineItemTotal,
      metadata: {
        ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
        productCode: item.productCode || null,
        unit: item.unit || null,
        originalUnitPrice: item.originalUnitPrice,
        catalogUnitPrice: item.catalogUnitPrice,
        priceOverridden: item.priceOverridden === true
      }
    };
  });

  timer?.mark('sale-items-bulk:start', { itemCount: saleItemRows.length });
  const createdItems = await SaleItem.bulkCreate(saleItemRows, { transaction, returning: true });
  timer?.mark('sale-items-bulk:end', { itemCount: createdItems.length });

  const saleShopId = sale.shopId || saleData.shopId || null;
  timer?.mark('stock-products-update:start', { itemCount: resolvedItems.length });
  const stockResults = await applySaleStockDecrements({
    tenantId,
    shopId: saleShopId,
    resolvedItems,
    saleId: sale.id,
    saleNumber,
    userId,
    transaction,
  });
  timer?.mark('stock-products-update:end', { productCount: stockResults.length });
  timer?.mark('stock-variants-update:start', { variantCount: 0 });
  timer?.mark('stock-variants-update:end', { variantCount: 0 });
  timer?.mark('items-and-stock:end', { itemCount: resolvedItems.length });

  if (isDealerChannel && dealerChargeToAccount > 0) {
    await recordSaleCharge({
      tenantId,
      dealerId: sale.dealerId,
      shopId: sale.shopId || saleData.shopId || null,
      amount: dealerChargeToAccount,
      saleId: sale.id,
      description: `Sale ${saleNumber} charged to account`,
      entryDate: sale.createdAt || new Date(),
      createdBy: userId || null,
      metadata: {
        saleNumber,
        amountPaid,
        chargeToAccount: dealerChargeToAccount,
      },
      transaction,
    });
  }

  return { sale, items: createdItems };
};

const createSaleCreatedActivity = async ({ sale, tenantId, userId }) => {
  await SaleActivity.create({
    saleId: sale.id,
    tenantId,
    type: 'note',
    subject: 'Sale Created',
    notes: `Sale ${sale.saleNumber} created`,
    createdBy: userId || null,
    metadata: {
      action: 'created',
      paymentMethod: sale.paymentMethod || 'cash',
      total: sale.total
    }
  });
};

const getSaleOutstandingBalance = (sale) => {
  const total = parseFloat(sale?.total || 0);
  const amountPaid = parseFloat(sale?.amountPaid || 0);
  return Math.max(total - amountPaid, 0);
};

const isCreditInvoiceRequiredForSale = (sale) => {
  if (!sale) return false;
  if (isDealerSale(sale)) return false;
  const paymentMethod = String(sale.paymentMethod || 'cash').toLowerCase();
  const status = String(sale.status || '').toLowerCase();
  const outstandingBalance = getSaleOutstandingBalance(sale);

  return (
    paymentMethod === 'credit' ||
    status === 'partially_paid' ||
    (status === 'completed' && outstandingBalance > 0.01)
  );
};

const ensureRequiredCreditSaleInvoice = async (sale, tenantId, logPrefix = 'Sale') => {
  if (!isCreditInvoiceRequiredForSale(sale)) return null;

  const invoice = await autoCreateInvoiceFromSale(sale.id, tenantId);
  if (!invoice) {
    throw new Error('Failed to create invoice for credit sale');
  }

  if (typeof sale.set === 'function') {
    sale.set('invoiceId', invoice.id);
  } else {
    sale.invoiceId = invoice.id;
  }

  console.log(`[${logPrefix}] Required credit invoice ready: ${invoice.invoiceNumber}`);
  return invoice;
};

// @desc    Create new sale (POS transaction)
// @route   POST /api/sales
// @access  Private
exports.createSale = async (req, res, next) => {
  const timer = createSaleTimer(req.tenantId);
  const clientId = req.body.clientId || null;
  let transaction = null;
  let transactionCommitted = false;

  try {
    timer.mark('request:start', {
      itemCount: Array.isArray(req.body?.items) ? req.body.items.length : 0,
      paymentMethod: req.body?.paymentMethod,
      status: req.body?.status
    });

    transaction = await sequelize.transaction();
    const saleBody = attachShopToPayload(req, req.body);
    timer.mark('core:start');
    const { sale, items } = await createSaleCore(transaction, req.tenantId, req.user.id, saleBody, clientId, req.tenant, timer);
    timer.mark('core:end', { saleId: sale.id, saleNumber: sale.saleNumber });
    const isRestaurant = isRestaurantTenant(req.tenant);

    timer.mark('commit:start');
    await transaction.commit();
    transactionCommitted = true;
    timer.mark('commit:end');

    if (isCreditInvoiceRequiredForSale(sale)) {
      timer.mark('required-invoice:start');
      await ensureRequiredCreditSaleInvoice(sale, req.tenantId, 'CreateSale');
      timer.mark('required-invoice:end', { invoiceId: sale.invoiceId || null });
    }

    timer.mark('response-build:start');
    const saleResponse = buildLightweightSaleResponse(sale, items);
    timer.mark('response-build:end', { payloadBytesApprox: JSON.stringify(saleResponse).length });

    timer.mark('cache-invalidate:start');
    invalidateSaleMutationCaches(req.tenantId);
    timer.mark('cache-invalidate:end');

    res.status(201).json({
      success: true,
      data: saleResponse
    });
    timer.mark('response-sent');

    setImmediate(() => {
      timer.mark('background:start');
      const stampPromise = (async () => {
        try {
          const evatService = require('../services/evatService');
          const plain = typeof sale.get === 'function' ? sale.get({ plain: true }) : sale;
          plain.items = items;
          plain.documentType = 'sale_receipt';
          const metadata = await evatService.stampDocumentIfEnabled(
            req.tenantId,
            plain,
            plain.metadata || {}
          );
          if (metadata) {
            await Sale.update(
              { metadata },
              { where: { id: sale.id, tenantId: req.tenantId } }
            );
            if (metadata.graStampQueue?.lastError) {
              console.warn('[CreateSale] e-VAT stamp queued:', metadata.graStampQueue.lastError);
            }
          }
        } catch (err) {
          console.warn('[CreateSale] e-VAT stamp skipped/failed:', err?.message || err);
        }
      })();

      Promise.all([
        stampPromise,
        runPostSaleAutomation({
          sale,
          items,
          tenantId: req.tenantId,
          userId: req.user?.id,
          isRestaurant,
          timer
        }),
      ]).finally(() => timer.mark('background:end'));
    });
  } catch (error) {
    timer.mark('error', { message: error?.message });

    if (clientId && error?.name === 'SequelizeUniqueConstraintError') {
      if (transaction && !transactionCommitted) {
        await transaction.rollback().catch(() => {});
        transactionCommitted = true;
      }

      const existing = await findExistingSaleByClientId(req.tenantId, clientId);
      if (existing) {
        timer.mark('response-sent');
        return res.status(201).json({
          success: true,
          data: buildLightweightSaleResponse(existing, [])
        });
      }
    }

    if (transaction && !transactionCommitted) {
      timer.mark('rollback:start');
      await transaction.rollback();
      timer.mark('rollback:end');
    }
    next(error);
  }
};

// @desc    Batch sync offline sales (idempotent by clientId)
// @route   POST /api/sales/sync
// @body    { items: [{ clientId, payload }] } where payload is same as createSale body
// @access  Private
exports.batchSyncSales = async (req, res, next) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'items array is required'
    });
  }
  const results = [];
  for (const { clientId, payload } of items) {
    if (!payload || !payload.items?.length) {
      results.push({ clientId: clientId || null, error: 'Invalid payload' });
      continue;
    }

    if (clientId) {
      const existing = await findExistingSaleByClientId(req.tenantId, clientId);
      if (existing) {
        results.push({ clientId, id: existing.id, duplicate: true });
        continue;
      }
    }

    const transaction = await sequelize.transaction();
    let transactionCommitted = false;
    try {
      const { sale, items } = await createSaleCore(
        transaction,
        req.tenantId,
        req.user.id,
        payload,
        clientId || null,
        req.tenant
      );
      await transaction.commit();
      transactionCommitted = true;
      await ensureRequiredCreditSaleInvoice(sale, req.tenantId, 'BatchSyncSales');
      results.push({ clientId: clientId || null, id: sale.id });

      const tenantId = req.tenantId;
      const userId = req.user?.id;
      const isRestaurant = isRestaurantTenant(req.tenant);
      setImmediate(() => {
        runPostSaleAutomation({
          sale,
          items: items || [],
          tenantId,
          userId,
          isRestaurant,
        }).catch((postErr) =>
          console.error('[batchSyncSales] Post-commit failed for sale', sale.id, postErr?.message || postErr)
        );
      });
    } catch (err) {
      if (!transactionCommitted) {
        await transaction.rollback();
      }
      if (clientId && err?.name === 'SequelizeUniqueConstraintError') {
        const existing = await findExistingSaleByClientId(req.tenantId, clientId);
        if (existing) {
          results.push({ clientId, id: existing.id, duplicate: true });
          continue;
        }
      }
      results.push({
        clientId: clientId || null,
        error: err?.message || 'Sync failed'
      });
    }
  }
  if (results.some((result) => result.id)) {
    invalidateSaleMutationCaches(req.tenantId);
  }
  res.status(200).json({ success: true, results });
};

// @desc    Update sale
// @route   PUT /api/sales/:id
// @access  Private
exports.updateSale = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      await transaction.rollback();
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    // Only allow updating certain fields (status, notes, etc.)
    const allowedFields = ['status', 'notes', 'metadata', 'deliveryStatus'];
    const payload = sanitizePayload(req.body);
    const updateData = {};
    
    allowedFields.forEach(field => {
      if (payload[field] !== undefined) {
        updateData[field] = payload[field];
      }
    });

    if (updateData.deliveryStatus !== undefined) {
      const parsed = parseDeliveryStatusInput(updateData.deliveryStatus);
      if (parsed === undefined) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid deliveryStatus'
        });
      }
      updateData.deliveryStatus = parsed;
    }

    const previousStatus = sale.status;
    const previousDeliveryStatus = sale.deliveryStatus || null;
    const statusFieldsChanged = (
      (updateData.status !== undefined && String(updateData.status || '') !== String(previousStatus || '')) ||
      (updateData.deliveryStatus !== undefined && String(updateData.deliveryStatus || '') !== String(previousDeliveryStatus || '')) ||
      updateData.metadata !== undefined
    );

    if (statusFieldsChanged && hasCustomerConfirmedDelivery(sale)) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: CUSTOMER_CONFIRMED_DELIVERY_ERROR_MESSAGE,
        errorCode: CUSTOMER_CONFIRMED_DELIVERY_ERROR_CODE,
      });
    }

    // Validate incremental status progression
    if (updateData.status && updateData.status !== previousStatus) {
      // Define status progression order (incremental only)
      const statusOrder = {
        'pending': 1,
        'partially_paid': 2,
        'completed': 3,
        'refunded': 4,  // terminal
        'cancelled': 4  // terminal
      };

      const previousOrder = statusOrder[previousStatus];
      const newOrder = statusOrder[updateData.status];

      // Terminal states cannot be changed from
      if (previousStatus === 'refunded' || previousStatus === 'cancelled') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot change status from '${previousStatus}'. Once a sale is ${previousStatus}, the status cannot be changed.`
        });
      }

      // Validate that status change is forward/incremental only
      if (newOrder < previousOrder) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot change status from '${previousStatus}' to '${updateData.status}'. Status changes must be incremental (forward progression only).`
        });
      }

      const candidateSale = {
        paymentMethod: sale.paymentMethod,
        status: updateData.status,
        total: sale.total,
        amountPaid: sale.amountPaid,
        saleChannel: sale.saleChannel,
        dealerId: sale.dealerId,
      };
      if (isCreditInvoiceRequiredForSale(candidateSale) && !sale.customerId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Customer is required for credit or partially unpaid sales'
        });
      }
    }

    await sale.update(updateData, { transaction });

    const deliveryStatusChanged =
      updateData.deliveryStatus !== undefined &&
      String(updateData.deliveryStatus || '') !== String(previousDeliveryStatus || '');

    const DELIVERY_LABELS = {
      ready_for_delivery: 'Ready for delivery',
      out_for_delivery: 'Out for delivery',
      delivered: 'Delivered',
      returned: 'Returned'
    };

    if (updateData.status && updateData.status !== previousStatus) {
      const statusLabels = {
        pending: 'Pending',
        partially_paid: 'Partially paid',
        completed: 'Completed',
        cancelled: 'Cancelled',
        refunded: 'Refunded'
      };
      const oldStatusLabel = statusLabels[previousStatus] || previousStatus;
      const newStatusLabel = statusLabels[updateData.status] || updateData.status;
      await SaleActivity.create({
        saleId: sale.id,
        tenantId: req.tenantId,
        type: 'status_change',
        subject: 'Status Updated',
        notes: `Status changed from ${oldStatusLabel} to ${newStatusLabel}`,
        createdBy: req.user?.id || null,
        metadata: {
          oldStatus: previousStatus,
          newStatus: updateData.status
        }
      }, { transaction });
    }

    if (deliveryStatusChanged) {
      const oldL = previousDeliveryStatus
        ? DELIVERY_LABELS[previousDeliveryStatus] || previousDeliveryStatus
        : 'Not set';
      const newL = updateData.deliveryStatus
        ? DELIVERY_LABELS[updateData.deliveryStatus] || updateData.deliveryStatus
        : 'Not set';
      await SaleActivity.create({
        saleId: sale.id,
        tenantId: req.tenantId,
        type: 'note',
        subject: 'Delivery status updated',
        notes: `Delivery status changed from ${oldL} to ${newL}`,
        createdBy: req.user?.id || null,
        metadata: {
          deliveryStatusChange: true,
          oldDeliveryStatus: previousDeliveryStatus,
          newDeliveryStatus: updateData.deliveryStatus
        }
      }, { transaction });
    }

    const otherUpdatedKeys = Object.keys(updateData).filter(
      (k) => k !== 'status' && k !== 'deliveryStatus'
    );
    if (
      !(updateData.status && updateData.status !== previousStatus) &&
      !deliveryStatusChanged &&
      otherUpdatedKeys.length > 0
    ) {
      await SaleActivity.create({
        saleId: sale.id,
        tenantId: req.tenantId,
        type: 'note',
        subject: 'Sale Updated',
        notes: 'Details were updated',
        createdBy: req.user?.id || null,
        metadata: {}
      }, { transaction });
    }

    if (updateData.status && updateData.status !== previousStatus) {
      // Auto-create invoice when sale status changes to 'completed' (handled after commit)
      if (updateData.status === 'completed' && !sale.invoiceId) {
        // Note: This will be handled after transaction commit
      }
    }

    await transaction.commit();

    // Credit sales must get an invoice before the response returns.
    if (isCreditInvoiceRequiredForSale(sale)) {
      try {
        await ensureRequiredCreditSaleInvoice(sale, req.tenantId, 'UpdateSale');
      } catch (invoiceError) {
        console.error('[UpdateSale] Failed to ensure required credit invoice:', invoiceError?.message);
        throw invoiceError;
      }
    }

    // Fetch updated sale
    const updatedSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Shop, as: 'shop' },
        { model: Customer, as: 'customer' },
        dealerReceiptInclude,
        { model: User, as: 'seller' },
        { model: Invoice, as: 'invoice' },
        saleItemDetailInclude
      ]
    });

    invalidateSaleMutationCaches(req.tenantId);
    res.status(200).json({
      success: true,
      data: updatedSale
    });

    // Journals, optional auto-invoice, receipt, and review after response (mirrors createSale).
    if (updateData.status === 'completed') {
      const tenantId = req.tenantId;
      const userId = req.user?.id || null;
      const becameCompleted = previousStatus !== 'completed';
      setImmediate(async () => {
        try {
          if (!sale.invoiceId && !isDealerSale(sale)) {
            try {
              console.log(`[UpdateSale] Attempting to auto-create invoice for sale ${sale.id}`);
              const autoGeneratedInvoice = await autoCreateInvoiceFromSale(sale.id, tenantId);
              if (autoGeneratedInvoice) {
                console.log(`[UpdateSale] ✅ Invoice auto-created: ${autoGeneratedInvoice.invoiceNumber}`);
              }
            } catch (invoiceError) {
              console.error('[UpdateSale] ❌ Failed to auto-create invoice:', invoiceError?.message);
            }
          }
          try {
            await createSaleRevenueJournal(tenantId, sale.id, userId);
          } catch (revError) {
            console.error('[UpdateSale] Failed to create sale revenue journal:', revError?.message);
          }
          try {
            await createSaleCogsJournal(tenantId, sale.id, userId);
          } catch (cogsError) {
            console.error('[UpdateSale] Failed to create COGS journal:', cogsError?.message);
          }
          await autoSendReceiptIfEnabled(tenantId, sale.id).catch((receiptErr) =>
            console.error('[UpdateSale] Auto-send receipt failed:', receiptErr?.message || receiptErr)
          );

          if (becameCompleted && updatedSale?.customerId && !isDealerSale(updatedSale)) {
            await runReviewRequestAutomations({
              tenantId,
              sourceType: 'sale',
              source: updatedSale,
              customer: updatedSale.customer || null,
              actorUserId: userId,
            }).catch((err) =>
              console.error('[UpdateSale] review_request automations failed:', err?.message || err)
            );
          }
        } catch (bgErr) {
          console.error('[UpdateSale] Background completion work failed:', bgErr?.message || bgErr);
        }
      });
    }
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// Map sale payment method to Payment model enum (Payment has credit_card not card)
const salePaymentMethodToPaymentModel = (method) => {
  if (!method) return 'cash';
  const m = String(method).toLowerCase();
  if (m === 'card') return 'credit_card';
  if (['cash', 'mobile_money', 'check', 'bank_transfer', 'other'].includes(m)) return m;
  return 'other';
};

// @desc    Record payment on a sale (partial or full)
// @route   POST /api/sales/:id/payment
// @access  Private
exports.recordPayment = async (req, res, next) => {
  try {
    const body = sanitizePayload(req.body);
    const { amount, paymentMethod, referenceNumber, paymentDate } = body;
    const paymentNotes = resolvePaymentNotesFromBody(body);

    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: SaleItem, as: 'items' }
      ]
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    if (sale.status === 'cancelled' || sale.status === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'Cannot record payment on a cancelled or refunded sale'
      });
    }

    const totalAmount = parseFloat(sale.total || 0);
    const currentPaid = parseFloat(sale.amountPaid || 0);
    const balanceDue = Math.max(totalAmount - currentPaid, 0);

    if (balanceDue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale is already fully paid'
      });
    }

    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than 0'
      });
    }
    if (paymentAmount > balanceDue) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed balance due (₵ ${balanceDue.toFixed(2)})`
      });
    }

    const newAmountPaid = Math.min(currentPaid + paymentAmount, totalAmount);
    const effectivePaymentDate = paymentDate ? new Date(paymentDate) : new Date();
    const previousStatus = sale.status;
    const isNowCompleted = newAmountPaid >= totalAmount;

    const updatePayload = {
      amountPaid: newAmountPaid
    };
    if (paymentMethod) {
      updatePayload.paymentMethod = paymentMethod;
    }
    if (isNowCompleted) {
      updatePayload.status = 'completed';
    } else {
      updatePayload.status = 'partially_paid';
    }

    if (isCreditInvoiceRequiredForSale({
      paymentMethod: paymentMethod || sale.paymentMethod,
      status: updatePayload.status,
      total: totalAmount,
      amountPaid: newAmountPaid,
      saleChannel: sale.saleChannel,
      dealerId: sale.dealerId,
    }) && !sale.customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required for credit or partially unpaid sales'
      });
    }

    await sale.update(updatePayload);

    const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const payment = await Payment.create({
      paymentNumber,
      type: 'income',
      customerId: sale.customerId,
      tenantId: req.tenantId,
      amount: paymentAmount,
      paymentMethod: salePaymentMethodToPaymentModel(paymentMethod || sale.paymentMethod),
      paymentDate: effectivePaymentDate,
      referenceNumber: referenceNumber || null,
      status: 'completed',
      description: `sale:${sale.id}`,
      notes: paymentNotes || null
    });

    const activityNote = paymentNotes
      || `₵ ${paymentAmount.toFixed(2)} received (${paymentMethod || sale.paymentMethod || 'cash'}). Total paid: ₵ ${newAmountPaid.toFixed(2)}${isNowCompleted ? ' – Sale completed' : ''}`;

    await SaleActivity.create({
      saleId: sale.id,
      tenantId: req.tenantId,
      type: 'payment',
      subject: 'Payment recorded',
      notes: activityNote,
      createdBy: req.user?.id || null,
      metadata: {
        amount: paymentAmount,
        paymentMethod: paymentMethod || sale.paymentMethod,
        previousAmountPaid: currentPaid,
        newAmountPaid: newAmountPaid,
        completed: isNowCompleted
      }
    });

    if (isCreditInvoiceRequiredForSale(sale)) {
      try {
        await ensureRequiredCreditSaleInvoice(sale, req.tenantId, 'RecordPayment');
      } catch (invoiceError) {
        console.error('[RecordPayment] Failed to ensure required credit invoice:', invoiceError?.message);
        throw invoiceError;
      }
    }

    if (sale.customerId) {
      try {
        await syncSaleInvoiceAndRefreshCustomerBalance(sale, { tenantId: req.tenantId });
      } catch (balanceError) {
        console.error('[RecordPayment] Failed to sync invoice/customer balance:', balanceError?.message);
      }
    }

    const updatedSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Shop, as: 'shop' },
        { model: Customer, as: 'customer' },
        { model: User, as: 'seller' },
        { model: Invoice, as: 'invoice' },
        saleItemDetailInclude
      ]
    });

    invalidateSaleMutationCaches(req.tenantId);
    if (isNowCompleted && (previousStatus === 'pending' || previousStatus === 'partially_paid')) {
      try {
        emitSaleStatusChange(req.tenantId, updatedSale, previousStatus);
      } catch (wsErr) {
        console.error('[RecordPayment] WebSocket emit error:', wsErr?.message);
      }
    }

    res.status(200).json({
      success: true,
      data: updatedSale,
      message: isNowCompleted ? 'Payment recorded and sale completed' : 'Payment recorded'
    });

    const tenantId = req.tenantId;
    const userId = req.user?.id || null;
    const becameCompleted = isNowCompleted && (previousStatus === 'pending' || previousStatus === 'partially_paid');

    setImmediate(async () => {
      try {
        try {
          await maybeCreateCommissionForPayment({
            tenantId,
            paymentAmount,
            paymentId: payment.id,
            saleId: sale.id,
            invoiceId: sale.invoiceId || null,
            customerId: sale.customerId || null,
          });
        } catch (partnerErr) {
          console.error('[RecordPayment] Partner commission failed:', partnerErr?.message || partnerErr);
        }

        if (!becameCompleted) return;

        if (!sale.invoiceId) {
          try {
            const autoGeneratedInvoice = await autoCreateInvoiceFromSale(sale.id, tenantId);
            if (autoGeneratedInvoice) {
              console.log('[RecordPayment] ✅ Invoice auto-created:', autoGeneratedInvoice.invoiceNumber);
            }
          } catch (invoiceError) {
            console.error('[RecordPayment] Failed to auto-create invoice:', invoiceError?.message);
          }
        }
        try {
          await createSaleRevenueJournal(tenantId, sale.id, userId);
        } catch (revError) {
          console.error('[RecordPayment] Failed to create sale revenue journal:', revError?.message);
        }
        try {
          await createSaleCogsJournal(tenantId, sale.id, userId);
        } catch (cogsError) {
          console.error('[RecordPayment] Failed to create COGS journal:', cogsError?.message);
        }
        await autoSendReceiptIfEnabled(tenantId, sale.id).catch((receiptErr) =>
          console.error('[RecordPayment] Auto-send receipt failed:', receiptErr?.message || receiptErr)
        );

        if (updatedSale?.customerId && !isDealerSale(updatedSale)) {
          await runReviewRequestAutomations({
            tenantId,
            sourceType: 'sale',
            source: updatedSale,
            customer: updatedSale.customer || null,
            actorUserId: userId,
          }).catch((err) =>
            console.error('[RecordPayment] review_request automations failed:', err?.message || err)
          );
        }
      } catch (bgErr) {
        console.error('[RecordPayment] Background post-payment work failed:', bgErr?.message || bgErr);
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel/Refund sale
// @route   POST /api/sales/:id/cancel
// @access  Private
exports.cancelSale = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [{ model: SaleItem, as: 'items' }]
    }, { transaction });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      await transaction.rollback();
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    if (sale.status === 'cancelled' || sale.status === 'refunded') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Sale is already cancelled or refunded'
      });
    }

    // Restore product stock (skip when trackStock is false - made-to-order)
    const restoreShopId = sale.shopId || null;
    for (const item of sale.items) {
      if (!item.productId && !item.productVariantId) {
        continue;
      }
      if (restoreShopId && item.productId) {
        await applyStockChange({
          tenantId: req.tenantId,
          productId: item.productId,
          productVariantId: item.productVariantId || null,
          shopId: restoreShopId,
          delta: parseStockQuantity(item.quantity),
          type: 'sale_void',
          reason: sale.saleNumber ? `Sale ${sale.saleNumber} cancelled` : 'Sale cancelled',
          reference: `sale:${sale.id}`,
          userId: req.user?.id || null,
          metadata: { source: 'cancelSale' },
          transaction,
        });
        continue;
      }

      const product = await Product.findByPk(item.productId, { transaction });
      if (!item.productVariantId && product && product.trackStock !== false) {
        const newQuantity = parseFloat(product.quantityOnHand || 0) + parseFloat(item.quantity);
        await product.update({ quantityOnHand: newQuantity }, { transaction });
      }

      if (item.productVariantId) {
        const variant = await ProductVariant.findByPk(item.productVariantId, { transaction });
        const parent = product || await Product.findByPk(item.productId, { transaction });
        if (variant && parent?.trackStock !== false && variant.trackStock !== false) {
          const newVariantQuantity = parseFloat(variant.quantityOnHand || 0) + parseFloat(item.quantity);
          await variant.update({ quantityOnHand: newVariantQuantity }, { transaction });
        }
      }
    }

    // Update sale status
    await sale.update({ status: 'cancelled' }, { transaction });

    await transaction.commit();
    invalidateSaleMutationCaches(req.tenantId);

    res.status(200).json({
      success: true,
      data: sale,
      message: 'Sale cancelled and stock restored'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// @desc    Generate invoice from sale
// @route   POST /api/sales/:id/generate-invoice
// @access  Private
exports.generateInvoice = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        { model: SaleItem, as: 'items' },
        { model: Customer, as: 'customer' },
        { model: Shop, as: 'shop' }
      ]
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    // Check if invoice already exists
    const existingInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { saleId: sale.id })
    });

    if (existingInvoice) {
      invalidateInvoiceListCache(req.tenantId);
      return res.status(200).json({ success: true, data: existingInvoice });
    }

    if (!sale.customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required to generate an invoice for a sale'
      });
    }

    if (isDealerSale(sale)) {
      return res.status(400).json({
        success: false,
        message: 'Dealer sales do not generate retail invoices in v1'
      });
    }

    const invoice = await autoCreateInvoiceFromSale(sale.id, req.tenantId);
    if (!invoice) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate invoice for this sale'
      });
    }

    const updatedInvoice = await Invoice.findOne({
      where: applyTenantFilter(req.tenantId, { id: invoice.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: Sale, as: 'sale' }
      ]
    });

    invalidateInvoiceListCache(req.tenantId);

    res.status(201).json({
      success: true,
      message: 'Invoice generated successfully',
      data: updatedInvoice
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get sale receipt data for printing
// @route   GET /api/sales/:id/receipt
// @access  Private
exports.printReceipt = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        saleItemDetailInclude,
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
        dealerReceiptInclude,
        {
          model: Shop,
          as: 'shop',
          attributes: ['id', 'name', 'address', 'city', 'state', 'country', 'postalCode', 'phone', 'email', 'logoUrl']
        },
        { model: User, as: 'seller', attributes: ['id', 'name'] }
      ]
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status (restaurant kitchen only)
// @route   PATCH /api/sales/:id/order-status
// @access  Private
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    if (!isRestaurantTenant(req.tenant)) {
      return res.status(400).json({
        success: false,
        message: 'Order status tracking is only available for restaurant tenants'
      });
    }

    const { orderStatus } = req.body;
    const validStatuses = ['received', 'preparing', 'ready', 'completed'];
    if (!orderStatus || !validStatuses.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid orderStatus. Must be one of: received, preparing, ready, completed'
      });
    }

    const oldOrderStatus = sale.orderStatus || null;
    if (oldOrderStatus === orderStatus) {
      const unchangedSale = await Sale.findByPk(sale.id, {
        include: [
          { model: Shop, as: 'shop' },
          { model: Customer, as: 'customer' },
          { model: User, as: 'seller' },
          saleItemDetailInclude
        ]
      });
      return res.status(200).json({
        success: true,
        data: unchangedSale || sale,
      });
    }

    const updateData = { orderStatus };
    if (orderStatus === 'completed' && sale.status === 'pending') {
      updateData.status = 'completed';
    }
    await sale.update(updateData);

    // Notify staff of order status change (fire-and-forget, don't block response)
    notifyOrderStatusChanged({
      sale: { ...sale.toJSON(), orderStatus },
      oldStatus: oldOrderStatus,
      newStatus: orderStatus,
      triggeredBy: req.user?.id
    }).catch((err) => console.error('[updateOrderStatus] Notification failed:', err?.message));

    setImmediate(async () => {
      try {
        const { runOrderStatusStaffAutomations } = require('../services/automationEngineService');
        const saleForAutomation = await Sale.findByPk(sale.id, {
          include: [{ model: Customer, as: 'customer' }],
        });
        await runOrderStatusStaffAutomations({
          tenantId: req.tenantId,
          sale: saleForAutomation || { ...sale.toJSON(), orderStatus },
          customer: saleForAutomation?.customer || null,
          orderStatus,
          previousStatus: oldOrderStatus,
          actorUserId: req.user?.id || null,
        });
      } catch (automationErr) {
        console.error('[updateOrderStatus] order_status_staff automations failed:', automationErr?.message || automationErr);
      }

      try {
        const { notifyOrderStatusChangedForCustomer } = require('../services/orderCustomerNotificationService');
        const saleForSms = await Sale.findByPk(sale.id, {
          include: [{ model: Customer, as: 'customer' }],
        });
        await notifyOrderStatusChangedForCustomer({
          tenantId: req.tenantId,
          sale: saleForSms || { ...sale.toJSON(), orderStatus },
          newStatus: orderStatus,
          previousStatus: oldOrderStatus,
        });
      } catch (smsErr) {
        console.error('[updateOrderStatus] customer status SMS failed:', smsErr?.message || smsErr);
      }
    });

    const updatedSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Shop, as: 'shop' },
        { model: Customer, as: 'customer' },
        { model: User, as: 'seller' },
        saleItemDetailInclude
      ]
    });

    invalidateSaleMutationCaches(req.tenantId);
    res.status(200).json({
      success: true,
      data: updatedSale
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update delivery status (all business types; public tracking uses delivery timeline when set)
// @route   PATCH /api/sales/:id/delivery-status
// @access  Private
exports.updateDeliveryStatus = async (req, res, next) => {
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'deliveryStatus')) {
    return res.status(400).json({
      success: false,
      message: 'deliveryStatus is required (send null to clear)'
    });
  }
  const { deliveryStatus } = req.body;
  req.body = { deliveryStatus };
  return exports.updateSale(req, res, next);
};

exports.addSaleActivity = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const payload = sanitizePayload(req.body);

    const activity = await SaleActivity.create({
      saleId: sale.id,
      tenantId: req.tenantId,
      type: payload.type || 'note',
      subject: payload.subject || null,
      notes: payload.notes || null,
      createdBy: req.user?.id || null,
      nextStep: payload.nextStep || null,
      followUpDate: payload.followUpDate || null,
      metadata: payload.metadata || {}
    });

    const populatedActivity = await SaleActivity.findOne({
      where: applyTenantFilter(req.tenantId, { id: activity.id }),
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(201).json({ success: true, data: populatedActivity });
  } catch (error) {
    next(error);
  }
};

exports.getSaleActivities = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const activities = await SaleActivity.findAll({
      where: applyTenantFilter(req.tenantId, { saleId: sale.id }),
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
};

// @desc    Send receipt via SMS/WhatsApp/Email
// @route   POST /api/sales/:id/send-receipt
// @access  Private
exports.sendReceipt = async (req, res, next) => {
  try {
    const { channels, phone, email } = req.body;

    if (!channels || !Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one delivery channel is required'
      });
    }

    // Get sale with all details
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        saleItemDetailInclude,
        { model: Customer, as: 'customer' },
        { model: Shop, as: 'shop' },
        { model: Tenant, as: 'tenant', attributes: ['id', 'name'] },
        { model: User, as: 'seller', attributes: ['id', 'name'] }
      ]
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const {
      hasRecentReceiptForSale,
      getAutomationCoveredChannelsForTemplate,
      TEMPLATE_KEYS,
    } = require('../services/customerNotificationBridgeService');

    // Automation coverage and dedupe are checked per-channel below (not as a blanket
    // all-or-nothing gate) — an enabled "sale receipt" automation that only sends
    // WhatsApp/email, or an auto-sent email, must not silently swallow a manually
    // requested SMS send.
    const automationHandledChannels = await getAutomationCoveredChannelsForTemplate(
      req.tenantId,
      TEMPLATE_KEYS.SALE_COMPLETED_RECEIPT
    );

    // Determine phone and email to use; normalize phone for SMS/WhatsApp (0XX / +233)
    const rawPhone = phone || sale.customer?.phone;
    const { formatToE164 } = require('../utils/phoneUtils');
    const recipientPhone = rawPhone ? (formatToE164(rawPhone) || rawPhone) : null;
    const recipientEmail = email || sale.customer?.email;

    const results = {
      sms: null,
      whatsapp: null,
      email: null
    };

    // Build receipt message (long format for email/WhatsApp; short template for SMS)
    const receiptMessage = buildReceiptMessage(sale, req.tenantId);
    const receiptSmsMessage = await buildReceiptSmsMessage(sale, req.tenantId);

    const { isChannelEnabledForEvent } = require('../services/messageDeliveryRulesService');

    // Send via requested channels
    for (const channel of channels) {
      try {
        if (automationHandledChannels.has(channel)) {
          results[channel] = { success: true, managedByAutomation: true };
          continue;
        }
        if (await hasRecentReceiptForSale(req.tenantId, sale.id, channel)) {
          results[channel] = { success: true, deduped: true };
          continue;
        }
        const channelAllowed = await isChannelEnabledForEvent(req.tenantId, 'sales_receipt', channel);
        if (!channelAllowed) {
          results[channel] = { success: false, error: 'Channel disabled in delivery rules' };
          continue;
        }
        switch (channel) {
          case 'sms':
            if (!recipientPhone) {
              results.sms = { success: false, error: 'No phone number provided' };
              break;
            }
            results.sms = await sendSMSReceipt(
              req.tenantId,
              recipientPhone,
              receiptSmsMessage || receiptMessage
            );
            break;

          case 'whatsapp':
            if (!recipientPhone) {
              results.whatsapp = { success: false, error: 'No phone number provided' };
              break;
            }
            results.whatsapp = await sendWhatsAppReceipt(req.tenantId, recipientPhone, sale, receiptMessage);
            break;

          case 'email':
            if (!recipientEmail) {
              results.email = { success: false, error: 'No email address provided' };
              break;
            }
            results.email = await sendEmailReceipt(req.tenantId, recipientEmail, sale, receiptMessage);
            break;

          default:
            results[channel] = { success: false, error: 'Unknown channel' };
        }
      } catch (channelError) {
        console.error(`Failed to send receipt via ${channel}:`, channelError);
        results[channel] = { success: false, error: channelError.message };
      }
    }

    // Log activity only for channels that actually succeeded, so the dedupe window and
    // audit trail reflect what was really delivered (not just "attempted").
    const sentChannels = channels.filter((channel) => results[channel]?.success);
    if (sentChannels.length > 0) {
      await SaleActivity.create({
        saleId: sale.id,
        tenantId: req.tenantId,
        type: 'receipt_sent',
        subject: 'Receipt Sent',
        notes: `Receipt sent via: ${sentChannels.join(', ')}`,
        createdBy: req.user?.id || null,
        metadata: { channels: sentChannels, results, phone: recipientPhone, email: recipientEmail }
      });
    }

    const anyFailed = channels.some((channel) => results[channel]?.success === false);

    res.status(200).json({
      success: true,
      // Request was processed; check `data[channel].success` for the actual outcome per channel.
      message: anyFailed ? 'Receipt delivery failed for one or more channels' : 'Receipt delivery processed',
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * If tenant has "auto send receipt to customer" enabled, send receipt via all configured channels.
 * Used by sale creation and completion paths; skips quietly when no customer contact is available.
 */
async function autoSendReceiptIfEnabled(tenantId, saleId) {
  const {
    TEMPLATE_KEYS,
    isPosAutoSendReceiptEnabled,
    getAutomationCoveredChannelsForTemplate,
    hasRecentReceiptForSale,
    recordReceiptSentActivity,
  } = require('../services/customerNotificationBridgeService');

  const prefs = await Setting.findOne({ where: { tenantId, key: 'customer-notification-preferences' } });
  const settingOn = prefs?.value?.autoSendReceiptToCustomer === true;
  const posAutoSend = await isPosAutoSendReceiptEnabled(tenantId);
  // Legacy auto-send only when explicitly enabled — automations run separately via runSaleCompletedAutomations.
  if (!settingOn && !posAutoSend) return;

  const automationHandledChannels = await getAutomationCoveredChannelsForTemplate(
    tenantId,
    TEMPLATE_KEYS.SALE_COMPLETED_RECEIPT
  );

  const sale = await Sale.findOne({
    where: { tenantId, id: saleId },
    include: [
      saleItemDetailInclude,
      { model: Customer, as: 'customer' },
      { model: Shop, as: 'shop' },
      { model: Tenant, as: 'tenant', attributes: ['id', 'name'] }
    ]
  });
  if (!sale?.customer) return;

  const { isChannelEnabledForEvent } = require('../services/messageDeliveryRulesService');
  const smsService = require('../services/smsService');
  const whatsappService = require('../services/whatsappService');
  const emailService = require('../services/emailService');
  const [emailAllowed, smsAllowed, whatsappAllowed] = await Promise.all([
    isChannelEnabledForEvent(tenantId, 'sales_receipt', 'email'),
    isChannelEnabledForEvent(tenantId, 'sales_receipt', 'sms'),
    isChannelEnabledForEvent(tenantId, 'sales_receipt', 'whatsapp'),
  ]);
  const smsConfig = smsAllowed ? await smsService.getResolvedConfig(tenantId) : null;
  const whatsappConfig = whatsappAllowed ? await whatsappService.getConfig(tenantId) : null;
  const emailConfig = emailAllowed ? await emailService.getConfig(tenantId) : null;

  const receiptMessage = buildReceiptMessage(sale, tenantId);
  const receiptSmsMessage = await buildReceiptSmsMessage(sale, tenantId);
  const phone = sale.customer.phone?.trim();
  const email = sale.customer.email?.trim();
  const hasPhone = !!smsService.validatePhoneNumber(phone);

  // Only record channels that actually succeeded — a hardcoded "all channels sent" log
  // would falsely dedupe a later manual send (e.g. "Send SMS") for a channel that was
  // never configured or failed silently here.
  const sentChannels = [];

  if (emailConfig && email && !automationHandledChannels.has('email')) {
    if (!(await hasRecentReceiptForSale(tenantId, saleId, 'email'))) {
      const emailResult = await sendEmailReceipt(tenantId, email, sale, receiptMessage).catch((e) => {
        console.error('[AutoSendReceipt] Email failed:', e?.message);
        return { success: false };
      });
      if (emailResult?.success) sentChannels.push('email');
    }
  }
  if (smsConfig && hasPhone && !automationHandledChannels.has('sms')) {
    if (!(await hasRecentReceiptForSale(tenantId, saleId, 'sms'))) {
      const smsResult = await sendSMSReceipt(
        tenantId,
        smsService.validatePhoneNumber(phone),
        receiptSmsMessage || receiptMessage
      ).catch((e) => {
        console.error('[AutoSendReceipt] SMS failed:', e?.message);
        return { success: false };
      });
      if (smsResult?.success) sentChannels.push('sms');
    }
  }
  if (whatsappConfig?.phoneNumberId && hasPhone && !automationHandledChannels.has('whatsapp')) {
    if (!(await hasRecentReceiptForSale(tenantId, saleId, 'whatsapp'))) {
      const whatsappResult = await sendWhatsAppReceipt(tenantId, whatsappService.validatePhoneNumber(phone), sale, receiptMessage).catch((e) => {
        console.error('[AutoSendReceipt] WhatsApp failed:', e?.message);
        return { success: false };
      });
      if (whatsappResult?.success) sentChannels.push('whatsapp');
    }
  }

  if (sentChannels.length === 0) return;

  await recordReceiptSentActivity(tenantId, saleId, {
    source: 'auto_send_receipt',
    channels: sentChannels,
  }).catch((e) => console.error('[AutoSendReceipt] Failed to record receipt activity:', e?.message));
}

/**
 * Build short SMS receipt message from tenant template.
 * @param {Object} sale
 * @param {string} tenantId
 * @returns {Promise<string|null>}
 */
async function buildReceiptSmsMessage(sale, tenantId) {
  const smsTemplateService = require('../services/smsTemplateService');
  const { formatCedi } = require('../utils/formatNumber');
  const business = sale.shop?.name || sale.studioLocation?.name || sale.tenant?.name || '';
  const branchName = sale.shop?.name || sale.studioLocation?.name || '';
  const variables = {
    customerName: sale.customer?.name?.trim() || 'Customer',
    businessName: business,
    branchName,
    orderNumber: sale.saleNumber || String(sale.id),
    amount: formatCedi(sale.total),
  };
  return smsTemplateService.renderForTenant(tenantId, 'sales_receipt', variables);
}

/**
 * Build receipt message for SMS/WhatsApp
 * @param {Object} sale - Sale object
 * @param {string} tenantId - Tenant ID
 * @returns {string} - Formatted receipt message
 */
function buildReceiptMessage(sale, tenantId) {
  const message = [];
  const receipt = [];
  const width = 38;
  const { formatCedi } = require('../utils/formatNumber');
  const money = (value) => formatCedi(value);
  const divider = (char = '-') => char.repeat(width);
  const row = (label, value) => {
    const left = String(label || '').trim();
    const right = String(value || '').trim();
    const spaces = Math.max(1, width - left.length - right.length);
    return `${left}${' '.repeat(spaces)}${right}`;
  };
  const center = (value) => {
    const text = String(value || '').trim();
    if (text.length >= width) return text;
    return `${' '.repeat(Math.floor((width - text.length) / 2))}${text}`;
  };
  const formatPayment = (value) => String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  const customerName = sale.customer?.name?.trim() || 'Customer';
  const business = sale.shop?.name || sale.studioLocation?.name || sale.tenant?.name || null;
  const location = sale.shop || sale.studioLocation || {};
  const total = typeof sale.total === 'number' ? sale.total : parseFloat(String(sale.total || 0)) || 0;
  const paid = typeof sale.amountPaid === 'number' ? sale.amountPaid : parseFloat(String(sale.amountPaid || 0)) || 0;
  const balance = Math.max(0, total - paid);

  message.push(`Hello ${customerName}, here is your receipt${business ? ` from ${business}` : ''}.`);
  message.push('');

  if (business) receipt.push(center(business.toUpperCase()));
  if (location.address) receipt.push(center(location.address));
  if (location.phone) receipt.push(center(`Tel: ${location.phone}`));
  receipt.push(divider('='));
  receipt.push(center('SALES RECEIPT'));
  receipt.push(divider('='));
  if (sale.saleNumber) receipt.push(row('Receipt No.', sale.saleNumber));
  if (sale.createdAt) receipt.push(row('Date', new Date(sale.createdAt).toLocaleString()));
  receipt.push(row('Customer', customerName));
  receipt.push('');

  receipt.push('ITEMS');
  receipt.push(divider());
  sale.items?.forEach(item => {
    const quantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity || 1)) || 1;
    const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(String(item.unitPrice || 0)) || 0;
    const lineTotal = item.total != null
      ? (typeof item.total === 'number' ? item.total : parseFloat(String(item.total || 0)) || 0)
      : quantity * unitPrice;
    const qty = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '');
    const name = String(item.name || item.product?.name || 'Item').trim();
    const productCode = getSaleItemProductCode(item);
    receipt.push(name);
    if (productCode) receipt.push(`   Product Code: ${productCode}`);
    receipt.push(row(`   ${qty} x ${money(unitPrice)}`, money(lineTotal)));
  });

  receipt.push(divider());
  receipt.push(row('TOTAL', money(total)));
  receipt.push(divider('='));
  if (sale.amountPaid) {
    receipt.push(row('Paid', money(sale.amountPaid)));
  }
  if (balance > 0.009) {
    receipt.push(row('Balance', money(balance)));
  }
  if (sale.change > 0) {
    receipt.push(row('Change', money(sale.change)));
  }
  if (sale.paymentMethod) {
    receipt.push(row('Payment', formatPayment(sale.paymentMethod)));
  }
  receipt.push(divider('='));
  receipt.push(center('Thank you for your purchase!'));

  message.push('```');
  message.push(...receipt);
  message.push('```');

  return message.join('\n');
}

/**
 * Send SMS receipt using tenant or platform SMS config (resolved inside smsService)
 */
async function sendSMSReceipt(tenantId, phone, message) {
  const smsService = require('../services/smsService');
  try {
    const result = await smsService.sendMessage(tenantId, phone, message);
    if (result.success) return { success: true };
    return { success: false, error: result.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send WhatsApp receipt using configured WhatsApp service
 */
async function sendWhatsAppReceipt(tenantId, phone, sale, fallbackMessage = '') {
  const whatsappService = require('../services/whatsappService');
  const whatsappTemplates = require('../services/whatsappTemplates');

  const whatsappConfig = await whatsappService.getConfig(tenantId);
  if (!whatsappConfig?.enabled) {
    return { success: false, error: 'WhatsApp service not configured' };
  }

  const templateName = whatsappConfig.receiptTemplateName || 'sale_receipt';
  const parameters = templateName === 'sale_receipt'
    ? whatsappTemplates.prepareSaleReceipt(sale)
    : [String(fallbackMessage || '').slice(0, 900)];
  const result = await whatsappService.sendMessage(
    tenantId,
    phone,
    templateName,
    parameters.length ? parameters : [String(fallbackMessage || '').slice(0, 900)],
    whatsappConfig.receiptTemplateLanguage || 'en',
    { category: 'transactional', metadata: { source: 'sale_receipt' } }
  );

  return result.success
    ? { success: true, messageId: result.messageId || null }
    : { success: false, error: result.error || 'WhatsApp receipt failed' };
}

/**
 * Send Email receipt using configured email service
 */
async function sendEmailReceipt(tenantId, email, sale, textMessage) {
  const { Setting, Tenant } = require('../models');
  const emailService = require('../services/emailService');
  const emailTemplates = require('../services/emailTemplates');

  // Get email settings
  const emailSettings = await Setting.findOne({
    where: { tenantId, key: 'email' }
  });

  if (!emailSettings?.value?.enabled) {
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const { resolveDocumentOrganization, organizationToEmailCompany } = require('../utils/documentOrganizationUtils');
    let shop = sale.shop;
    if (!shop && sale.shopId) {
      shop = await Shop.findByPk(sale.shopId);
    }
    const organization = await resolveDocumentOrganization({
      tenantId,
      shop,
      studioLocation: sale.studioLocation || null,
    });
    const company = organizationToEmailCompany(organization);
    const logoHost = (() => {
      const logoUrl = company.logoUrl || company.logo || '';
      if (!logoUrl) return 'none';
      if (/^data:image\//i.test(logoUrl)) return 'data-url';
      try {
        return new URL(logoUrl).host || 'invalid';
      } catch (_err) {
        return 'invalid';
      }
    })();
    console.log(`[Receipt Email] hasLogo=${Boolean(company.logoUrl || company.logo)} logoHost=${logoHost}`);
    const closing = textMessage && String(textMessage).trim() ? String(textMessage).trim() : '';
    const { subject, html, text } = emailTemplates.saleReceiptEmail(sale, company, closing);

    const result = await emailService.sendMessage(tenantId, email, subject, html, text);

    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// @desc    Delete sale (admin only)
// @route   DELETE /api/sales/:id
// @access  Private (admin only)
exports.deleteSale = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        { model: SaleItem, as: 'items' },
        { model: Invoice, as: 'invoice' }
      ],
      transaction
    });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    if (sale.deletedAt) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Sale has already been deleted'
      });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      await transaction.rollback();
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    // Managers and staff soft-delete paid sales instead of destroying the row: the sale stays
    // in the database (accounting/stock untouched) but is hidden from everyday views, and the
    // reason is kept for audit. Only admins can permanently (hard) delete a sale.
    if (getEffectiveRole(req) !== 'admin') {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'A reason is required to delete this sale'
        });
      }

      const isPaidSale = parseFloat(sale.amountPaid || 0) > 0;
      if (!isPaidSale) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Only paid sales can be deleted this way. Cancel unpaid sales instead, or ask an admin to delete it.'
        });
      }

      await sale.update({
        deletedAt: new Date(),
        deletedBy: req.user.id,
        deletionReason: reason
      }, { transaction });

      await SaleActivity.create({
        tenantId: req.tenantId,
        saleId: sale.id,
        type: 'status_change',
        subject: 'Sale deleted',
        notes: reason,
        createdBy: req.user.id
      }, { transaction });

      await transaction.commit();
      invalidateSaleMutationCaches(req.tenantId);

      return res.status(200).json({
        success: true,
        message: 'Sale deleted successfully'
      });
    }

    // Admin hard-delete: restore stock and cascade-remove payments, invoices, journals,
    // and dealer ledger rows so accounting stays consistent for paid/dealer/credit sales.
    let invoiceIds = [];
    try {
      ({ invoiceIds } = await hardDeleteSaleInTransaction({
        sale,
        tenantId: req.tenantId,
        transaction,
      }));
    } catch (hardDeleteErr) {
      if (hardDeleteErr.statusCode === 400) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: hardDeleteErr.message,
          errorCode: hardDeleteErr.errorCode || undefined,
        });
      }
      throw hardDeleteErr;
    }

    await transaction.commit();
    invalidateSaleMutationCaches(req.tenantId);
    if (invoiceIds.length) {
      invalidateInvoiceListCache(req.tenantId);
    }

    res.status(200).json({
      success: true,
      message: 'Sale deleted successfully. Related payments, invoices, and accounting entries were removed.'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.hardDeleteSaleInTransaction = hardDeleteSaleInTransaction;

// Export post-sale helpers for use in other controllers
exports.autoCreateInvoiceFromSale = autoCreateInvoiceFromSale;
exports.autoSendReceiptIfEnabled = autoSendReceiptIfEnabled;
exports.createSaleCore = createSaleCore;

// @desc    Initialize Paystack payment for a pending sale (POS card/MoMo)
// @route   POST /api/sales/:id/initialize-paystack
// @access  Private
exports.initializePaystackForSale = async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const { email, callbackUrl } = sanitizePayload(req.body || {});

    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: saleId }),
      include: [{ model: Customer, as: 'customer' }]
    });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }
    if (sale.status === 'cancelled' || sale.status === 'refunded') {
      return res.status(400).json({ success: false, message: 'Cannot collect payment on a cancelled or refunded sale' });
    }

    const totalAmount = parseFloat(sale.total || 0);
    const currentPaid = parseFloat(sale.amountPaid || 0);
    const balanceDue = Math.max(totalAmount - currentPaid, 0);
    if (balanceDue <= 0) {
      return res.status(400).json({ success: false, message: 'Sale is already fully paid' });
    }

    const tenant = await findTenantWithOptionalColumns(sale.tenantId);
    const customerEmail =
      (email && String(email).trim() ? String(email).trim() : null) ||
      sale.customer?.email ||
      req.user?.email ||
      tenant?.metadata?.companyEmail ||
      tenant?.email ||
      null;
    if (!customerEmail) {
      return res.status(400).json({ success: false, message: 'Email is required for card/MoMo payment' });
    }

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(503).json({ success: false, message: 'Paystack is not configured' });
    }

    const reference = `SALE-${sale.id}-${Date.now()}`.slice(0, 50);
    const orgRow = await Setting.findOne({ where: { tenantId: sale.tenantId, key: 'organization' } });
    const orgTax = orgRow?.value?.tax || {};
    const oc = orgTax?.otherCharges || {};
    const shouldApplyCustomerCharge =
      oc?.enabled === true &&
      oc?.customerBears === true &&
      ['online_payments', 'all_payments'].includes(String(oc?.appliesTo || ''));
    const chargeRate = shouldApplyCustomerCharge ? Math.max(0, Math.min(100, parseFloat(oc?.ratePercent) || 0)) : 0;
    const chargeAmount = Math.round((balanceDue * chargeRate / 100) * 100) / 100;
    const payableAmount = shouldApplyCustomerCharge ? balanceDue + chargeAmount : balanceDue;
    const amountPesewas = Math.round(payableAmount * 100);
    const callback = callbackUrl && String(callbackUrl).trim() ? String(callbackUrl).trim() : null;

    const subaccount = tenant?.paystackSubaccountCode || null;

    const metadata = {
      sale_id: sale.id,
      tenant_id: sale.tenantId,
      payment_source: 'sale_direct_checkout',
      paymentSurcharge: shouldApplyCustomerCharge
        ? {
            label: typeof oc?.label === 'string' && oc.label.trim() ? oc.label.trim() : 'Transaction charge',
            ratePercent: chargeRate,
            amount: chargeAmount,
            customerBears: true
          }
        : undefined
    };
    const buildInit = (channels) => paystackService.initializeTransaction({
      email: customerEmail,
      amount: amountPesewas,
      currency: 'GHS',
      callback_url: callback || undefined,
      reference,
      metadata,
      channels,
      ...(subaccount ? { subaccount } : {})
    });

    let result;
    try {
      result = await buildInit(['card', 'mobile_money']);
    } catch (paystackErr) {
      if (paystackErr?.response?.status === 403) {
        console.warn('[Sale] initialize-paystack: Paystack 403 — retrying with card-only channels', { saleId: sale.id });
        result = await buildInit(['card']);
      } else {
        throw paystackErr;
      }
    }

    if (!result.status || !result.data?.authorization_url) {
      return res.status(502).json({
        success: false,
        message: result.message || 'Failed to initialize payment'
      });
    }

    await sale.update({
      metadata: {
        ...(sale.metadata || {}),
        paystackCheckout: {
          reference: result.data.reference || reference,
          initiatedAt: new Date().toISOString(),
          amount: balanceDue,
          channels: ['card', 'mobile_money']
        }
      }
    });

    res.status(200).json({
      success: true,
      data: {
        authorization_url: result.data.authorization_url,
        authorizationUrl: result.data.authorization_url,
        reference: result.data.reference,
        access_code: result.data.access_code,
        accessCode: result.data.access_code
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Initiate Paystack Mobile Money payment for a pending POS sale
// @route   POST /api/sales/:id/paystack-mobile-money
// @access  Private
exports.paystackMobileMoneyForSale = async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const { phoneNumber, provider } = sanitizePayload(req.body || {});

    if (!phoneNumber || !provider) {
      return res.status(400).json({
        success: false,
        message: 'phoneNumber and provider are required'
      });
    }

    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: saleId }),
      include: [{ model: Customer, as: 'customer' }]
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    if (sale.status === 'cancelled' || sale.status === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'Cannot collect payment on a cancelled or refunded sale'
      });
    }

    const totalAmount = parseFloat(sale.total || 0);
    const currentPaid = parseFloat(sale.amountPaid || 0);
    const balanceDue = Math.max(totalAmount - currentPaid, 0);
    if (!Number.isFinite(balanceDue) || balanceDue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale is already fully paid'
      });
    }

    const tenant = await findTenantWithOptionalColumns(sale.tenantId);
    const logicalProvider = String(provider || '').toUpperCase();

    // Prefer Hubtel / tenant MTN when available; leave Paystack charge path below unchanged.
    try {
      const { resolveMoMoCollector } = require('../services/paymentCollectionRouter');
      const {
        initiateDirectMoMoCharge,
        buildMobileMoneyRefMeta
      } = require('../services/directMoMoChargeService');
      const directRail = resolveMoMoCollector(tenant, { allowPaystack: false });
      if (directRail.rail === 'hubtel' || directRail.rail === 'mtn') {
        const externalId = `SALE-MM-${sale.id}-${Date.now()}`.slice(0, 64);
        const direct = await initiateDirectMoMoCharge({
          tenant,
          phoneNumber,
          amount: balanceDue,
          currency: 'GHS',
          provider: logicalProvider,
          externalId,
          payerMessage: `Sale ${sale.saleNumber || sale.id}`,
          customerName: sale.customer?.name || 'Customer',
          customerEmail: sale.customer?.email || req.user?.email || undefined
        });
        if (direct.success) {
          const existingMetadata = sale.metadata || {};
          await sale.update({
            metadata: {
              ...existingMetadata,
              mobileMoneyRef: buildMobileMoneyRefMeta(direct, {
                saleId: sale.id,
                tenantId: sale.tenantId
              })
            }
          });
          return res.status(200).json({
            success: true,
            data: {
              reference: direct.referenceId,
              referenceId: direct.referenceId,
              provider: direct.provider,
              status: direct.status || 'PENDING',
              rail: direct.rail,
              message: direct.message
            }
          });
        }
        // If direct charge failed, fall through to Paystack when allowed.
      }
    } catch (directErr) {
      console.warn('[MoMo] Direct collector attempt failed; using Paystack:', directErr?.message);
    }

    const customerEmail =
      (sale.customer && sale.customer.email) ||
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

    const reference = `SALE-MM-${sale.id}-${Date.now()}`.slice(0, 50);

    const orgRow = await Setting.findOne({ where: { tenantId: sale.tenantId, key: 'organization' } });
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
        sale_id: sale.id,
        tenant_id: sale.tenantId,
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

    console.log('[MoMo] Paystack chargeMobileMoney result:', {
      saleId: sale.id,
      hasResult: !!result,
      resultStatus: result?.status,
      resultMessage: result?.message,
      resultKeys: result ? Object.keys(result) : null
    });

    if (!result || result.status === false) {
      console.warn('[MoMo] Returning 502 – result missing or result.status === false:', { result });
      return res.status(502).json({
        success: false,
        message: result?.message || 'Failed to initiate mobile money payment'
      });
    }

    // Persist basic Paystack MoMo info in sale metadata
    const existingMetadata = sale.metadata || {};
    const updatedMetadata = {
      ...existingMetadata,
      paystackMobileMoney: {
        ...(existingMetadata.paystackMobileMoney || {}),
        reference,
        provider: logicalProvider,
        phoneNumber,
        amount: balanceDue,
        initiatedAt: new Date().toISOString()
      }
    };

    await sale.update({ metadata: updatedMetadata });

    const next = paystackService.normalizeChargeNextAction(result);
    const payload = {
      success: true,
      data: {
        reference,
        provider: logicalProvider,
        status: next.status || 'PENDING',
        message: next.message,
        displayText: next.displayText,
        requiresOtp: next.requiresOtp,
      }
    };
    console.log('[MoMo] Returning 200 success:', { saleId: sale.id, payload });
    res.status(200).json(payload);
  } catch (error) {
    console.error('[MoMo] paystackMobileMoneyForSale error:', { saleId: req.params?.id, error: error.message, stack: error.stack });
    next(error);
  }
};

/**
 * Submit Paystack charge OTP for a pending POS MoMo sale.
 * @route POST /api/sales/:id/paystack-submit-otp
 */
exports.submitPaystackOtpForSale = async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const { otp, reference: bodyReference } = sanitizePayload(req.body || {});
    const cleanedOtp = String(otp || '').trim();
    if (!cleanedOtp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: saleId }),
      include: [{ model: Customer, as: 'customer' }]
    });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const reference = String(
      bodyReference
      || sale.metadata?.paystackMobileMoney?.reference
      || ''
    ).trim();
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'No Paystack mobile money reference found for this sale. Start the payment again.'
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

    const existingMetadata = sale.metadata || {};
    await sale.update({
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

    const next = paystackService.normalizeChargeNextAction(result);
    return res.status(200).json({
      success: true,
      data: {
        reference,
        status: next.status || 'PENDING',
        message: next.message,
        displayText: next.displayText,
        requiresOtp: next.requiresOtp,
      }
    });
  } catch (error) {
    console.error('[MoMo] submitPaystackOtpForSale error:', {
      saleId: req.params?.id,
      error: error.message
    });
    next(error);
  }
};

/**
 * Check Paystack charge status for a pending POS MoMo sale and update sale when charge succeeds.
 * Used when webhook cannot reach the server (e.g. local dev) so the frontend can poll and still see completion.
 * GET /api/sales/:id/check-paystack-charge
 */
exports.checkPaystackChargeForSale = async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: saleId }),
      include: [{ model: Customer, as: 'customer' }]
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const saleTotal = parseFloat(sale.total || 0);
    const currentPaid = parseFloat(sale.amountPaid || 0);
    const balanceDue = Math.max(saleTotal - currentPaid, 0);

    // Fully settled sales do not need another Paystack check.
    if (balanceDue <= 0 && sale.status === 'completed') {
      return res.status(200).json({ success: true, data: sale, applied: false, alreadyRecorded: true });
    }

    // Direct Hubtel/MTN refs (thin route above Paystack) — poll without touching Paystack verify.
    const mobileMoneyRef = sale.metadata?.mobileMoneyRef;
    const paystackRef =
      sale.metadata?.paystackMobileMoney?.reference || sale.metadata?.paystackCheckout?.reference;
    if (
      mobileMoneyRef?.referenceId &&
      mobileMoneyRef?.provider &&
      ['HUBTEL', 'MTN', 'AIRTEL'].includes(String(mobileMoneyRef.provider).toUpperCase()) &&
      !paystackRef
    ) {
      const tenant = await findTenantWithOptionalColumns(sale.tenantId);
      const { checkDirectMoMoStatus } = require('../services/directMoMoChargeService');
      const statusResult = await checkDirectMoMoStatus({
        tenant,
        referenceId: mobileMoneyRef.referenceId,
        provider: mobileMoneyRef.provider
      });
      const updatedMetadata = {
        ...sale.metadata,
        mobileMoneyRef: {
          ...mobileMoneyRef,
          status: statusResult.status,
          lastChecked: new Date().toISOString(),
          financialTransactionId: statusResult.financialTransactionId
        }
      };
      if (statusResult.status === 'SUCCESSFUL') {
        await sale.update({
          status: 'completed',
          paymentMethod: 'mobile_money',
          amountPaid: sale.total,
          metadata: updatedMetadata
        });
        const refreshed = await Sale.findOne({
          where: applyTenantFilter(req.tenantId, { id: saleId }),
          include: [{ model: Customer, as: 'customer' }]
        });
        return res.status(200).json({
          success: true,
          data: refreshed || sale,
          applied: true,
          rail: mobileMoneyRef.rail || mobileMoneyRef.provider
        });
      }
      await sale.update({ metadata: updatedMetadata });
      return res.status(200).json({
        success: true,
        data: sale,
        applied: false,
        paymentStatus: statusResult.status
      });
    }

    const ref = paystackRef;
    if (!ref) {
      return res.status(200).json({ success: true, data: sale, applied: false });
    }

    const now = Date.now();
    const last = paystackCheckLastBySaleId.get(saleId) || 0;
    if (now - last < PAYSTACK_CHECK_THROTTLE_MS) {
      return res.status(200).json({ success: true, data: sale, applied: false, throttled: true });
    }
    paystackCheckLastBySaleId.set(saleId, now);

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(200).json({ success: true, data: sale, applied: false });
    }

    let result;
    try {
      result = await paystackService.verifyTransaction(ref);
    } catch (verifyErr) {
      console.error('[Sale] check-paystack verify error:', verifyErr?.message);
      return res.status(200).json({ success: true, data: sale, applied: false });
    }

    if (!result.status || !result.data) {
      return res.status(200).json({ success: true, data: sale, applied: false });
    }

    const { applyPaystackChargeToSaleFromTx } = require('../services/paystackSalePayment');
    const outcome = await applyPaystackChargeToSaleFromTx(sale, ref, result.data);

    if (!outcome.applied) {
      return res.status(200).json({
        success: true,
        data: sale,
        applied: false,
        alreadyRecorded: Boolean(outcome.duplicate),
        reason: outcome.reason || null,
        paystackStatus: outcome.paystackStatus || null
      });
    }

    const nextStatus = outcome.nextStatus;
    if (nextStatus === 'completed' && !isDealerSale(sale)) {
      try {
        await autoCreateInvoiceFromSale(sale.id, sale.tenantId);
      } catch (invErr) {
        console.error('[Sale] Auto-invoice failed (check-paystack):', invErr.message);
      }
      await autoSendReceiptIfEnabled(sale.tenantId, sale.id).catch((receiptErr) =>
        console.error('[Sale] Auto-send receipt failed (check-paystack):', receiptErr?.message || receiptErr)
      );
    }

    try {
      invalidateSaleMutationCaches(sale.tenantId);
      emitNewSale(sale.tenantId, sale);
    } catch (e) {
      console.error('[Sale] WebSocket/cache error (check-paystack):', e.message);
    }
    console.log('[Sale] Payment applied via check-paystack-charge:', sale.id);

    const freshSale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: saleId }),
      include: [
        { model: Shop, as: 'shop' },
        { model: Customer, as: 'customer' },
        { model: User, as: 'seller' },
        {
          model: Invoice,
          as: 'invoice',
          include: [{ model: Customer, as: 'customer' }]
        },
        saleItemDetailInclude
      ]
    });

    return res.status(200).json({
      success: true,
      data: freshSale || sale,
      applied: true,
      reference: ref
    });
  } catch (error) {
    console.error('[MoMo] checkPaystackChargeForSale error:', { saleId: req.params?.id, error: error.message });
    next(error);
  }
};
