const { Notification, UserTenant } = require('../models');
const { Op } = require('sequelize');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { formatDecimal } = require('../utils/formatNumber');

const logPrefix = '[ActivityLogger]';

// ============================================
// ACTIVITY TYPE DEFINITIONS
// ============================================

const ACTIVITY_TYPES = {
  // JOB ACTIVITIES
  JOB_CREATED: 'job_created',
  JOB_UPDATED: 'job_updated',
  JOB_DELETED: 'job_deleted',
  JOB_ASSIGNED: 'job_assigned',
  JOB_STATUS_CHANGED: 'job_status_changed',
  JOB_COMPLETED: 'job_completed',
  
  // INVOICE ACTIVITIES
  INVOICE_CREATED: 'invoice_created',
  INVOICE_UPDATED: 'invoice_updated',
  INVOICE_DELETED: 'invoice_deleted',
  INVOICE_SENT: 'invoice_sent',
  INVOICE_PAID: 'invoice_paid',
  INVOICE_OVERDUE: 'invoice_overdue',
  INVOICE_CANCELLED: 'invoice_cancelled',
  
  // PAYMENT ACTIVITIES
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_REFUNDED: 'payment_refunded',
  
  // QUOTE ACTIVITIES
  QUOTE_CREATED: 'quote_created',
  QUOTE_UPDATED: 'quote_updated',
  QUOTE_SENT: 'quote_sent',
  QUOTE_ACCEPTED: 'quote_accepted',
  QUOTE_DECLINED: 'quote_declined',
  QUOTE_EXPIRED: 'quote_expired',
  
  // LEAD ACTIVITIES
  LEAD_CREATED: 'lead_created',
  LEAD_UPDATED: 'lead_updated',
  LEAD_ASSIGNED: 'lead_assigned',
  LEAD_STATUS_CHANGED: 'lead_status_changed',
  LEAD_CONVERTED: 'lead_converted',
  LEAD_ACTIVITY_LOGGED: 'lead_activity_logged',
  
  // CUSTOMER ACTIVITIES
  CUSTOMER_CREATED: 'customer_created',
  CUSTOMER_UPDATED: 'customer_updated',
  CUSTOMER_DELETED: 'customer_deleted',
  
  // VENDOR ACTIVITIES
  VENDOR_CREATED: 'vendor_created',
  VENDOR_UPDATED: 'vendor_updated',
  VENDOR_DELETED: 'vendor_deleted',
  
  // EXPENSE ACTIVITIES
  EXPENSE_CREATED: 'expense_created',
  EXPENSE_UPDATED: 'expense_updated',
  EXPENSE_SUBMITTED: 'expense_submitted',
  EXPENSE_APPROVED: 'expense_approved',
  EXPENSE_REJECTED: 'expense_rejected',
  
  // USER ACTIVITIES
  USER_INVITED: 'user_invited',
  USER_JOINED: 'user_joined',
  USER_ROLE_CHANGED: 'user_role_changed',
  
  // MATERIALS ACTIVITIES
  MATERIALS_LOW_STOCK: 'materials_low_stock',
  MATERIALS_OUT_OF_STOCK: 'materials_out_of_stock',
  
  // SYSTEM ACTIVITIES
  SYSTEM_BACKUP_COMPLETED: 'system_backup_completed',
  SYSTEM_ERROR: 'system_error'
};

// ============================================
// NOTIFICATION CHANNEL TYPES
// ============================================

const CHANNELS = {
  IN_APP: 'in_app',
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  WHATSAPP: 'whatsapp'
};

// ============================================
// RECIPIENT STRATEGIES
// ============================================

const RECIPIENT_STRATEGY = {
  ASSIGNED_USER: 'assigned_user',           // Only assigned user
  JOB_TEAM: 'job_team',                     // Job creator + assigned user
  LEAD_TEAM: 'lead_team',                   // Lead assignee
  ALL_MANAGERS: 'all_managers',             // All managers in tenant
  ALL_ADMINS: 'all_admins',                 // All admins in tenant
  MANAGERS_AND_ADMINS: 'managers_and_admins', // All managers and admins
  EVERYONE: 'everyone',                     // All users in tenant
  CUSTOM: 'custom'                          // Custom user list
};

// ============================================
// ACTIVITY CONFIGURATION
// ============================================

const ACTIVITY_CONFIG = {
  // JOB ACTIVITIES
  [ACTIVITY_TYPES.JOB_CREATED]: {
    recipientStrategy: RECIPIENT_STRATEGY.JOB_TEAM,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'normal',
    type: 'job',
    icon: 'file-text'
  },
  [ACTIVITY_TYPES.JOB_ASSIGNED]: {
    recipientStrategy: RECIPIENT_STRATEGY.ASSIGNED_USER,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'job',
    icon: 'team'
  },
  [ACTIVITY_TYPES.JOB_STATUS_CHANGED]: {
    recipientStrategy: RECIPIENT_STRATEGY.JOB_TEAM,
    channels: [CHANNELS.IN_APP],
    priority: 'normal',
    type: 'job',
    icon: 'swap'
  },
  [ACTIVITY_TYPES.JOB_COMPLETED]: {
    recipientStrategy: RECIPIENT_STRATEGY.JOB_TEAM,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'job',
    icon: 'check-circle'
  },
  
  // INVOICE ACTIVITIES
  [ACTIVITY_TYPES.INVOICE_CREATED]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP],
    priority: 'normal',
    type: 'invoice',
    icon: 'file-add'
  },
  [ACTIVITY_TYPES.INVOICE_SENT]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'normal',
    type: 'invoice',
    icon: 'mail'
  },
  [ACTIVITY_TYPES.INVOICE_PAID]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'payment',
    icon: 'dollar'
  },
  [ACTIVITY_TYPES.INVOICE_OVERDUE]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'alert',
    icon: 'warning'
  },
  
  // PAYMENT ACTIVITIES
  [ACTIVITY_TYPES.PAYMENT_RECEIVED]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'payment',
    icon: 'dollar'
  },
  
  // QUOTE ACTIVITIES
  [ACTIVITY_TYPES.QUOTE_CREATED]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP],
    priority: 'normal',
    type: 'quote',
    icon: 'file-text'
  },
  [ACTIVITY_TYPES.QUOTE_ACCEPTED]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'quote',
    icon: 'check-circle'
  },
  
  // LEAD ACTIVITIES
  [ACTIVITY_TYPES.LEAD_CREATED]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP],
    priority: 'normal',
    type: 'lead',
    icon: 'user-add'
  },
  [ACTIVITY_TYPES.LEAD_ASSIGNED]: {
    recipientStrategy: RECIPIENT_STRATEGY.ASSIGNED_USER,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'lead',
    icon: 'user'
  },
  [ACTIVITY_TYPES.LEAD_CONVERTED]: {
    recipientStrategy: RECIPIENT_STRATEGY.LEAD_TEAM,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'lead',
    icon: 'check-circle'
  },
  [ACTIVITY_TYPES.LEAD_ACTIVITY_LOGGED]: {
    recipientStrategy: RECIPIENT_STRATEGY.LEAD_TEAM,
    channels: [CHANNELS.IN_APP],
    priority: 'normal',
    type: 'lead',
    icon: 'message'
  },
  
  // EXPENSE ACTIVITIES
  [ACTIVITY_TYPES.EXPENSE_SUBMITTED]: {
    recipientStrategy: RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'normal',
    type: 'expense',
    icon: 'file-text'
  },
  [ACTIVITY_TYPES.EXPENSE_APPROVED]: {
    recipientStrategy: RECIPIENT_STRATEGY.CUSTOM,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'normal',
    type: 'expense',
    icon: 'check-circle'
  },
  [ACTIVITY_TYPES.EXPENSE_REJECTED]: {
    recipientStrategy: RECIPIENT_STRATEGY.CUSTOM,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'normal',
    type: 'expense',
    icon: 'close-circle'
  },
  
  // USER ACTIVITIES
  [ACTIVITY_TYPES.USER_INVITED]: {
    recipientStrategy: RECIPIENT_STRATEGY.CUSTOM,
    channels: [CHANNELS.EMAIL],
    priority: 'high',
    type: 'user',
    icon: 'user-add'
  },
  
  // MATERIALS ACTIVITIES
  [ACTIVITY_TYPES.MATERIALS_LOW_STOCK]: {
    recipientStrategy: RECIPIENT_STRATEGY.EVERYONE,
    channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],
    priority: 'high',
    type: 'alert',
    icon: 'warning'
  }
};

// ============================================
// RECIPIENT RESOLVERS
// ============================================

const resolveRecipients = async (strategy, context, tenantId) => {
  const recipientSet = new Set();
  
  try {
    switch (strategy) {
      case RECIPIENT_STRATEGY.ASSIGNED_USER:
        if (context.assignedTo) recipientSet.add(context.assignedTo);
        break;
        
      case RECIPIENT_STRATEGY.JOB_TEAM:
        if (context.createdBy) recipientSet.add(context.createdBy);
        if (context.assignedTo) recipientSet.add(context.assignedTo);
        break;
        
      case RECIPIENT_STRATEGY.LEAD_TEAM:
        if (context.assignedTo) recipientSet.add(context.assignedTo);
        if (context.createdBy) recipientSet.add(context.createdBy);
        break;
        
      case RECIPIENT_STRATEGY.ALL_MANAGERS:
        const managers = await UserTenant.findAll({
          where: { tenantId, role: { [Op.in]: ['owner', 'manager'] } },
          attributes: ['userId']
        });
        managers.forEach(ut => recipientSet.add(ut.userId));
        break;
        
      case RECIPIENT_STRATEGY.ALL_ADMINS:
        const admins = await UserTenant.findAll({
          where: { tenantId, role: { [Op.in]: ['owner', 'admin'] } },
          attributes: ['userId']
        });
        admins.forEach(ut => recipientSet.add(ut.userId));
        break;
        
      case RECIPIENT_STRATEGY.MANAGERS_AND_ADMINS:
        const managersAndAdmins = await UserTenant.findAll({
          where: {
            tenantId,
            role: { [Op.in]: ['owner', 'admin', 'manager'] }
          },
          attributes: ['userId']
        });
        managersAndAdmins.forEach(ut => recipientSet.add(ut.userId));
        
        // Also add job/lead team if available
        if (context.createdBy) recipientSet.add(context.createdBy);
        if (context.assignedTo) recipientSet.add(context.assignedTo);
        break;
        
      case RECIPIENT_STRATEGY.EVERYONE:
        const allUsers = await UserTenant.findAll({
          where: { tenantId },
          attributes: ['userId']
        });
        allUsers.forEach(ut => recipientSet.add(ut.userId));
        break;
        
      case RECIPIENT_STRATEGY.CUSTOM:
        if (context.recipients && Array.isArray(context.recipients)) {
          context.recipients.forEach(userId => recipientSet.add(userId));
        }
        break;
        
      default:
        console.warn(`${logPrefix} Unknown recipient strategy: ${strategy}`);
    }
  } catch (error) {
    console.error(`${logPrefix} Error resolving recipients:`, error.message);
  }
  
  return Array.from(recipientSet).filter(Boolean);
};

// ============================================
// MAIN ACTIVITY LOGGER
// ============================================

const logActivity = async ({
  activityType,
  tenantId,
  title,
  message,
  context = {},
  triggeredBy = null,
  customRecipients = null,
  customChannels = null,
  customPriority = null,
  link = null
}) => {
  try {
    console.log(`${logPrefix} Activity logged: ${activityType}`, {
      tenantId,
      title,
      triggeredBy,
      contextKeys: Object.keys(context)
    });

    if (!tenantId) {
      console.warn(`${logPrefix} Missing tenantId for activity ${activityType}`);
      return { success: false, notifications: [] };
    }

    // Get configuration for this activity type
    const config = ACTIVITY_CONFIG[activityType];
    if (!config) {
      console.warn(`${logPrefix} No configuration found for activity type: ${activityType}`);
      return { success: false, notifications: [] };
    }

    // Determine recipients
    let recipients = [];
    if (customRecipients && Array.isArray(customRecipients)) {
      recipients = customRecipients;
      console.log(`${logPrefix} Using custom recipients`, { count: recipients.length });
    } else {
      recipients = await resolveRecipients(config.recipientStrategy, context, tenantId);
      console.log(`${logPrefix} Resolved recipients using strategy: ${config.recipientStrategy}`, {
        count: recipients.length,
        recipients: recipients
      });
    }

    if (recipients.length === 0) {
      console.warn(`${logPrefix} No recipients for activity ${activityType}`, {
        strategy: config.recipientStrategy,
        context: context
      });
      return { success: false, notifications: [] };
    }

    const {
      getPreferencesForUsers,
      isNotificationChannelEnabled
    } = require('./notificationPreferenceHelper');
    const prefsMap = await getPreferencesForUsers(recipients);
    const preferenceCategory = config.type;

    // Determine channels (use custom or config default)
    const channels = customChannels || config.channels;
    
    // Determine priority (use custom or config default)
    const priority = customPriority || config.priority;

    // Create notifications for in-app channel
    const notifications = [];
    if (channels.includes(CHANNELS.IN_APP)) {
      const inAppRecipients = recipients.filter((userId) =>
        isNotificationChannelEnabled(prefsMap.get(userId), preferenceCategory, 'in_app')
      );
      const inAppNotifications = inAppRecipients.map(userId => ({
        tenantId,
        userId,
        title,
        message,
        type: config.type,
        priority,
        metadata: context,
        channels: ['in_app'],
        icon: config.icon,
        link: link || context.link || null,
        triggeredBy
      }));

      if (inAppNotifications.length > 0) {
        const created = await Notification.bulkCreate(inAppNotifications);
        notifications.push(...created);

        try {
          const { emitNotification } = require('./websocketService');
          for (const n of created) {
            emitNotification(tenantId, n.userId, {
              id: n.id,
              title: n.title,
              message: n.message,
              type: n.type,
              link: n.link,
              createdAt: n.createdAt
            });
          }
        } catch (wsErr) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`${logPrefix} WebSocket emit failed:`, wsErr?.message);
          }
        }

        console.log(`${logPrefix} Created ${created.length} in-app notifications for ${activityType}`);
      } else {
        console.log(`${logPrefix} Skipped in-app notifications (no recipients after preference filter)`, {
          activityType
        });
      }
    }

    // Implement EMAIL channel
    if (channels.includes(CHANNELS.EMAIL)) {
      try {
        const emailService = require('./emailService');
        const emailTemplates = require('./emailTemplates');
        const { User, Tenant } = require('../models');
        
        // Get tenant info for email template
        const tenant = await Tenant.findByPk(tenantId);
        const company = {
          name: tenant?.name || 'African Business Suite',
          logo: getTenantLogoUrl(tenant),
          primaryColor: tenant?.metadata?.primaryColor || '#166534'
        };
        
        // Get user email addresses for recipients
        const users = await User.findAll({
          where: { id: recipients },
          attributes: ['id', 'email', 'name']
        });
        
        console.log(`${logPrefix} Sending EMAIL notifications for ${activityType}`, {
          recipients: users.length,
          subject: title
        });
        
        for (const user of users) {
          if (user.email) {
            if (!isNotificationChannelEnabled(prefsMap.get(user.id), preferenceCategory, 'email')) {
              continue;
            }
            try {
              const htmlContent = emailTemplates.activityNotificationCard({
                title,
                message,
                link: link || null,
                company: {
                  name: company.name,
                  primaryColor: company.primaryColor,
                  logoUrl: company.logo
                }
              });

              await emailService.sendMessage(
                tenantId,
                user.email,
                title,
                htmlContent,
                message
              );
              
              console.log(`${logPrefix} Email sent to ${user.email.substring(0, 5)}***`);
            } catch (emailError) {
              console.error(`${logPrefix} Failed to send email to user ${user.id}:`, emailError.message);
              // Continue sending to other users even if one fails
            }
          }
        }
      } catch (error) {
        console.error(`${logPrefix} EMAIL notification error for ${activityType}:`, error.message);
        // Don't fail the whole activity if email fails
      }
    }

    // Implement SMS channel
    if (channels.includes(CHANNELS.SMS)) {
      try {
        const smsService = require('./smsService');
        const { User } = require('../models');
        
        // Get user phone numbers for recipients
        const users = await User.findAll({
          where: { id: recipients },
          attributes: ['id', 'name'],
          include: [{
            model: UserTenant,
            as: 'tenantMemberships',
            where: { tenantId },
            attributes: ['role']
          }]
        });
        
        // Get phone numbers from context or user settings
        // For now, we'll check if phoneNumbers are provided in context
        const phoneNumbers = context.phoneNumbers || [];
        
        console.log(`${logPrefix} Sending SMS notifications for ${activityType}`, {
          phoneNumbers: phoneNumbers.length,
          message: message.substring(0, 50) + '...'
        });
        
        // SMS message (limited to 160 characters)
        const smsMessage = `${title}\n${message}`.substring(0, 160);
        
        for (const phoneNumber of phoneNumbers) {
          if (phoneNumber) {
            try {
              const result = await smsService.sendMessage(tenantId, phoneNumber, smsMessage);
              if (result.success) {
                console.log(`${logPrefix} SMS sent to ${phoneNumber.substring(0, 7)}***`);
              } else {
                console.log(`${logPrefix} SMS send failed: ${result.error}`);
              }
            } catch (smsError) {
              console.error(`${logPrefix} Failed to send SMS:`, smsError.message);
              // Continue sending to other numbers even if one fails
            }
          }
        }
      } catch (error) {
        console.error(`${logPrefix} SMS notification error for ${activityType}:`, error.message);
        // Don't fail the whole activity if SMS fails
      }
    }

    // Implement WHATSAPP channel
    if (channels.includes(CHANNELS.WHATSAPP)) {
      try {
        const whatsappService = require('./whatsappService');
        const { Customer } = require('../models');
        
        // Get phone numbers for recipients (if they are customer IDs)
        // For now, we'll send to phone numbers provided in context
        if (context.phoneNumbers && Array.isArray(context.phoneNumbers)) {
          for (const phoneNumber of context.phoneNumbers) {
            if (phoneNumber) {
              await whatsappService.sendTextMessage(tenantId, phoneNumber, `${title}\n\n${message}`)
                .catch(error => {
                  console.error(`${logPrefix} WhatsApp send failed:`, error);
                });
            }
          }
        } else if (context.customerId) {
          // Try to get customer phone number
          const customer = await Customer.findOne({
            where: { id: context.customerId, tenantId }
          });
          if (customer && customer.phone) {
            await whatsappService.sendTextMessage(tenantId, customer.phone, `${title}\n\n${message}`)
              .catch(error => {
                console.error(`${logPrefix} WhatsApp send failed:`, error);
              });
          }
        }
      } catch (error) {
        console.error(`${logPrefix} WhatsApp notification error:`, error.message);
      }
    }

    if (channels.includes(CHANNELS.PUSH)) {
      try {
        const { dispatchExpoPushToUsers } = require('./pushNotificationService');
        const result = await dispatchExpoPushToUsers({
          tenantId,
          userIds: recipients,
          title,
          message,
          type: preferenceCategory,
          priority: priority === 'high' ? 'high' : 'normal',
          metadata: context
        });
        if (result.attempted > 0) {
          console.log(`${logPrefix} PUSH notification sent for ${activityType}`, {
            attempted: result.attempted,
            sent: result.sent,
            invalidTokens: result.invalidTokens
          });
        }
      } catch (error) {
        console.error(`${logPrefix} PUSH notification error:`, error.message);
      }
    }

    console.log(`${logPrefix} Activity ${activityType} processed successfully`, {
      recipientCount: recipients.length,
      notificationCount: notifications.length,
      channels: channels
    });

    return {
      success: true,
      notifications,
      recipients,
      channels
    };

  } catch (error) {
    console.error(`${logPrefix} Error logging activity ${activityType}:`, error);
    return { success: false, error: error.message, notifications: [] };
  }
};

// ============================================
// CONVENIENCE METHODS FOR SPECIFIC ACTIVITIES
// ============================================

// JOB ACTIVITIES
const logJobCreated = async (job, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.JOB_CREATED,
    tenantId: job.tenantId,
    title: 'New Job Created',
    message: `Job ${job.jobNumber} has been created${job.title ? ` - ${job.title}` : ''}.`,
    context: {
      jobId: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      assignedTo: job.assignedTo,
      createdBy: job.createdBy
    },
    triggeredBy,
    link: `/jobs/${job.id}`
  });
};

const logJobAssigned = async (job, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.JOB_ASSIGNED,
    tenantId: job.tenantId,
    title: 'New Job Assigned',
    message: `You have been assigned to ${job.jobNumber}${job.title ? ` • ${job.title}` : ''}.`,
    context: {
      jobId: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      assignedTo: job.assignedTo,
      createdBy: job.createdBy
    },
    triggeredBy,
    link: `/jobs/${job.id}`
  });
};

const logJobStatusChanged = async (job, oldStatus, newStatus, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.JOB_STATUS_CHANGED,
    tenantId: job.tenantId,
    title: 'Job Status Updated',
    message: `${job.jobNumber}${job.title ? ` • ${job.title}` : ''} moved from ${oldStatus?.replace('_', ' ')} to ${newStatus.replace('_', ' ')}.`,
    context: {
      jobId: job.id,
      jobNumber: job.jobNumber,
      oldStatus,
      newStatus,
      createdBy: job.createdBy,
      assignedTo: job.assignedTo
    },
    triggeredBy,
    link: `/jobs/${job.id}`
  });
};

const logJobCompleted = async (job, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.JOB_COMPLETED,
    tenantId: job.tenantId,
    title: 'Job Completed',
    message: `Job ${job.jobNumber}${job.title ? ` • ${job.title}` : ''} has been completed.`,
    context: {
      jobId: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      createdBy: job.createdBy,
      assignedTo: job.assignedTo
    },
    triggeredBy,
    link: `/jobs/${job.id}`
  });
};

// INVOICE ACTIVITIES
const logInvoiceSent = async (invoice, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.INVOICE_SENT,
    tenantId: invoice.tenantId,
    title: 'Invoice Sent',
    message: `Invoice ${invoice.invoiceNumber} for ${invoice.customer?.company || invoice.customer?.name || 'customer'} has been sent (GHS ${formatDecimal(invoice.totalAmount)}).`,
    context: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      jobId: invoice.jobId,
      totalAmount: invoice.totalAmount,
      createdBy: invoice.job?.createdBy,
      assignedTo: invoice.job?.assignedTo
    },
    triggeredBy,
    link: `/invoices`
  });
};

const logInvoicePaid = async (invoice, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.INVOICE_PAID,
    tenantId: invoice.tenantId,
    title: 'Payment Received',
    message: `Invoice ${invoice.invoiceNumber} for ${invoice.customer?.company || invoice.customer?.name || 'customer'} has been paid (GHS ${formatDecimal(invoice.amountPaid)}).`,
    context: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      jobId: invoice.jobId,
      amountPaid: invoice.amountPaid,
      totalAmount: invoice.totalAmount,
      createdBy: invoice.job?.createdBy,
      assignedTo: invoice.job?.assignedTo
    },
    triggeredBy,
    link: `/invoices`
  });
};

const logPaymentReceived = async (invoice, amount, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.PAYMENT_RECEIVED,
    tenantId: invoice.tenantId,
    title: 'Payment Received',
    message: `Payment of GHS ${formatDecimal(amount)} received for Invoice ${invoice.invoiceNumber}.`,
    context: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      amount: amount,
      createdBy: invoice.job?.createdBy,
      assignedTo: invoice.job?.assignedTo
    },
    triggeredBy,
    link: `/invoices`
  });
};

const logInvoiceOverdue = async (invoice, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.INVOICE_OVERDUE,
    tenantId: invoice.tenantId,
    title: 'Invoice Overdue',
    message: `Invoice ${invoice.invoiceNumber} for ${invoice.customer?.company || invoice.customer?.name || 'customer'} is overdue (balance: GHS ${formatDecimal(invoice.balance || invoice.totalAmount || 0)}).`,
    context: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      balance: invoice.balance,
      totalAmount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      createdBy: invoice.job?.createdBy,
      assignedTo: invoice.job?.assignedTo
    },
    triggeredBy,
    link: `/invoices`
  });
};

// QUOTE ACTIVITIES
const logQuoteAccepted = async (quote, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.QUOTE_ACCEPTED,
    tenantId: quote.tenantId,
    title: 'Quote Accepted',
    message: `Quote ${quote.quoteNumber} for ${quote.customer?.company || quote.customer?.name || 'customer'} has been accepted!`,
    context: {
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      customerId: quote.customerId,
      totalAmount: quote.totalAmount,
      createdBy: quote.createdBy
    },
    triggeredBy,
    link: `/quotes`
  });
};

// LEAD ACTIVITIES
const logLeadCreated = async (lead, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.LEAD_CREATED,
    tenantId: lead.tenantId,
    title: 'New Lead',
    message: `New lead from ${lead.name}${lead.company ? ` (${lead.company})` : ''} has been created.`,
    context: {
      leadId: lead.id,
      leadName: lead.name,
      company: lead.company,
      source: lead.source,
      assignedTo: lead.assignedTo
    },
    triggeredBy,
    link: `/leads`
  });
};

const logLeadAssigned = async (lead, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.LEAD_ASSIGNED,
    tenantId: lead.tenantId,
    title: 'New Lead Assigned',
    message: `You have been assigned lead: ${lead.name}${lead.company ? ` from ${lead.company}` : ''}.`,
    context: {
      leadId: lead.id,
      leadName: lead.name,
      company: lead.company,
      source: lead.source,
      assignedTo: lead.assignedTo
    },
    triggeredBy,
    link: `/leads`
  });
};

const logLeadStatusChanged = async (lead, oldStatus, newStatus, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.LEAD_STATUS_CHANGED,
    tenantId: lead.tenantId,
    title: 'Lead Status Updated',
    message: `Lead ${lead.name} moved from ${oldStatus} to ${newStatus}.`,
    context: {
      leadId: lead.id,
      leadName: lead.name,
      oldStatus,
      newStatus,
      assignedTo: lead.assignedTo
    },
    triggeredBy,
    link: `/leads`
  });
};

const logLeadActivityLogged = async (lead, activity, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.LEAD_ACTIVITY_LOGGED,
    tenantId: lead.tenantId,
    title: 'Lead Activity',
    message: `New ${activity.type} logged for lead ${lead.name}: "${activity.notes?.substring(0, 100)}..."`,
    context: {
      leadId: lead.id,
      leadName: lead.name,
      activityId: activity.id,
      activityType: activity.type,
      assignedTo: lead.assignedTo
    },
    triggeredBy,
    link: `/leads`
  });
};

const logLeadConverted = async (lead, customer, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.LEAD_CONVERTED,
    tenantId: lead.tenantId,
    title: 'Lead Converted',
    message: `Lead ${lead.name} has been converted to customer!`,
    context: {
      leadId: lead.id,
      leadName: lead.name,
      customerId: customer?.id,
      assignedTo: lead.assignedTo
    },
    triggeredBy,
    link: `/customers/${customer?.id || ''}`
  });
};

// EXPENSE ACTIVITIES
const logExpenseSubmitted = async (expense, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.EXPENSE_SUBMITTED,
    tenantId: expense.tenantId,
    title: 'Expense Approval Needed',
    message: `Expense request ${expense.expenseNumber} for GHS ${formatDecimal(expense.amount)} needs approval.`,
    context: {
      expenseId: expense.id,
      expenseNumber: expense.expenseNumber,
      amount: expense.amount,
      category: expense.category,
      submittedBy: expense.submittedBy
    },
    triggeredBy,
    link: `/expenses`
  });
};

const logExpenseApproved = async (expense, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.EXPENSE_APPROVED,
    tenantId: expense.tenantId,
    title: 'Expense Approved',
    message: `Your expense request ${expense.expenseNumber} for GHS ${formatDecimal(expense.amount)} has been approved.`,
    context: {
      expenseId: expense.id,
      expenseNumber: expense.expenseNumber,
      amount: expense.amount,
      category: expense.category,
      recipients: [expense.submittedBy]
    },
    triggeredBy,
    link: `/expenses`
  });
};

const logExpenseRejected = async (expense, reason, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.EXPENSE_REJECTED,
    tenantId: expense.tenantId,
    title: 'Expense Rejected',
    message: `Your expense request ${expense.expenseNumber} has been rejected. Reason: ${reason}`,
    context: {
      expenseId: expense.id,
      expenseNumber: expense.expenseNumber,
      amount: expense.amount,
      category: expense.category,
      rejectionReason: reason,
      recipients: [expense.submittedBy]
    },
    triggeredBy,
    link: `/expenses`
  });
};

// USER ACTIVITIES
const logUserInvited = async (invite, inviterUserId = null) => {
  const recipients = inviterUserId ? [inviterUserId] : [];
  return logActivity({
    activityType: ACTIVITY_TYPES.USER_INVITED,
    tenantId: invite.tenantId,
    title: 'User Invited',
    message: `A new team member has been invited: ${invite.email} (${invite.role || 'member'}).`,
    context: {
      inviteId: invite.id,
      email: invite.email,
      role: invite.role,
      name: invite.name
    },
    customRecipients: recipients,
    triggeredBy: inviterUserId,
    link: '/settings'
  });
};

// CUSTOMER ACTIVITIES
const logCustomerCreated = async (customer, triggeredBy = null) => {
  return logActivity({
    activityType: ACTIVITY_TYPES.CUSTOMER_CREATED,
    tenantId: customer.tenantId,
    title: 'New Customer Added',
    message: `Customer ${customer.name}${customer.company ? ` (${customer.company})` : ''} has been added.`,
    context: {
      customerId: customer.id,
      customerName: customer.name,
      company: customer.company
    },
    triggeredBy,
    link: `/customers`,
    customChannels: [CHANNELS.IN_APP] // Only in-app for customer creation
  });
};

// MATERIALS ACTIVITIES
const logLowStock = async (item, tenantId, triggeredBy = null) => {
  const qty = item.currentStock ?? item.quantityOnHand;
  const result = await logActivity({
    activityType: ACTIVITY_TYPES.MATERIALS_LOW_STOCK,
    tenantId,
    title: 'Low Stock Alert',
    message: `${item.name} is running low on stock (${qty} remaining).`,
    context: {
      itemId: item.id,
      itemName: item.name,
      currentStock: qty,
      reorderLevel: item.reorderLevel
    },
    triggeredBy,
    link: `/materials`
  });
  try {
    const taskAutomationService = require('./taskAutomationService');
    await taskAutomationService.createLowStockTask({
      item: {
        id: item.id,
        name: item.name,
        quantityOnHand: qty,
        reorderLevel: item.reorderLevel
      },
      tenantId,
      triggeredBy
    });
  } catch (automationError) {
    console.error('[ActivityLogger] Failed to auto-create low-stock task:', automationError?.message);
  }
  return result;
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Main function
  logActivity,
  
  // Constants
  ACTIVITY_TYPES,
  CHANNELS,
  RECIPIENT_STRATEGY,
  
  // Convenience methods for specific activities
  // Jobs
  logJobCreated,
  logJobAssigned,
  logJobStatusChanged,
  logJobCompleted,
  
  // Invoices & Payments
  logInvoiceSent,
  logInvoicePaid,
  logPaymentReceived,
  logInvoiceOverdue,
  
  // Quotes
  logQuoteAccepted,
  
  // Leads
  logLeadCreated,
  logLeadAssigned,
  logLeadStatusChanged,
  logLeadActivityLogged,
  logLeadConverted,
  
  // Expenses
  logExpenseSubmitted,
  logExpenseApproved,
  logExpenseRejected,
  
  // Users
  logUserInvited,
  
  // Customers
  logCustomerCreated,
  
  // Materials
  logLowStock
};

