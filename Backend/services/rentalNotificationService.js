const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  Rental,
  RentalItem,
  Product,
  Customer,
  Tenant,
  User,
  UserTenant,
  Notification,
  PreBooking,
  PreBookingItem,
  Invoice,
} = require('../models');
const emailService = require('./emailService');
const emailTemplates = require('./emailTemplates');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { getFrontendBaseUrlFromEnv } = require('../utils/frontendUrl');
const {
  getPreferencesForUsers,
  isNotificationChannelEnabled,
} = require('./notificationPreferenceHelper');
const {
  getPromisedPaymentDate,
  isPromisedPaymentDue,
} = require('../utils/rentalPromisedPayment');

const LOG_PREFIX = '[RentalNotification]';

/** Notification type keys stored in logs / Notification.type */
const NOTIFICATION_TYPES = {
  DUE_TOMORROW: 'rental_due_tomorrow',
  DUE_TODAY: 'rental_due_today',
  OVERDUE: 'rental_overdue',
  DAMAGE_PENDING: 'rental_damage_pending',
  PRE_BOOKING_REQUEST: 'rental_pre_booking_request',
  PAYMENT_PROMISED: 'rental_payment_promised',
};

const ACTIVE_RENTAL_STATUSES = ['confirmed', 'active', 'overdue'];
const STAFF_ALERT_CATEGORY = 'alert';

const RENTAL_LIST_INCLUDES = [
  { model: RentalItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] },
  { model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email', 'phone'] },
];

const toDateOnlyString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const startOfDay = (date = new Date()) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const getNotificationLog = (rental) => {
  const metadata = rental?.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
  return Array.isArray(metadata.notificationLog) ? metadata.notificationLog : [];
};

const wasCustomerNotificationSent = (rental, dedupeKey) =>
  getNotificationLog(rental).some((entry) => entry?.key === dedupeKey);

const appendCustomerNotificationLog = async (rental, entry) => {
  const metadata = rental?.metadata && typeof rental.metadata === 'object'
    ? { ...rental.metadata }
    : {};
  const notificationLog = Array.isArray(metadata.notificationLog)
    ? [...metadata.notificationLog]
    : [];
  notificationLog.push({
    ...entry,
    sentAt: new Date().toISOString(),
  });
  metadata.notificationLog = notificationLog.slice(-50);
  await rental.update({ metadata });
  rental.metadata = metadata;
};

const buildRentalLabel = (rental, customer) => {
  const customerName = customer?.name || customer?.company || 'Customer';
  const shortId = String(rental?.id || '').slice(0, 8);
  return shortId ? `Rental ${shortId} — ${customerName}` : customerName;
};

const buildRentalUrl = (rentalId) => `${getFrontendBaseUrlFromEnv()}/rentals/${rentalId}`;

const buildPreBookingUrl = (preBookingId) => `${getFrontendBaseUrlFromEnv()}/rentals?preBooking=${preBookingId}`;

const getCompanyBranding = async (tenantId, tenantCache = new Map()) => {
  if (tenantCache.has(tenantId)) return tenantCache.get(tenantId);
  const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'metadata'] });
  const branding = {
    name: tenant?.name || 'African Business Suite',
    logo: getTenantLogoUrl(tenant),
    primaryColor: tenant?.metadata?.primaryColor || '#166534',
  };
  tenantCache.set(tenantId, branding);
  return branding;
};

const getManagerRecipients = async (tenantId) => {
  const memberships = await UserTenant.findAll({
    where: {
      tenantId,
      role: { [Op.in]: ['admin', 'manager'] },
    },
    attributes: ['userId'],
  });
  const userIds = [...new Set(memberships.map((row) => row.userId).filter(Boolean))];
  if (userIds.length === 0) return [];

  const users = await User.findAll({
    where: {
      id: { [Op.in]: userIds },
      isActive: true,
    },
    attributes: ['id', 'name', 'email'],
  });
  return users.filter((user) => String(user.email || '').trim());
};

const wasStaffNotificationSent = async ({ tenantId, type, dedupeKey }) => {
  const existing = await Notification.findOne({
    where: {
      tenantId,
      type,
      metadata: { dedupeKey },
    },
    attributes: ['id'],
  });
  return Boolean(existing);
};

const notifyManagers = async ({
  tenantId,
  type,
  title,
  message,
  dedupeKey,
  link = null,
  priority = 'normal',
  metadata = {},
  tenantCache = new Map(),
}) => {
  if (await wasStaffNotificationSent({ tenantId, type, dedupeKey })) {
    return { sent: 0, skipped: 1, reason: 'duplicate' };
  }

  const recipients = await getManagerRecipients(tenantId);
  if (recipients.length === 0) {
    console.warn(`${LOG_PREFIX} No admin/manager recipients for tenant ${tenantId}`);
    return { sent: 0, skipped: 1, reason: 'no_recipients' };
  }

  const company = await getCompanyBranding(tenantId, tenantCache);
  const prefsMap = await getPreferencesForUsers(recipients.map((user) => user.id));
  let sent = 0;

  for (const recipient of recipients) {
    const prefs = prefsMap.get(recipient.id);
    const emailEnabled = isNotificationChannelEnabled(prefs, STAFF_ALERT_CATEGORY, 'email');
    const inAppEnabled = isNotificationChannelEnabled(prefs, STAFF_ALERT_CATEGORY, 'in_app');

    if (!emailEnabled && !inAppEnabled) {
      continue;
    }

    if (emailEnabled && recipient.email) {
      const { subject, html, text } = emailTemplates.rentalStaffAlert({
        recipientName: recipient.name,
        title,
        message,
        actionUrl: link ? `${getFrontendBaseUrlFromEnv()}${link.startsWith('/') ? link : `/${link}`}` : null,
        details: metadata.details || [],
        company,
      });
      const emailResult = await emailService.sendMessage(tenantId, recipient.email, subject, html, text);
      if (!emailResult.success) {
        console.error(`${LOG_PREFIX} Staff email failed for ${recipient.email}:`, emailResult.error);
        continue;
      }
    }

    if (inAppEnabled) {
      const notification = await Notification.create({
        tenantId,
        userId: recipient.id,
        type,
        title,
        message,
        priority,
        metadata: {
          ...metadata,
          dedupeKey,
        },
        channels: emailEnabled ? ['in_app', 'email'] : ['in_app'],
        icon: 'Bell',
        link,
      });

      try {
        const { emitNotification } = require('./websocketService');
        emitNotification(tenantId, recipient.id, {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          link: notification.link,
          createdAt: notification.createdAt,
          data: notification.metadata,
        });
      } catch (wsError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`${LOG_PREFIX} WebSocket emit failed:`, wsError?.message);
        }
      }
    }

    sent += 1;
  }

  return { sent, skipped: sent > 0 ? 0 : 1 };
};

const sendCustomerRentalReminder = async ({
  rental,
  reminderType,
  dedupeKey,
  force = false,
  tenantCache = new Map(),
}) => {
  if (!force && wasCustomerNotificationSent(rental, dedupeKey)) {
    return { sent: false, skipped: true, reason: 'duplicate' };
  }

  try {
    const { shouldUseAutomationInsteadOfBuiltIn } = require('./customerNotificationBridgeService');
    const templateKey = reminderType === 'overdue'
      ? 'rental_overdue_reminder'
      : 'rental_due_reminder';
    if (await shouldUseAutomationInsteadOfBuiltIn(rental.tenantId, templateKey)) {
      return { sent: false, skipped: true, reason: 'automation_rule' };
    }
  } catch (_bridgeError) {
    // Keep built-in reminder if the automation bridge is unavailable.
  }

  const customer = rental.customer;
  const customerEmail = String(customer?.email || '').trim();
  if (!customerEmail) {
    return { sent: false, skipped: true, reason: 'no_customer_email' };
  }

  const emailConfig = await emailService.getConfig(rental.tenantId);
  if (!emailConfig) {
    return { sent: false, skipped: true, reason: 'email_not_configured' };
  }

  const company = await getCompanyBranding(rental.tenantId, tenantCache);
  const rentalUrl = buildRentalUrl(rental.id);
  const { subject, html, text } = emailTemplates.rentalDueReminder(
    rental,
    customer,
    rental.items || [],
    company,
    reminderType,
    rentalUrl
  );

  const emailResult = await emailService.sendMessage(
    rental.tenantId,
    customerEmail,
    subject,
    html,
    text
  );

  if (!emailResult.success) {
    console.error(`${LOG_PREFIX} Customer email failed for rental ${rental.id}:`, emailResult.error);
    return { sent: false, skipped: true, reason: 'send_failed' };
  }

  await appendCustomerNotificationLog(rental, {
    key: dedupeKey,
    type: reminderType,
    channel: 'email',
    recipient: customerEmail,
  });

  return { sent: true, skipped: false };
};

/**
 * Notify managers when a damage report is created and pending approval.
 * @param {object} params
 * @param {object} params.damageReport
 * @param {object} params.rental
 * @param {string} [params.productName]
 * @param {string|null} [params.triggeredBy]
 */
const notifyDamageReportCreated = async ({
  damageReport,
  rental,
  productName = 'Rental item',
  triggeredBy = null,
}) => {
  if (!damageReport?.id || !rental?.tenantId) {
    return { sent: 0, skipped: 1, reason: 'invalid_payload' };
  }

  const rentalLabel = buildRentalLabel(rental, rental.customer);
  const dedupeKey = `damage:${damageReport.id}`;
  const severity = String(damageReport.severity || 'minor');
  const repairCost = Number(damageReport.estimatedRepairCost || 0);

  return notifyManagers({
    tenantId: rental.tenantId,
    type: NOTIFICATION_TYPES.DAMAGE_PENDING,
    title: 'Damage report pending approval',
    message: `${productName} on ${rentalLabel} requires manager review (${severity}).`,
    dedupeKey,
    link: `/rentals/${rental.id}`,
    priority: severity === 'severe' ? 'high' : 'normal',
    metadata: {
      dedupeKey,
      damageReportId: damageReport.id,
      rentalId: rental.id,
      productName,
      severity,
      estimatedRepairCost: repairCost,
      triggeredBy,
      details: [
        { label: 'Rental', value: rentalLabel },
        { label: 'Product', value: productName },
        { label: 'Damage type', value: damageReport.damageType || 'other' },
        { label: 'Severity', value: severity },
        { label: 'Estimated repair', value: `GHS ${repairCost.toFixed(2)}` },
      ],
    },
  });
};

/**
 * Notify managers when a new pre-booking request is created.
 * @param {object} params
 * @param {object} params.preBooking
 */
const notifyPreBookingCreated = async ({ preBooking }) => {
  if (!preBooking?.id || !preBooking?.tenantId) {
    return { sent: 0, skipped: 1, reason: 'invalid_payload' };
  }

  const customer = preBooking.customer;
  const customerName = customer?.name || customer?.company || 'Customer';
  const itemNames = (preBooking.items || [])
    .map((item) => item.product?.name || item.productId)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  const dedupeKey = `prebooking:${preBooking.id}`;

  return notifyManagers({
    tenantId: preBooking.tenantId,
    type: NOTIFICATION_TYPES.PRE_BOOKING_REQUEST,
    title: 'New rental pre-booking request',
    message: `${customerName} requested a rental from ${toDateOnlyString(preBooking.requestedStartDate)} to ${toDateOnlyString(preBooking.requestedEndDate)}.`,
    dedupeKey,
    link: '/rentals',
    priority: 'normal',
    metadata: {
      dedupeKey,
      preBookingId: preBooking.id,
      customerId: preBooking.customerId,
      details: [
        { label: 'Customer', value: customerName },
        { label: 'Dates', value: `${toDateOnlyString(preBooking.requestedStartDate)} → ${toDateOnlyString(preBooking.requestedEndDate)}` },
        { label: 'Items', value: itemNames || 'See pre-booking' },
      ],
    },
  });
};

/**
 * Process scheduled rental reminders (due tomorrow, due today, overdue).
 * @param {{ force?: boolean, tenantId?: string|null, types?: string[]|null }} [options]
 */
const processScheduledReminders = async (options = {}) => {
  const { force = false, tenantId = null, types = null } = options;
  const enabledTypes = Array.isArray(types) && types.length > 0
    ? new Set(types)
    : new Set([
      NOTIFICATION_TYPES.DUE_TOMORROW,
      NOTIFICATION_TYPES.DUE_TODAY,
      NOTIFICATION_TYPES.OVERDUE,
      NOTIFICATION_TYPES.PAYMENT_PROMISED,
    ]);

  const today = startOfDay();
  const todayKey = toDateOnlyString(today);
  const tomorrowKey = toDateOnlyString(addDays(today, 1));
  const tenantCache = new Map();

  const baseWhere = {
    status: { [Op.in]: ACTIVE_RENTAL_STATUSES },
    ...(tenantId ? { tenantId } : {}),
  };

  const summary = {
    dueTomorrow: { sent: 0, skipped: 0 },
    dueToday: { sent: 0, skipped: 0 },
    overdueCustomer: { sent: 0, skipped: 0 },
    overdueStaff: { sent: 0, skipped: 0 },
    paymentPromised: { sent: 0, skipped: 0 },
  };

  if (enabledTypes.has(NOTIFICATION_TYPES.DUE_TOMORROW)) {
    const rentalsDueTomorrow = await Rental.findAll({
      where: {
        ...baseWhere,
        endDate: tomorrowKey,
      },
      include: RENTAL_LIST_INCLUDES,
    });

    for (const rental of rentalsDueTomorrow) {
      const dedupeKey = `due_tomorrow:${rental.id}:${tomorrowKey}`;
      const result = await sendCustomerRentalReminder({
        rental,
        reminderType: 'tomorrow',
        dedupeKey,
        force,
        tenantCache,
      });
      if (result.sent) summary.dueTomorrow.sent += 1;
      else summary.dueTomorrow.skipped += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  if (enabledTypes.has(NOTIFICATION_TYPES.DUE_TODAY)) {
    const rentalsDueToday = await Rental.findAll({
      where: {
        ...baseWhere,
        endDate: todayKey,
      },
      include: RENTAL_LIST_INCLUDES,
    });

    for (const rental of rentalsDueToday) {
      const dedupeKey = `due_today:${rental.id}:${todayKey}`;
      const result = await sendCustomerRentalReminder({
        rental,
        reminderType: 'today',
        dedupeKey,
        force,
        tenantCache,
      });
      if (result.sent) summary.dueToday.sent += 1;
      else summary.dueToday.skipped += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  if (enabledTypes.has(NOTIFICATION_TYPES.OVERDUE)) {
    const overdueRentals = await Rental.findAll({
      where: {
        ...baseWhere,
        [Op.or]: [
          { status: 'overdue' },
          { endDate: { [Op.lt]: todayKey } },
        ],
      },
      include: RENTAL_LIST_INCLUDES,
    });

    for (const rental of overdueRentals) {
      const endDateKey = toDateOnlyString(rental.endDate);
      const customerDedupeKey = `overdue:${rental.id}:${todayKey}`;
      const customerResult = await sendCustomerRentalReminder({
        rental,
        reminderType: 'overdue',
        dedupeKey: customerDedupeKey,
        force,
        tenantCache,
      });
      if (customerResult.sent) summary.overdueCustomer.sent += 1;
      else summary.overdueCustomer.skipped += 1;

      const staffDedupeKey = `staff_overdue:${rental.id}:${todayKey}`;
      const rentalLabel = buildRentalLabel(rental, rental.customer);
      const staffResult = await notifyManagers({
        tenantId: rental.tenantId,
        type: NOTIFICATION_TYPES.OVERDUE,
        title: 'Overdue rental',
        message: `${rentalLabel} was due back on ${endDateKey}.`,
        dedupeKey: staffDedupeKey,
        link: `/rentals/${rental.id}`,
        priority: 'high',
        metadata: {
          dedupeKey: staffDedupeKey,
          rentalId: rental.id,
          endDate: endDateKey,
          details: [
            { label: 'Rental', value: rentalLabel },
            { label: 'Due date', value: endDateKey },
            { label: 'Status', value: rental.status },
          ],
        },
        tenantCache,
      });
      if (staffResult.sent > 0) summary.overdueStaff.sent += staffResult.sent;
      else summary.overdueStaff.skipped += 1;

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  if (enabledTypes.has(NOTIFICATION_TYPES.PAYMENT_PROMISED)) {
    const candidateRentals = await Rental.findAll({
      where: {
        status: { [Op.notIn]: ['cancelled'] },
        ...(tenantId ? { tenantId } : {}),
      },
      include: RENTAL_LIST_INCLUDES,
    });
    const invoiceIds = [...new Set(
      candidateRentals
        .map((rental) => rental?.metadata?.invoiceId)
        .filter(Boolean)
    )];
    const invoices = invoiceIds.length > 0
      ? await Invoice.findAll({
        where: { id: { [Op.in]: invoiceIds } },
        attributes: ['id', 'status', 'balance', 'total', 'amountPaid'],
      })
      : [];
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

    for (const rental of candidateRentals) {
      const promisedDate = getPromisedPaymentDate(rental);
      const invoice = rental?.metadata?.invoiceId
        ? invoiceById.get(rental.metadata.invoiceId)
        : null;
      if (!isPromisedPaymentDue(rental, todayKey, invoice)) continue;

      const rentalLabel = buildRentalLabel(rental, rental.customer);
      const staffDedupeKey = `staff_payment_promised:${rental.id}:${todayKey}`;
      const balance = Number(
        Math.max(0, Number(rental.totalDue || 0) - Number(rental.amountPaid || 0)).toFixed(2)
      );
      const staffResult = await notifyManagers({
        tenantId: rental.tenantId,
        type: NOTIFICATION_TYPES.PAYMENT_PROMISED,
        title: 'Promised rental payment due',
        message: `${rentalLabel} promised to pay by ${promisedDate}. Hire is still unpaid.`,
        dedupeKey: staffDedupeKey,
        link: `/rentals/${rental.id}`,
        priority: 'high',
        metadata: {
          dedupeKey: staffDedupeKey,
          rentalId: rental.id,
          promisedPaymentDate: promisedDate,
          details: [
            { label: 'Rental', value: rentalLabel },
            { label: 'Promised date', value: promisedDate },
            { label: 'Hire still due', value: `GHS ${balance.toFixed(2)}` },
          ],
        },
        tenantCache,
      });
      if (staffResult.sent > 0) summary.paymentPromised.sent += staffResult.sent;
      else summary.paymentPromised.skipped += 1;

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  console.log(`${LOG_PREFIX} Scheduled reminders complete`, summary);
  return summary;
};

class RentalNotificationService {
  constructor() {
    this.isRunning = false;
  }

  async checkAndSendReminders(options = {}) {
    if (this.isRunning) {
      console.log(`${LOG_PREFIX} Already running, skipping...`);
      return { skipped: true, reason: 'already_running' };
    }

    this.isRunning = true;
    console.log(`${LOG_PREFIX} Starting scheduled reminder check...`);

    try {
      return await processScheduledReminders(options);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error:`, error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    cron.schedule('30 8 * * *', () => {
      this.checkAndSendReminders().catch((error) => {
        console.error(`${LOG_PREFIX} Cron run failed:`, error);
      });
    });
    console.log(`${LOG_PREFIX} Scheduled job started (runs daily at 8:30 AM)`);
  }
}

const rentalNotificationService = new RentalNotificationService();

module.exports = rentalNotificationService;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.notifyDamageReportCreated = notifyDamageReportCreated;
module.exports.notifyPreBookingCreated = notifyPreBookingCreated;
module.exports.processScheduledReminders = processScheduledReminders;
module.exports.sendCustomerRentalReminder = sendCustomerRentalReminder;
module.exports.notifyManagers = notifyManagers;
