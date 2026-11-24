const crypto = require('crypto');
const { Notification } = require('../models');
const {
  getPreferencesForUsers,
  isNotificationChannelEnabled,
  normalizeNotificationCategory
} = require('./notificationPreferenceHelper');
const { dispatchExpoPushToUsers } = require('./pushNotificationService');
const { formatDecimal } = require('../utils/formatNumber');
const { invalidateNotificationsCache } = require('../middleware/cache');

const logPrefix = '[Notifications]';

const dispatchPushForNotification = async ({ tenantId, userIds, payload }) => {
  const channels = payload.channels || ['in_app'];
  if (!channels.includes('push')) return;

  try {
    const result = await dispatchExpoPushToUsers({
      tenantId,
      userIds,
      title: payload.title || 'Notification',
      message: payload.message,
      type: payload.type || 'info',
      priority: payload.priority || 'normal',
      metadata: payload.metadata || {},
      link: payload.link || null
    });
    if (result.attempted > 0) {
      console.log(`${logPrefix} Push dispatched`, {
        attempted: result.attempted,
        sent: result.sent,
        invalidTokens: result.invalidTokens,
        title: payload.title
      });
    }
  } catch (error) {
    console.error(`${logPrefix} Push dispatch failed`, {
      title: payload.title,
      error: error.message
    });
  }
};

const createNotification = async ({
  tenantId,
  userId,
  title,
  message,
  type = 'info',
  priority = 'normal',
  metadata = {},
  channels = ['in_app'],
  icon = null,
  link = null,
  triggeredBy = null,
  transaction = null
}) => {
  if (!tenantId || !userId || !title) {
    console.warn(`${logPrefix} Skipping notification creation: missing tenantId, userId or title`, {
      tenantId,
      userId,
      title
    });
    return null;
  }

  const gatedCategory = normalizeNotificationCategory(type);
  if (gatedCategory && (channels || []).includes('in_app')) {
    const prefsMap = await getPreferencesForUsers([userId]);
    const prefs = prefsMap.get(userId);
    if (!isNotificationChannelEnabled(prefs, gatedCategory, 'in_app')) {
      console.log(`${logPrefix} Skipping in-app notification (user preference)`, {
        userId,
        type: gatedCategory
      });
      return null;
    }
  }

  try {
    const notification = await Notification.create(
      {
        tenantId,
        userId,
        title,
        message,
        type,
        priority,
        metadata,
        channels,
        icon,
        link,
        triggeredBy
      },
      { transaction }
    );

    console.log(`${logPrefix} Created notification`, {
      id: notification.id,
      userId,
      title,
      type
    });
    invalidateNotificationsCache(tenantId, userId);

    // Emit to websocket for real-time UI updates
    try {
      const { emitNotification } = require('./websocketService');
      emitNotification(tenantId, userId, {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt
      });
    } catch (wsErr) {
      if (process.env.NODE_ENV === 'development') console.warn(`${logPrefix} WebSocket emit failed:`, wsErr?.message);
    }

    await dispatchPushForNotification({
      tenantId,
      userIds: [userId],
      payload: {
        title,
        message,
        type,
        priority,
        metadata,
        channels,
        link
      }
    });

    return notification;
  } catch (error) {
    console.error(`${logPrefix} Failed to create notification`, {
      userId,
      title,
      error: error.message
    });
    throw error;
  }
};

const notifyUsers = async ({ tenantId, userIds, payload = {}, transaction = null }) => {
  if (!tenantId) {
    console.warn(`${logPrefix} notifyUsers missing tenantId`, { userIds });
    return [];
  }

  if (!userIds || userIds.length === 0) {
    console.warn(`${logPrefix} notifyUsers called with empty userIds`);
    return [];
  }

  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    console.warn(`${logPrefix} notifyUsers filtered userIds to zero`, { userIds });
    return [];
  }

  const prefsMap = await getPreferencesForUsers(uniqueUserIds);
  const categoryForPrefs = payload.type || 'info';
  const gatedCategory = normalizeNotificationCategory(categoryForPrefs);

  const eligibleUserIds = uniqueUserIds.filter((uid) => {
    if (!gatedCategory) return true;
    const ch = payload.channels || ['in_app'];
    if (!ch.includes('in_app')) return true;
    return isNotificationChannelEnabled(prefsMap.get(uid), gatedCategory, 'in_app');
  });

  if (eligibleUserIds.length === 0) {
    console.log(`${logPrefix} notifyUsers: no recipients after preference filter`, {
      category: gatedCategory,
      requested: uniqueUserIds.length
    });
    return [];
  }

  const notifications = eligibleUserIds.map((userId) => ({
    ...payload,
    tenantId,
    userId,
    title: payload.title || 'Notification',
    type: payload.type || 'info',
    priority: payload.priority || 'normal',
    channels: payload.channels || ['in_app']
  }));

  try {
    const created = await Notification.bulkCreate(notifications, { transaction });
    console.log(`${logPrefix} bulkCreate`, {
      count: created.length,
      userIds: uniqueUserIds,
      title: payload.title
    });
    eligibleUserIds.forEach((uid) => invalidateNotificationsCache(tenantId, uid));
    // Emit to websocket for real-time UI updates (fire-and-forget)
    try {
      const { emitNotification } = require('./websocketService');
      created.forEach((n) => {
        emitNotification(tenantId, n.userId, {
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          link: payload.link,
          createdAt: n.createdAt
        });
      });
    } catch (wsErr) {
      if (process.env.NODE_ENV === 'development') console.warn(`${logPrefix} WebSocket emit failed:`, wsErr?.message);
    }
    await dispatchPushForNotification({
      tenantId,
      userIds: eligibleUserIds,
      payload: {
        ...payload,
        title: payload.title || 'Notification',
        type: payload.type || 'info',
        priority: payload.priority || 'normal',
        channels: payload.channels || ['in_app']
      }
    });
    return created;
  } catch (error) {
    console.error(`${logPrefix} Failed bulkCreate`, {
      userIds: uniqueUserIds,
      title: payload.title,
      error: error.message
    });
    throw error;
  }
};

const formatJobTitle = (job) => {
  if (!job) return 'Job update';
  return `${job.jobNumber || job.title || 'Job'}${job.title ? ` • ${job.title}` : ''}`;
};

const notifyJobAssigned = async ({ job, triggeredBy = null }) => {
  if (!job || !job.assignedTo) {
    console.warn(`${logPrefix} notifyJobAssigned skipped`, {
      jobId: job?.id,
      hasAssignedTo: Boolean(job?.assignedTo)
    });
    return null;
  }

  const tenantId = job.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyJobAssigned missing tenantId`, {
      jobId: job.id
    });
    return null;
  }

  const jobTitle = formatJobTitle(job);
  const link = `/jobs/${job.id}`;

  const payload = {
    userId: job.assignedTo,
    title: 'New Job Assigned',
    message: `You have been assigned to ${jobTitle}.`,
    type: 'job',
    priority: 'high',
    metadata: {
      jobId: job.id,
      jobNumber: job.jobNumber,
      status: job.status
    },
    icon: 'team',
    link,
    triggeredBy
  };

  console.log(`${logPrefix} notifyJobAssigned`, {
    jobId: job.id,
    assignedTo: job.assignedTo,
    triggeredBy
  });

  return createNotification({
    tenantId,
    ...payload
  });
};

const notifyJobStatusChanged = async ({ job, oldStatus, newStatus, triggeredBy = null }) => {
  if (!job || !newStatus || oldStatus === newStatus) {
    console.warn(`${logPrefix} notifyJobStatusChanged skipped`, {
      jobId: job?.id,
      oldStatus,
      newStatus
    });
    return [];
  }

  const recipientSet = new Set();
  if (job.assignedTo) recipientSet.add(job.assignedTo);
  if (job.createdBy) recipientSet.add(job.createdBy);
  if (triggeredBy) recipientSet.add(triggeredBy);

  const recipients = Array.from(recipientSet).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`${logPrefix} notifyJobStatusChanged no recipients`, {
      jobId: job.id,
      oldStatus,
      newStatus
    });
    return [];
  }

  const tenantId = job.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyJobStatusChanged missing tenantId`, {
      jobId: job.id
    });
    return [];
  }

  const jobTitle = formatJobTitle(job);
  const link = `/jobs/${job.id}`;

  const payload = {
    title: 'Job Status Updated',
    message: `${jobTitle} moved from ${oldStatus?.replace('_', ' ')} to ${newStatus.replace('_', ' ')}.`,
    type: 'job',
    priority: 'normal',
    metadata: {
      jobId: job.id,
      jobNumber: job.jobNumber,
      oldStatus,
      newStatus
    },
    icon: 'swap',
    link,
    triggeredBy
  };

  console.log(`${logPrefix} notifyJobStatusChanged`, {
    jobId: job.id,
    recipients,
    oldStatus,
    newStatus,
    triggeredBy
  });

  return notifyUsers({
    tenantId,
    userIds: recipients,
    payload
  });
};

const notifyLeadCreated = async ({ lead, triggeredBy = null }) => {
  if (!lead) {
    console.warn(`${logPrefix} notifyLeadCreated skipped`, {
      leadId: lead?.id
    });
    return null;
  }

  if (!lead.assignedTo) {
    console.warn(`${logPrefix} notifyLeadCreated no assignee`, {
      leadId: lead.id
    });
    return null;
  }

  const tenantId = lead.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyLeadCreated missing tenantId`, {
      leadId: lead.id
    });
    return null;
  }

  const payload = {
    userId: lead.assignedTo,
    title: 'New Lead Assigned',
    message: `${lead.name || lead.company || 'A new lead'} has been assigned to you.`,
    type: 'lead',
    priority: 'high',
    metadata: {
      leadId: lead.id,
      status: lead.status,
      priority: lead.priority
    },
    icon: 'user-add',
    link: `/leads/${lead.id}`,
    triggeredBy
  };

  console.log(`${logPrefix} notifyLeadCreated`, {
    leadId: lead.id,
    assignedTo: lead.assignedTo,
    triggeredBy
  });

  return createNotification({
    tenantId,
    ...payload
  });
};

const notifyLeadStatusChanged = async ({ lead, oldStatus, newStatus, triggeredBy = null }) => {
  if (!lead || !newStatus || oldStatus === newStatus) {
    console.warn(`${logPrefix} notifyLeadStatusChanged skipped`, {
      leadId: lead?.id,
      oldStatus,
      newStatus
    });
    return [];
  }

  const recipientSet = new Set();
  if (lead.assignedTo) recipientSet.add(lead.assignedTo);
  if (triggeredBy && triggeredBy !== lead.assignedTo) recipientSet.add(triggeredBy);

  const recipients = Array.from(recipientSet).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`${logPrefix} notifyLeadStatusChanged no recipients`, {
      leadId: lead.id,
      oldStatus,
      newStatus
    });
    return [];
  }

  const tenantId = lead.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyLeadStatusChanged missing tenantId`, {
      leadId: lead.id
    });
    return [];
  }

  const link = `/leads/${lead.id}`;

  const payload = {
    title: 'Lead Status Updated',
    message: `${lead.name || lead.company || 'Lead'} moved from ${oldStatus?.replace('_', ' ')} to ${newStatus.replace('_', ' ')}.`,
    type: 'lead',
    priority: 'normal',
    metadata: {
      leadId: lead.id,
      oldStatus,
      newStatus
    },
    icon: 'flag',
    link,
    triggeredBy
  };

  console.log(`${logPrefix} notifyLeadStatusChanged`, {
    leadId: lead.id,
    recipients,
    oldStatus,
    newStatus,
    triggeredBy
  });

  return notifyUsers({
    tenantId,
    userIds: recipients,
    payload
  });
};

const notifyLeadActivityLogged = async ({ lead, activity, triggeredBy = null }) => {
  if (!lead || !activity) {
    console.warn(`${logPrefix} notifyLeadActivityLogged skipped`, {
      leadId: lead?.id,
      hasActivity: Boolean(activity)
    });
    return [];
  }

  const recipientSet = new Set();
  if (lead.assignedTo) recipientSet.add(lead.assignedTo);
  if (triggeredBy && triggeredBy !== lead.assignedTo) recipientSet.add(triggeredBy);

  const recipients = Array.from(recipientSet).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`${logPrefix} notifyLeadActivityLogged no recipients`, {
      leadId: lead.id,
      activityId: activity.id
    });
    return [];
  }

  const tenantId = lead.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyLeadActivityLogged missing tenantId`, {
      leadId: lead.id,
      activityId: activity?.id
    });
    return [];
  }

  const link = `/leads/${lead.id}`;

  const payload = {
    title: 'New Lead Activity',
    message: `${lead.name || lead.company || 'Lead'} has a new ${activity.type || 'activity'} logged.`,
    type: 'lead',
    priority: 'normal',
    metadata: {
      leadId: lead.id,
      activityId: activity.id,
      activityType: activity.type
    },
    icon: 'message',
    link,
    triggeredBy
  };

  console.log(`${logPrefix} notifyLeadActivityLogged`, {
    leadId: lead.id,
    activityId: activity.id,
    recipients,
    triggeredBy
  });

  return notifyUsers({
    tenantId,
    userIds: recipients,
    payload
  });
};

const notifyInvoiceSent = async ({ invoice, triggeredBy = null }) => {
  console.log(`${logPrefix} notifyInvoiceSent called`, {
    invoiceId: invoice?.id,
    invoiceNumber: invoice?.invoiceNumber,
    hasInvoice: !!invoice,
    hasJob: !!invoice?.job,
    jobId: invoice?.job?.id,
    jobCreatedBy: invoice?.job?.createdBy,
    jobAssignedTo: invoice?.job?.assignedTo
  });

  if (!invoice) {
    console.warn(`${logPrefix} notifyInvoiceSent skipped - no invoice`, {
      invoiceId: invoice?.id
    });
    return [];
  }

  const tenantId = invoice.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyInvoiceSent missing tenantId`, {
      invoiceId: invoice.id
    });
    return [];
  }

  // For financial notifications, notify ALL managers and admins in the tenant
  const { User, UserTenant } = require('../models');
  
  const recipientSet = new Set();
  
  // Add job team members
  if (invoice.job) {
    console.log(`${logPrefix} notifyInvoiceSent - processing job`, {
      jobId: invoice.job.id,
      createdBy: invoice.job.createdBy,
      assignedTo: invoice.job.assignedTo
    });
    if (invoice.job.createdBy) recipientSet.add(invoice.job.createdBy);
    if (invoice.job.assignedTo) recipientSet.add(invoice.job.assignedTo);
  }
  
  // Add ALL managers and admins in the tenant for financial visibility
  try {
    const managerUsers = await UserTenant.findAll({
      where: {
        tenantId,
        role: { [require('sequelize').Op.in]: ['admin', 'manager'] }
      },
      attributes: ['userId']
    });
    
    console.log(`${logPrefix} notifyInvoiceSent - found managers/admins`, {
      count: managerUsers.length,
      userIds: managerUsers.map(u => u.userId)
    });
    
    managerUsers.forEach(ut => {
      if (ut.userId) recipientSet.add(ut.userId);
    });
  } catch (error) {
    console.error(`${logPrefix} notifyInvoiceSent - failed to fetch managers`, error.message);
  }

  const recipients = Array.from(recipientSet).filter(Boolean);
  console.log(`${logPrefix} notifyInvoiceSent recipients determined`, {
    invoiceId: invoice.id,
    recipientCount: recipients.length,
    recipients: recipients
  });

  if (recipients.length === 0) {
    console.warn(`${logPrefix} notifyInvoiceSent no recipients - NOTIFICATION WILL NOT BE SENT!`, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      hasJob: !!invoice.job,
      jobId: invoice.jobId
    });
    return [];
  }

  const link = `/invoices`;

  const payload = {
    title: 'Invoice Sent',
    message: `Invoice ${invoice.invoiceNumber} for ${invoice.customer?.company || invoice.customer?.name || 'customer'} has been sent (GHS ${formatDecimal(invoice.totalAmount)}).`,
    type: 'invoice',
    priority: 'normal',
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      totalAmount: invoice.totalAmount
    },
    icon: 'mail',
    link,
    triggeredBy
  };

  console.log(`${logPrefix} notifyInvoiceSent`, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    recipients,
    triggeredBy
  });

  return notifyUsers({
    tenantId,
    userIds: recipients,
    payload
  });
};

const notifyInvoicePaid = async ({ invoice, triggeredBy = null }) => {
  console.log(`${logPrefix} notifyInvoicePaid called`, {
    invoiceId: invoice?.id,
    invoiceNumber: invoice?.invoiceNumber,
    hasInvoice: !!invoice,
    hasJob: !!invoice?.job,
    jobId: invoice?.job?.id,
    jobCreatedBy: invoice?.job?.createdBy,
    jobAssignedTo: invoice?.job?.assignedTo
  });

  if (!invoice) {
    console.warn(`${logPrefix} notifyInvoicePaid skipped - no invoice`, {
      invoiceId: invoice?.id
    });
    return [];
  }

  const tenantId = invoice.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyInvoicePaid missing tenantId`, {
      invoiceId: invoice.id
    });
    return [];
  }

  // For financial notifications, notify ALL managers and admins in the tenant
  const { User, UserTenant } = require('../models');
  
  const recipientSet = new Set();
  
  // Add job team members
  if (invoice.job) {
    console.log(`${logPrefix} notifyInvoicePaid - processing job`, {
      jobId: invoice.job.id,
      createdBy: invoice.job.createdBy,
      assignedTo: invoice.job.assignedTo
    });
    if (invoice.job.createdBy) recipientSet.add(invoice.job.createdBy);
    if (invoice.job.assignedTo) recipientSet.add(invoice.job.assignedTo);
  }
  
  // Add ALL managers and admins in the tenant for financial visibility
  try {
    const managerUsers = await UserTenant.findAll({
      where: {
        tenantId,
        role: { [require('sequelize').Op.in]: ['admin', 'manager'] }
      },
      attributes: ['userId']
    });
    
    console.log(`${logPrefix} notifyInvoicePaid - found managers/admins`, {
      count: managerUsers.length,
      userIds: managerUsers.map(u => u.userId)
    });
    
    managerUsers.forEach(ut => {
      if (ut.userId) recipientSet.add(ut.userId);
    });
  } catch (error) {
    console.error(`${logPrefix} notifyInvoicePaid - failed to fetch managers`, error.message);
  }

  const recipients = Array.from(recipientSet).filter(Boolean);
  console.log(`${logPrefix} notifyInvoicePaid recipients determined`, {
    invoiceId: invoice.id,
    recipientCount: recipients.length,
    recipients: recipients
  });

  if (recipients.length === 0) {
    console.warn(`${logPrefix} notifyInvoicePaid no recipients - NOTIFICATION WILL NOT BE SENT!`, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      hasJob: !!invoice.job,
      jobId: invoice.jobId
    });
    return [];
  }

  const link = `/invoices`;

  const payload = {
    title: 'Payment Received',
    message: `Invoice ${invoice.invoiceNumber} for ${invoice.customer?.company || invoice.customer?.name || 'customer'} has been paid (GHS ${formatDecimal(invoice.amountPaid)}).`,
    type: 'payment',
    priority: 'high',
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      amountPaid: invoice.amountPaid,
      totalAmount: invoice.totalAmount
    },
    icon: 'dollar',
    link,
    triggeredBy
  };

  console.log(`${logPrefix} notifyInvoicePaid`, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    recipients,
    triggeredBy
  });

  return notifyUsers({
    tenantId,
    userIds: recipients,
    payload
  });
};

/**
 * Notify relevant users when a new order (restaurant sale) is created.
 */
const notifyNewOrder = async ({ sale, triggeredBy = null }) => {
  if (!sale || !sale.orderStatus) {
    return [];
  }
  const tenantId = sale.tenantId;
  if (!tenantId) return [];

  const recipientSet = new Set();
  if (triggeredBy) recipientSet.add(triggeredBy);
  try {
    const { UserTenant } = require('../models');
    const { Op } = require('sequelize');
    const memberUsers = await UserTenant.findAll({
      where: { tenantId, role: { [Op.in]: ['admin', 'manager', 'staff', 'driver'] } },
      attributes: ['userId']
    });
    memberUsers.forEach((ut) => { if (ut.userId) recipientSet.add(ut.userId); });
  } catch (error) {
    console.error(`${logPrefix} notifyNewOrder - failed to fetch users`, error.message);
  }
  const recipients = Array.from(recipientSet).filter(Boolean);
  if (recipients.length === 0) return [];

  const saleNumber = sale.saleNumber || `Order #${sale.id}`;
  const payload = {
    title: 'New Order Received',
    message: `${saleNumber} has been placed and is ready for the kitchen.`,
    type: 'order',
    priority: 'high',
    metadata: { saleId: sale.id, saleNumber, orderStatus: sale.orderStatus },
    icon: 'utensils',
    link: '/orders',
    triggeredBy
  };
  return notifyUsers({ tenantId, userIds: recipients, payload });
};

/**
 * Notify shop users when a paid storefront marketplace order is received.
 */
const ONLINE_STORE_ORDER_NOTIFY_ROLES = ['owner', 'admin', 'manager', 'staff'];

const notifyOnlineStoreOrderReceived = async ({ sale, shopper = null, store = null, triggeredBy = null }) => {
  if (!sale || !sale.tenantId) {
    return [];
  }

  const tenantId = sale.tenantId;
  const recipientSet = new Set();
  if (triggeredBy) recipientSet.add(triggeredBy);

  try {
    const { UserTenant } = require('../models');
    const { Op } = require('sequelize');
    const { sequelize } = require('../config/database');
    const existingCount = await Notification.count({
      where: {
        tenantId,
        type: 'order',
        [Op.and]: [
          sequelize.where(sequelize.literal(`"Notification"."metadata"->>'source'`), 'online_store'),
          sequelize.where(sequelize.literal(`"Notification"."metadata"->>'saleId'`), String(sale.id)),
        ],
      },
    });
    if (existingCount > 0) {
      console.log(`${logPrefix} notifyOnlineStoreOrderReceived skipped (already notified)`, {
        saleId: sale.id,
        tenantId,
      });
      return [];
    }

    const memberUsers = await UserTenant.findAll({
      where: {
        tenantId,
        role: { [Op.in]: ONLINE_STORE_ORDER_NOTIFY_ROLES },
        status: 'active'
      },
      attributes: ['userId']
    });
    memberUsers.forEach((ut) => { if (ut.userId) recipientSet.add(ut.userId); });
  } catch (error) {
    console.error(`${logPrefix} notifyOnlineStoreOrderReceived - failed to fetch users`, error.message);
  }

  const recipients = Array.from(recipientSet).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`${logPrefix} notifyOnlineStoreOrderReceived no recipients`, {
      saleId: sale.id,
      tenantId,
    });
    return [];
  }

  const saleNumber = sale.saleNumber || `Order #${sale.id}`;
  const shopperName = shopper?.name || shopper?.fullName || shopper?.email || 'A shopper';
  const storeName = store?.displayName || store?.shop?.name || 'your online store';
  const payload = {
    title: 'New Online Store Order',
    message: `${shopperName} placed ${saleNumber} from ${storeName}. Review it in Online Orders.`,
    type: 'order',
    priority: 'high',
    channels: ['in_app', 'push'],
    metadata: {
      saleId: sale.id,
      saleNumber,
      shopId: sale.shopId || null,
      source: 'online_store',
      storefrontCustomerId: shopper?.id || null
    },
    icon: 'shopping-bag',
    link: '/store/orders',
    triggeredBy
  };

  return notifyUsers({ tenantId, userIds: recipients, payload });
};

const UNAVAILABLE_ITEM_SOURCE = 'online_store_unavailable';
const UNAVAILABLE_ALERT_WINDOW_MS = 60 * 60 * 1000;
const MAX_UNAVAILABLE_ALERTS_PER_WINDOW = 20;

/** Text a shopper typed, made safe to show in an alert: one short line, no links. */
const cleanShopperText = (value, max) => String(value || '')
  // eslint-disable-next-line no-control-regex
  .replace(/https?:\/\/\S*|www\.\S*|[<>\u0000-\u001f]/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/**
 * Tell a store that a shopper tried to buy what it does not have. At most once an hour per shopper and item.
 * @param {{ store: object, items: Array<{ listingId: string, title: string, requested: number, left: number }>, shopper?: object, phone?: string }} params
 * @returns {Promise<boolean>} whether the store has been told, now or earlier in the hour
 */
const notifyOnlineStoreItemsUnavailable = async ({ store, items, shopper = null, phone = '' }) => {
  const tenantId = store?.tenantId;
  if (!tenantId || !items?.length) return false;

  const { UserTenant } = require('../models');
  const { Op } = require('sequelize');
  const { sequelize } = require('../config/database');
  const members = await UserTenant.findAll({
    where: { tenantId, role: { [Op.in]: ONLINE_STORE_ORDER_NOTIFY_ROLES }, status: 'active' },
    attributes: ['userId'],
  });
  const userIds = [...new Set(members.map(({ userId }) => userId).filter(Boolean))];
  if (userIds.length === 0) return false;

  const shopperPhone = cleanShopperText(phone, 25);
  const shopperKey = String(
    shopper?.id || shopper?.email || shopperPhone.replace(/\D/g, '') || 'unknown'
  ).toLowerCase();
  const recent = await Notification.findAll({
    where: {
      tenantId,
      createdAt: { [Op.gte]: new Date(Date.now() - UNAVAILABLE_ALERT_WINDOW_MS) },
      [Op.and]: [
        sequelize.where(sequelize.literal(`"Notification"."metadata"->>'source'`), UNAVAILABLE_ITEM_SOURCE),
      ],
    },
    attributes: ['metadata'],
  });
  // Everyone gets a copy of each alert; count alerts, not copies.
  const alerts = new Map(recent.map(({ metadata }) => [metadata?.alertId, metadata]));
  const alreadyTold = new Set([...alerts.values()]
    .filter((metadata) => metadata?.shopperKey === shopperKey)
    .flatMap((metadata) => metadata.listingIds || []));
  const newItems = items.filter(({ listingId }) => !alreadyTold.has(listingId));
  if (newItems.length === 0) return true;
  if (alerts.size >= MAX_UNAVAILABLE_ALERTS_PER_WINDOW) return false;

  const who = cleanShopperText(shopper?.name || shopper?.fullName, 60) || 'A shopper';
  const describe = ({ title, requested }) => (requested > 1 ? `${requested} × ${title}` : title);
  const [first] = newItems;
  let problem;
  if (newItems.length > 1) {
    const names = newItems.map((item) => `${describe(item)}${item.left > 0 ? ` (${item.left} left)` : ''}`).join(', ');
    problem = `${names}, but they're not available`;
  } else {
    problem = `${describe(first)}, but ${first.left > 0 ? `only ${first.left} ${first.left === 1 ? 'is' : 'are'} left` : "it's not available"}`;
  }

  const created = await notifyUsers({
    tenantId,
    userIds,
    payload: {
      title: 'Someone wants an item you don\'t have',
      message: `${who} is trying to buy ${problem}.${shopperPhone ? ` Phone: ${shopperPhone}` : ''}`,
      type: 'order',
      priority: 'high',
      channels: ['in_app', 'push'],
      metadata: {
        source: UNAVAILABLE_ITEM_SOURCE,
        alertId: crypto.randomUUID(),
        shopperKey,
        listingIds: newItems.map(({ listingId }) => listingId),
        storeSlug: store.slug || null,
      },
      icon: 'shopping-bag',
      link: '/products',
    },
  });
  return created.length > 0;
};

/**
 * Notify relevant users when an order (restaurant sale) status changes.
 * Notifies all admins, managers, and staff in the tenant who may use the Orders/Kitchen page.
 */
const notifyOrderStatusChanged = async ({ sale, oldStatus, newStatus, triggeredBy = null }) => {
  if (!sale || !newStatus || oldStatus === newStatus) {
    console.warn(`${logPrefix} notifyOrderStatusChanged skipped`, {
      saleId: sale?.id,
      oldStatus,
      newStatus
    });
    return [];
  }

  const tenantId = sale.tenantId;
  if (!tenantId) {
    console.warn(`${logPrefix} notifyOrderStatusChanged missing tenantId`, { saleId: sale.id });
    return [];
  }

  const recipientSet = new Set();
  if (sale.soldBy) recipientSet.add(sale.soldBy);
  if (triggeredBy) recipientSet.add(triggeredBy);

  // Notify all admins, managers, and staff who use the kitchen
  try {
    const { UserTenant } = require('../models');
    const { Op } = require('sequelize');
    const memberUsers = await UserTenant.findAll({
      where: {
        tenantId,
        role: { [Op.in]: ['admin', 'manager', 'staff', 'driver'] }
      },
      attributes: ['userId']
    });
    memberUsers.forEach((ut) => {
      if (ut.userId) recipientSet.add(ut.userId);
    });
  } catch (error) {
    console.error(`${logPrefix} notifyOrderStatusChanged - failed to fetch users`, error.message);
  }

  const recipients = Array.from(recipientSet).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`${logPrefix} notifyOrderStatusChanged no recipients`, { saleId: sale.id });
    return [];
  }

  const saleNumber = sale.saleNumber || `Order #${sale.id}`;
  const oldLabel = (oldStatus || 'unknown').replace('_', ' ');
  const newLabel = newStatus.replace('_', ' ');
  const link = '/orders';

  const payload = {
    title: 'Order Status Updated',
    message: `${saleNumber} moved from ${oldLabel} to ${newLabel}.`,
    type: 'order',
    priority: newStatus === 'ready' ? 'high' : 'normal',
    metadata: {
      saleId: sale.id,
      saleNumber,
      oldStatus,
      newStatus
    },
    icon: 'utensils',
    link,
    triggeredBy
  };

  console.log(`${logPrefix} notifyOrderStatusChanged`, {
    saleId: sale.id,
    saleNumber,
    recipients: recipients.length,
    oldStatus,
    newStatus,
    triggeredBy
  });

  return notifyUsers({
    tenantId,
    userIds: recipients,
    payload
  });
};

module.exports = {
  createNotification,
  notifyUsers,
  notifyJobAssigned,
  notifyJobStatusChanged,
  notifyLeadCreated,
  notifyLeadStatusChanged,
  notifyLeadActivityLogged,
  notifyInvoiceSent,
  notifyInvoicePaid,
  notifyNewOrder,
  notifyOnlineStoreOrderReceived,
  notifyOnlineStoreItemsUnavailable,
  notifyOrderStatusChanged
};


