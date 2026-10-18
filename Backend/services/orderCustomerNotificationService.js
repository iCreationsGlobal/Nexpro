const { Tenant, Customer } = require('../models');
const emailService = require('./emailService');
const emailTemplates = require('./emailTemplates');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const whatsappTemplates = require('./whatsappTemplates');
const { isChannelEnabledForEvent } = require('./messageDeliveryRulesService');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { formatCedi } = require('../utils/formatNumber');
const smsTemplateService = require('./smsTemplateService');
const { resolveBusinessNameForContext } = require('../utils/resolveBusinessNameForContext');
const { resolveOrderTrackingLink } = require('../utils/orderTrackingLink');

const EVENT_KEY = 'order_created';
const STATUS_EVENT_KEY = 'order_status';

const ORDER_STATUS_LABELS = {
  received: 'received',
  preparing: 'being prepared',
  processing: 'being prepared',
  ready: 'ready',
  packed: 'packed',
  shipped: 'shipped',
  out_for_delivery: 'out for delivery',
  delivered: 'delivered',
  completed: 'completed',
  cancelled: 'cancelled',
};

const customerDisplayName = (customer = {}) => customer.name || customer.company || 'Customer';

/**
 * Human-readable label for an order / fulfillment status key.
 * @param {string|null|undefined} status
 * @returns {string}
 */
const formatOrderStatusLabel = (status) => {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'updated';
  if (ORDER_STATUS_LABELS[key]) return ORDER_STATUS_LABELS[key];
  return key.replace(/_/g, ' ');
};

/**
 * Resolve customer phone from sale association, delivery address, or DB lookup.
 * @param {object} sale
 * @returns {Promise<{ customer: object|null, phone: string }>}
 */
const resolveSaleCustomerContact = async (sale) => {
  let customer = sale?.customer || null;
  if (!customer && sale?.customerId) {
    customer = await Customer.findByPk(sale.customerId, {
      attributes: ['id', 'name', 'company', 'phone', 'email', 'shopId', 'studioLocationId'],
    });
  }
  const metadata = sale?.metadata && typeof sale.metadata === 'object' ? sale.metadata : {};
  const phone = String(
    customer?.phone
    || metadata.deliveryAddress?.phone
    || metadata.storefrontCustomerPhone
    || ''
  ).trim();
  return { customer, phone };
};

/**
 * @param {object} sale
 * @param {string} companyName
 * @param {string|null} [trackingLink]
 * @returns {string}
 */
const buildSmsMessageFallback = (sale, companyName, trackingLink = null) => {
  const orderNumber = sale?.saleNumber || 'your order';
  const total = formatCedi(sale?.total || 0);
  const delivery = sale?.metadata?.delivery;
  const deliveryText = delivery?.required
    ? ` Delivery: ${delivery.label || 'selected'} (${formatCedi(delivery.fee || 0)}).`
    : '';
  const trackText = trackingLink ? ` Track your order: ${trackingLink}` : '';
  return `Hello ${customerDisplayName(sale?.customer)}, your order ${orderNumber} from ${companyName} has been received. Total: ${total}.${deliveryText}${trackText}`;
};

/**
 * @param {string} tenantId
 * @param {object} sale
 * @param {{ name: string }} company
 * @param {string|null} trackingLink
 * @returns {Promise<string>}
 */
const buildOrderCreatedSmsMessage = async (tenantId, sale, company, trackingLink) => {
  const branchName = sale.shop?.name || sale.studioLocation?.name || '';
  const variables = {
    customerName: customerDisplayName(sale?.customer),
    businessName: company.name,
    branchName,
    orderNumber: sale?.saleNumber || String(sale?.id || ''),
    amount: formatCedi(sale?.total || 0),
    trackingLink: trackingLink || '',
  };
  const rendered = await smsTemplateService.renderForTenant(tenantId, EVENT_KEY, variables);
  return rendered || buildSmsMessageFallback(sale, company.name, trackingLink);
};

/**
 * Notify the customer when an order/sale is created (email / SMS / WhatsApp).
 * @param {{ tenantId: string, sale: object }} params
 * @returns {Promise<{ sent: boolean, results: object[] }>}
 */
const notifyOrderCreatedForCustomer = async ({ tenantId, sale }) => {
  if (!tenantId || !sale?.customer) {
    return { sent: false, results: [] };
  }

  const customer = sale.customer;
  const orderNumber = sale?.saleNumber || String(sale?.id || '');
  const trackingLink = await resolveOrderTrackingLink(tenantId, { orderNumber });

  const tenant = await Tenant.findByPk(tenantId);
  const resolvedNames = await resolveBusinessNameForContext(tenantId, {
    shopId: sale.shopId || sale.shop?.id || customer.shopId || null,
    studioLocationId: sale.studioLocationId || sale.studioLocation?.id || customer.studioLocationId || null,
    customer,
    sale,
  });
  const company = {
    name: resolvedNames.businessName || sale.shop?.name || tenant?.name || 'Business',
    primaryColor: tenant?.metadata?.primaryColor || '#166534',
    logoUrl: getTenantLogoUrl(tenant)
  };
  const results = [];

  const [emailAllowed, smsAllowed, whatsappAllowed] = await Promise.all([
    isChannelEnabledForEvent(tenantId, EVENT_KEY, 'email'),
    isChannelEnabledForEvent(tenantId, EVENT_KEY, 'sms'),
    isChannelEnabledForEvent(tenantId, EVENT_KEY, 'whatsapp')
  ]);

  const email = String(customer.email || '').trim();
  if (emailAllowed && email) {
    const emailConfig = await emailService.getConfig(tenantId);
    if (emailConfig) {
      const { subject, html, text } = emailTemplates.orderCreatedEmail(sale, customer, company, trackingLink);
      const result = await emailService.sendMessage(tenantId, email, subject, html, text);
      results.push({ channel: 'email', success: result.success === true, error: result.error || null });
    }
  }

  const phone = String(customer.phone || '').trim();
  if (smsAllowed && phone) {
    const smsConfig = await smsService.getResolvedConfig(tenantId);
    const smsPhone = smsService.validatePhoneNumber(phone);
    if (smsConfig && smsPhone) {
      const smsBody = await buildOrderCreatedSmsMessage(tenantId, sale, company, trackingLink);
      const result = await smsService.sendMessage(tenantId, smsPhone, smsBody);
      results.push({ channel: 'sms', success: result.success === true, error: result.error || null });
    }
  }

  if (whatsappAllowed && phone) {
    const whatsappConfig = await whatsappService.getConfig(tenantId);
    const whatsappPhone = whatsappService.validatePhoneNumber(phone);
    if (whatsappConfig?.enabled && whatsappPhone) {
      const templateName = whatsappConfig.orderCreatedTemplateName || 'order_created';
      const salePlain = typeof sale.toJSON === 'function' ? sale.toJSON() : sale;
      const whatsappFallback = buildSmsMessageFallback(sale, company.name, trackingLink);
      const result = await whatsappService.sendMessage(
        tenantId,
        whatsappPhone,
        templateName,
        templateName === 'order_created'
          ? whatsappTemplates.prepareOrderCreated({ ...salePlain, tenant })
          : [whatsappFallback.slice(0, 900)],
        whatsappConfig.orderCreatedTemplateLanguage || 'en',
        { category: 'transactional', metadata: { source: EVENT_KEY, saleId: sale.id } }
      );
      results.push({ channel: 'whatsapp', success: result.success === true, error: result.error || null });
    }
  }

  return {
    sent: results.some((result) => result.success),
    results
  };
};

/**
 * @param {object} sale
 * @param {string} companyName
 * @param {string} statusLabel
 * @param {string|null} [trackingLink]
 * @returns {string}
 */
const buildOrderStatusSmsMessageFallback = (sale, companyName, statusLabel, trackingLink = null) => {
  const orderNumber = sale?.saleNumber || 'your order';
  const trackText = trackingLink ? ` Track: ${trackingLink}` : '';
  return `Hi ${customerDisplayName(sale?.customer)}, order ${orderNumber} from ${companyName} is now ${statusLabel}.${trackText}`;
};

/**
 * @param {string} tenantId
 * @param {object} sale
 * @param {{ name: string }} company
 * @param {string} statusLabel
 * @param {string|null} trackingLink
 * @returns {Promise<string>}
 */
const buildOrderStatusSmsMessage = async (tenantId, sale, company, statusLabel, trackingLink) => {
  const branchName = sale.shop?.name || sale.studioLocation?.name || '';
  const variables = {
    customerName: customerDisplayName(sale?.customer),
    businessName: company.name,
    branchName,
    orderNumber: sale?.saleNumber || String(sale?.id || ''),
    orderStatus: statusLabel,
    trackingLink: trackingLink || '',
  };
  const rendered = await smsTemplateService.renderForTenant(tenantId, STATUS_EVENT_KEY, variables);
  return rendered || buildOrderStatusSmsMessageFallback(sale, company.name, statusLabel, trackingLink);
};

/**
 * SMS the customer when an order status / fulfillment state changes.
 * Skips when status is unchanged, phone is missing, SMS is disabled, or entitlement/config is absent.
 * @param {{
 *   tenantId: string,
 *   sale: object,
 *   newStatus: string,
 *   previousStatus?: string|null,
 * }} params
 * @returns {Promise<{ sent: boolean, results: object[], skipped?: boolean, reason?: string }>}
 */
const notifyOrderStatusChangedForCustomer = async ({
  tenantId,
  sale,
  newStatus,
  previousStatus = null,
}) => {
  if (!tenantId || !sale) {
    return { sent: false, results: [], skipped: true, reason: 'missing_sale' };
  }

  const normalizedNew = String(newStatus || '').trim().toLowerCase();
  const normalizedPrevious = previousStatus == null || previousStatus === ''
    ? null
    : String(previousStatus).trim().toLowerCase();

  if (!normalizedNew) {
    return { sent: false, results: [], skipped: true, reason: 'missing_status' };
  }

  if (normalizedPrevious != null && normalizedPrevious === normalizedNew) {
    return { sent: false, results: [], skipped: true, reason: 'unchanged_status' };
  }

  const { customer, phone } = await resolveSaleCustomerContact(sale);
  if (!phone) {
    return { sent: false, results: [], skipped: true, reason: 'missing_phone' };
  }

  const saleWithCustomer = customer ? { ...sale, customer } : sale;
  const statusLabel = formatOrderStatusLabel(normalizedNew);
  const orderNumber = saleWithCustomer?.saleNumber || String(saleWithCustomer?.id || '');

  const smsAllowed = await isChannelEnabledForEvent(tenantId, STATUS_EVENT_KEY, 'sms');
  if (!smsAllowed) {
    return { sent: false, results: [], skipped: true, reason: 'sms_channel_disabled' };
  }

  const smsConfig = await smsService.getResolvedConfig(tenantId);
  const smsPhone = smsService.validatePhoneNumber(phone);
  if (!smsConfig || !smsPhone) {
    return { sent: false, results: [], skipped: true, reason: !smsConfig ? 'sms_not_configured' : 'invalid_phone' };
  }

  const tenant = await Tenant.findByPk(tenantId);
  const resolvedNames = await resolveBusinessNameForContext(tenantId, {
    shopId: saleWithCustomer.shopId || saleWithCustomer.shop?.id || customer?.shopId || null,
    studioLocationId:
      saleWithCustomer.studioLocationId
      || saleWithCustomer.studioLocation?.id
      || customer?.studioLocationId
      || null,
    customer,
    sale: saleWithCustomer,
  });
  const company = {
    name: resolvedNames.businessName || saleWithCustomer.shop?.name || tenant?.name || 'Business',
  };

  let trackingLink = null;
  try {
    trackingLink = await resolveOrderTrackingLink(tenantId, { orderNumber });
  } catch (err) {
    console.warn('[orderCustomerNotification] tracking link resolve failed:', err?.message || err);
  }

  const smsBody = await buildOrderStatusSmsMessage(
    tenantId,
    saleWithCustomer,
    company,
    statusLabel,
    trackingLink
  );
  const result = await smsService.sendMessage(tenantId, smsPhone, smsBody);
  const results = [{ channel: 'sms', success: result.success === true, error: result.error || null }];

  return {
    sent: results.some((row) => row.success),
    results,
  };
};

module.exports = {
  EVENT_KEY,
  STATUS_EVENT_KEY,
  notifyOrderCreatedForCustomer,
  notifyOrderStatusChangedForCustomer,
  buildSmsMessageFallback,
  buildOrderCreatedSmsMessage,
  buildOrderStatusSmsMessageFallback,
  formatOrderStatusLabel,
};
