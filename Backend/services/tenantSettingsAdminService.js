const { Setting, Tenant, TenantAccessAudit } = require('../models');
const { sanitizePayload } = require('../utils/tenantUtils');
const { normalizeTenantInstanceForRequest } = require('../utils/tenantClassification');
const {
  sanitizeHiddenSidebarKeys,
  getTenantDefaultHiddenSidebarKeys,
} = require('../services/sidebarPreferenceHelper');
const { JOB_INVOICE_DEFAULTS } = require('../services/jobCustomerTrackingService');
const {
  DEFAULT_RENTAL_SETTINGS,
  normalizeRentalSettings,
} = require('../services/rentalSettingsService');
const {
  invalidateCache,
  invalidateAuthBootstrapCache,
} = require('../middleware/cache');

const CUSTOMER_NOTIFICATION_DEFAULTS = {
  autoSendInvoiceToCustomer: true,
  autoSendReceiptToCustomer: false,
  sendPaymentReminderEmail: false,
  sendInvoicePaidConfirmationToCustomer: true,
  acceptOnlinePayments: false,
};

const INVOICE_ORGANIZATION_FIELDS = [
  'invoiceFooter',
  'paymentDetails',
  'paymentDetailsEnabled',
  'defaultPaymentTerms',
  'defaultTermsAndConditions',
];

const getSettingValue = async (tenantId, key, fallback = {}) => {
  const setting = await Setting.findOne({ where: { tenantId, key } });
  return setting ? setting.value : fallback;
};

const upsertSettingValue = async (tenantId, key, value, description = null) => {
  const [setting, created] = await Setting.findOrCreate({
    where: { tenantId, key },
    defaults: { tenantId, key, value, description },
  });

  if (!created) {
    setting.value = value;
    if (description !== null) {
      setting.description = description;
    }
    await setting.save();
  }

  invalidateTenantSettingsCache(tenantId);
  return setting.value;
};

const invalidateTenantSettingsCache = (tenantId) => {
  try {
    invalidateCache(tenantId, 'settings:*');
    invalidateAuthBootstrapCache({ tenantId });
  } catch (cacheErr) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[TenantSettingsAdmin] cache invalidation failed:', cacheErr?.message);
    }
  }
};

const pickInvoiceOrganizationFields = (organization = {}) => {
  const result = {};
  for (const field of INVOICE_ORGANIZATION_FIELDS) {
    if (field === 'paymentDetailsEnabled') {
      result[field] = organization[field] === true;
    } else {
      result[field] = organization[field] || '';
    }
  }
  return result;
};

const buildJobInvoicePayload = (value = {}) => ({
  autoSendInvoiceOnJobCreation: value.autoSendInvoiceOnJobCreation === true,
  customerJobTrackingEnabled: value.customerJobTrackingEnabled === true,
  emailCustomerJobTrackingOnJobCreation: value.emailCustomerJobTrackingOnJobCreation === true,
  smsCustomerJobTrackingOnJobCreation: value.smsCustomerJobTrackingOnJobCreation === true,
  // Hard-disabled legacy flag (product cost → COGS, not Expense).
  autoCreateExpenseFromProductCost: false,
});

const buildCustomerNotificationPayload = (value = {}) => ({
  autoSendInvoiceToCustomer: value.autoSendInvoiceToCustomer !== false,
  autoSendReceiptToCustomer: value.autoSendReceiptToCustomer === true,
  sendPaymentReminderEmail: value.sendPaymentReminderEmail === true,
  sendInvoicePaidConfirmationToCustomer: value.sendInvoicePaidConfirmationToCustomer !== false,
  acceptOnlinePayments: value.acceptOnlinePayments === true,
});

const buildRentalSettingsPayload = (value = {}) => normalizeRentalSettings({
  ...DEFAULT_RENTAL_SETTINGS,
  ...(value && typeof value === 'object' ? value : {}),
});

/**
 * Load tenant configuration settings that platform admins may edit on behalf of a tenant.
 * @param {string} tenantId
 */
const getTenantAdminSettings = async (tenantId) => {
  const tenantRow = await Tenant.findByPk(tenantId, {
    attributes: ['id', 'name', 'slug', 'businessType', 'metadata'],
  });
  if (!tenantRow) {
    return null;
  }

  const tenant = normalizeTenantInstanceForRequest(tenantRow);
  const [organizationSetting, jobInvoiceSetting, customerNotificationsSetting, rentalSetting] = await Promise.all([
    getSettingValue(tenantId, 'organization', {}),
    getSettingValue(tenantId, 'job-invoice', JOB_INVOICE_DEFAULTS),
    getSettingValue(tenantId, 'customer-notification-preferences', CUSTOMER_NOTIFICATION_DEFAULTS),
    getSettingValue(tenantId, 'rental_settings', DEFAULT_RENTAL_SETTINGS),
  ]);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      businessType: tenant.businessType,
    },
    organization: pickInvoiceOrganizationFields(organizationSetting),
    jobInvoice: buildJobInvoicePayload(jobInvoiceSetting),
    customerNotifications: buildCustomerNotificationPayload(customerNotificationsSetting),
    ...(tenant.businessType === 'rental' ? {
      rental: buildRentalSettingsPayload(rentalSetting),
    } : {}),
    sidebarDefaults: {
      hiddenSidebarKeys: getTenantDefaultHiddenSidebarKeys(
        tenant.metadata,
        tenant.businessType,
        tenant.metadata?.businessSubType ||
          tenant.metadata?.shopType ||
          tenant.metadata?.rentalType ||
          null
      ),
    },
  };
};

/**
 * Apply partial tenant settings updates from a platform admin.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.actorUserId
 * @param {object} params.payload
 * @param {string} [params.reason]
 */
const updateTenantAdminSettings = async ({ tenantId, actorUserId, payload, reason = '' }) => {
  const tenantRow = await Tenant.findByPk(tenantId);
  if (!tenantRow) {
    return null;
  }

  const before = await getTenantAdminSettings(tenantId);
  const incoming = sanitizePayload(payload || {});
  const auditSections = [];

  if (incoming.organization && typeof incoming.organization === 'object') {
    const existing = await getSettingValue(tenantId, 'organization', {});
    const orgPatch = sanitizePayload(incoming.organization);
    const merged = {
      ...existing,
      ...orgPatch,
    };
    for (const field of INVOICE_ORGANIZATION_FIELDS) {
      if (field === 'paymentDetailsEnabled') {
        merged[field] = orgPatch[field] === true;
      } else if (orgPatch[field] !== undefined) {
        merged[field] = orgPatch[field] || '';
      }
    }
    await upsertSettingValue(tenantId, 'organization', merged, 'Organization profile and invoice defaults');
    auditSections.push('organization');
  }

  if (incoming.jobInvoice && typeof incoming.jobInvoice === 'object') {
    const patch = sanitizePayload(incoming.jobInvoice);
    const existing = await getSettingValue(tenantId, 'job-invoice', JOB_INVOICE_DEFAULTS);
    const value = {
      ...existing,
      ...(typeof patch.autoSendInvoiceOnJobCreation === 'boolean' && {
        autoSendInvoiceOnJobCreation: patch.autoSendInvoiceOnJobCreation,
      }),
      ...(typeof patch.customerJobTrackingEnabled === 'boolean' && {
        customerJobTrackingEnabled: patch.customerJobTrackingEnabled,
      }),
      ...(typeof patch.emailCustomerJobTrackingOnJobCreation === 'boolean' && {
        emailCustomerJobTrackingOnJobCreation: patch.emailCustomerJobTrackingOnJobCreation,
      }),
      ...(typeof patch.smsCustomerJobTrackingOnJobCreation === 'boolean' && {
        smsCustomerJobTrackingOnJobCreation: patch.smsCustomerJobTrackingOnJobCreation,
      }),
      // Always clear legacy flag; product cost must not create Expense rows.
      autoCreateExpenseFromProductCost: false,
    };
    if (value.customerJobTrackingEnabled !== true) {
      value.emailCustomerJobTrackingOnJobCreation = false;
      value.smsCustomerJobTrackingOnJobCreation = false;
    }
    await upsertSettingValue(
      tenantId,
      'job-invoice',
      value,
      'Job invoices, customer tracking links, and related emails'
    );
    auditSections.push('jobInvoice');
  }

  if (incoming.customerNotifications && typeof incoming.customerNotifications === 'object') {
    const patch = sanitizePayload(incoming.customerNotifications);
    const existing = await getSettingValue(
      tenantId,
      'customer-notification-preferences',
      CUSTOMER_NOTIFICATION_DEFAULTS
    );
    const updated = {
      ...existing,
      ...(typeof patch.autoSendInvoiceToCustomer === 'boolean' && {
        autoSendInvoiceToCustomer: patch.autoSendInvoiceToCustomer,
      }),
      ...(typeof patch.autoSendReceiptToCustomer === 'boolean' && {
        autoSendReceiptToCustomer: patch.autoSendReceiptToCustomer,
      }),
      ...(typeof patch.sendPaymentReminderEmail === 'boolean' && {
        sendPaymentReminderEmail: patch.sendPaymentReminderEmail,
      }),
      ...(typeof patch.sendInvoicePaidConfirmationToCustomer === 'boolean' && {
        sendInvoicePaidConfirmationToCustomer: patch.sendInvoicePaidConfirmationToCustomer,
      }),
    };
    await upsertSettingValue(
      tenantId,
      'customer-notification-preferences',
      updated,
      'Customer notification preferences'
    );
    auditSections.push('customerNotifications');
  }

  if (incoming.rental && typeof incoming.rental === 'object' && tenantRow.businessType === 'rental') {
    const patch = sanitizePayload(incoming.rental);
    const existing = await getSettingValue(tenantId, 'rental_settings', DEFAULT_RENTAL_SETTINGS);
    const value = buildRentalSettingsPayload({
      ...existing,
      ...patch,
    });
    await upsertSettingValue(
      tenantId,
      'rental_settings',
      value,
      'Rental late fees, deposits, and booking defaults'
    );
    auditSections.push('rental');
  }

  if (incoming.sidebarDefaults && typeof incoming.sidebarDefaults === 'object') {
    const shopType =
      tenantRow.metadata?.businessSubType ||
      tenantRow.metadata?.shopType ||
      tenantRow.metadata?.rentalType ||
      null;
    const sanitized = sanitizeHiddenSidebarKeys(
      incoming.sidebarDefaults.hiddenSidebarKeys,
      tenantRow.businessType,
      shopType
    );
    const metadata =
      tenantRow.metadata && typeof tenantRow.metadata === 'object'
        ? { ...tenantRow.metadata }
        : {};
    metadata.defaultHiddenSidebarKeys = sanitized;
    tenantRow.metadata = metadata;
    await tenantRow.save();
    invalidateTenantSettingsCache(tenantId);
    auditSections.push('sidebarDefaults');
  }

  if (auditSections.length === 0) {
    const error = new Error('No valid settings provided');
    error.statusCode = 400;
    throw error;
  }

  const after = await getTenantAdminSettings(tenantId);

  await TenantAccessAudit.create({
    tenantId,
    actorUserId,
    action: 'tenant_settings_updated',
    before: {
      sections: auditSections,
      settings: before,
    },
    after: {
      sections: auditSections,
      settings: after,
    },
    reason: reason || `Platform admin updated: ${auditSections.join(', ')}`,
  });

  return after;
};

module.exports = {
  INVOICE_ORGANIZATION_FIELDS,
  getTenantAdminSettings,
  updateTenantAdminSettings,
};
