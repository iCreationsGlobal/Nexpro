const { Op } = require('sequelize');
const { Invoice, Payment, Sale, SaleItem, SaleActivity } = require('../models');
const { updateCustomerBalance } = require('./customerBalanceService');

const PAID_TOLERANCE = 0.01;

const normalizeSalePaymentMethod = (method) => {
  const normalized = String(method || '').toLowerCase();
  if (normalized === 'credit_card') return 'card';
  if (normalized === 'mobile_money') return 'mobile_money';
  if (['cash', 'card', 'bank_transfer', 'credit', 'other'].includes(normalized)) return normalized;
  return 'other';
};

const toNumber = (value) => {
  const n = parseFloat(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const getInvoicePaymentState = (invoice) => {
  const totalAmount = toNumber(invoice?.totalAmount);
  const amountPaid = toNumber(invoice?.amountPaid);
  const balance = Math.max(totalAmount - amountPaid, 0);
  const isPaid = totalAmount > 0 && (balance <= PAID_TOLERANCE || amountPaid >= totalAmount - PAID_TOLERANCE);

  return {
    totalAmount,
    amountPaid: isPaid ? totalAmount : amountPaid,
    balance: isPaid ? 0 : balance,
    status: isPaid ? 'completed' : 'partially_paid',
  };
};

const generateSaleNumber = async (tenantId, transaction) => {
  const prefix = 'SALE';
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const count = await Sale.count({
    where: {
      tenantId,
      createdAt: { [Op.between]: [startOfDay, endOfDay] },
    },
    transaction,
  });

  return `${prefix}-${dateStr}-${String(count + 1).padStart(4, '0')}`;
};

const getInvoiceItems = (invoice) => {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  if (items.length > 0) return items;

  const totalAmount = toNumber(invoice?.totalAmount);
  return [{
    description: `Invoice ${invoice?.invoiceNumber || invoice?.id || ''}`.trim(),
    quantity: 1,
    unitPrice: totalAmount,
    total: totalAmount,
  }];
};

const buildSaleItemPayload = (saleId, item) => {
  const quantity = toNumber(item.quantity) || 1;
  const unitPrice = toNumber(item.unitPrice);
  const discount = toNumber(item.discountAmount ?? item.discount);
  const tax = toNumber(item.taxAmount ?? item.tax);
  const lineTotal = toNumber(item.total) || Math.max(0, (quantity * unitPrice) - discount + tax);
  const subtotal = Math.max(0, (quantity * unitPrice) - discount);

  return {
    saleId,
    productId: item.productId || item.metadata?.productId || null,
    productVariantId: item.productVariantId || item.metadata?.productVariantId || null,
    name: item.description || item.name || 'Invoice item',
    sku: item.sku || item.metadata?.sku || null,
    quantity,
    unitPrice,
    discount,
    tax,
    subtotal,
    total: lineTotal,
    metadata: {
      ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
      invoiceItem: true,
    },
  };
};

const findExistingInvoiceSale = async (invoice, transaction) => {
  if (invoice.saleId) {
    const sale = await Sale.findOne({
      where: { tenantId: invoice.tenantId, id: invoice.saleId },
      transaction,
    });
    if (sale) return sale;
  }

  return Sale.findOne({
    where: {
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
    },
    transaction,
  });
};

/**
 * Create or update the sales order that represents an invoice once money is recorded.
 * This intentionally does not call POS sale creation, because invoice revenue is already
 * accounted for and existing quote invoice flows do not adjust inventory here.
 *
 * @param {string} invoiceId
 * @param {string|null} paymentId
 * @param {{ tenantId?: string, userId?: string|null, transaction?: object, paymentMethod?: string }} [options]
 * @returns {Promise<{ sale: object|null, created: boolean, updated: boolean, reason?: string }>}
 */
async function ensureSaleFromPaidInvoice(invoiceId, paymentId = null, options = {}) {
  if (!invoiceId) return { sale: null, created: false, updated: false, reason: 'missing_invoice_id' };

  const transaction = options.transaction || null;
  const invoice = await Invoice.findOne({
    where: {
      id: invoiceId,
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    },
    transaction,
  });

  if (!invoice) return { sale: null, created: false, updated: false, reason: 'invoice_not_found' };

  const { isRentalSourcedInvoice, syncRentalFromPaidInvoice } = require('./rentalInvoicePaymentService');
  if (isRentalSourcedInvoice(invoice)) {
    await syncRentalFromPaidInvoice(invoice.id, { tenantId: invoice.tenantId, invoice });
    return { sale: null, created: false, updated: false, reason: 'rental_invoice' };
  }

  const paymentState = getInvoicePaymentState(invoice);
  if (paymentState.amountPaid <= 0) {
    return { sale: null, created: false, updated: false, reason: 'invoice_not_paid' };
  }

  const payment = paymentId
    ? await Payment.findOne({ where: { id: paymentId, tenantId: invoice.tenantId }, transaction })
    : null;
  const paymentMethod = normalizeSalePaymentMethod(options.paymentMethod || payment?.paymentMethod);
  const existingSale = await findExistingInvoiceSale(invoice, transaction);
  const metadataPatch = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    quoteId: invoice.quoteId || null,
    sourceType: 'invoice_payment',
    lastPaymentId: paymentId || null,
    invoicePaymentState: {
      amountPaid: paymentState.amountPaid,
      balance: paymentState.balance,
      status: invoice.status,
    },
    inventoryStockAdjusted: false,
  };

  if (existingSale) {
    await existingSale.update({
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      paymentMethod,
      amountPaid: paymentState.amountPaid,
      status: paymentState.status,
      total: paymentState.totalAmount,
      metadata: {
        ...(existingSale.metadata && typeof existingSale.metadata === 'object' ? existingSale.metadata : {}),
        ...metadataPatch,
      },
    }, { transaction });

    if (!invoice.saleId || String(invoice.saleId) !== String(existingSale.id)) {
      await invoice.update({ saleId: existingSale.id }, { transaction });
    }

    return { sale: existingSale, created: false, updated: true };
  }

  const saleNumber = await generateSaleNumber(invoice.tenantId, transaction);
  const sale = await Sale.create({
    tenantId: invoice.tenantId,
    shopId: invoice.shopId || null,
    saleNumber,
    customerId: invoice.customerId,
    subtotal: toNumber(invoice.subtotal),
    discount: toNumber(invoice.discountAmount ?? invoice.discountValue),
    tax: toNumber(invoice.taxAmount),
    total: paymentState.totalAmount,
    paymentMethod,
    amountPaid: paymentState.amountPaid,
    change: 0,
    status: paymentState.status,
    invoiceId: invoice.id,
    soldBy: options.userId || null,
    notes: `Sale created from paid invoice ${invoice.invoiceNumber}`,
    metadata: metadataPatch,
  }, { transaction });

  const saleItems = getInvoiceItems(invoice).map((item) => buildSaleItemPayload(sale.id, item));
  if (saleItems.length > 0) {
    await SaleItem.bulkCreate(saleItems, { transaction });
  }

  await invoice.update({ saleId: sale.id }, { transaction });
  await SaleActivity.create({
    saleId: sale.id,
    tenantId: invoice.tenantId,
    type: 'payment',
    subject: 'Sale Created from Invoice Payment',
    notes: `Payment recorded for invoice ${invoice.invoiceNumber}`,
    createdBy: options.userId || null,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentId: paymentId || null,
      amountPaid: paymentState.amountPaid,
      status: paymentState.status,
    },
  }, { transaction });

  return { sale, created: true, updated: false };
}

/**
 * Sync linked invoice payment state from a POS sale (shop credit/partial payments).
 * Invoice balance hooks derive status from amountPaid.
 *
 * @param {object} sale - Sale instance or plain object with id, invoiceId, customerId, amountPaid
 * @param {{ tenantId?: string, transaction?: object }} [options]
 * @returns {Promise<object|null>}
 */
async function syncLinkedInvoiceFromSale(sale, options = {}) {
  if (!sale?.id) return null;

  const tenantId = options.tenantId || sale.tenantId;
  if (!tenantId) return null;

  const transaction = options.transaction || null;
  let invoice = null;

  if (sale.invoiceId) {
    invoice = await Invoice.findOne({
      where: { id: sale.invoiceId, tenantId },
      transaction,
    });
  }
  if (!invoice) {
    invoice = await Invoice.findOne({
      where: { saleId: sale.id, tenantId },
      transaction,
    });
  }
  if (!invoice || invoice.status === 'cancelled') return null;

  const amountPaid = toNumber(sale.amountPaid);
  const totalAmount = toNumber(invoice.totalAmount);
  const updatePayload = { amountPaid };

  if (sale.shopId && !invoice.shopId) {
    updatePayload.shopId = sale.shopId;
  }

  if (totalAmount > 0 && amountPaid >= totalAmount - PAID_TOLERANCE) {
    updatePayload.paidDate = invoice.paidDate || new Date();
  }

  await invoice.update(updatePayload, { transaction });
  return invoice;
}

/**
 * Sync sale-linked invoice payment state and refresh customer balance from invoices.
 *
 * @param {object} sale
 * @param {{ tenantId?: string, transaction?: object }} [options]
 * @returns {Promise<object|null>}
 */
async function syncSaleInvoiceAndRefreshCustomerBalance(sale, options = {}) {
  const invoice = await syncLinkedInvoiceFromSale(sale, options);
  const customerId = sale?.customerId || invoice?.customerId;
  if (customerId) {
    await updateCustomerBalance(customerId, options.transaction || null);
  }
  return invoice;
}

module.exports = {
  ensureSaleFromPaidInvoice,
  normalizeSalePaymentMethod,
  syncLinkedInvoiceFromSale,
  syncSaleInvoiceAndRefreshCustomerBalance,
};
