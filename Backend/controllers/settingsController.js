const path = require('path');
const fs = require('fs');
const { Setting, User, Tenant, UserTenant, TenantAccessAudit } = require('../models');

/** Align with admin / billing plan ids (trial, starter, professional, enterprise). */
const SUBSCRIPTION_PLAN_ALIASES = {
  free: 'trial',
  standard: 'starter',
  pro: 'professional',
  launch: 'starter',
  scale: 'professional',
};
const normalizeSubscriptionPlanId = (plan = '') =>
  SUBSCRIPTION_PLAN_ALIASES[String(plan).trim().toLowerCase()] || String(plan).trim().toLowerCase();
const { baseUploadDir } = require('../middleware/upload');
const { seedDefaultCategories } = require('../utils/categorySeeder');
const { sanitizePayload } = require('../utils/tenantUtils');
const {
  normalizeTaxConfig,
  validateMergedTaxPayload,
  warmTaxConfigCache
} = require('../utils/taxConfig');
const { normalizeTaskAutomation } = require('../utils/taskAutomationConfig');
const { getCustomerSourceOptions } = require('../config/customerSourceOptions');
const { getLeadSourceOptions } = require('../config/leadSourceOptions');
const { notifyDataDeletionRequested } = require('../services/platformAdminNotificationService');
const {
  DEFAULT_SHOP_TYPE,
  normalizeTenantClassification,
  normalizeTenantInstanceForRequest,
} = require('../utils/tenantClassification');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const {
  getCacheValue,
  setCacheValue,
  getOrganizationSettingsCacheKey,
  getNotificationChannelsCacheKey,
  invalidateAuthBootstrapCache,
  invalidateCache,
  invalidateTenantMembershipCache,
} = require('../middleware/cache');

/** In-memory cache for payment integration OTP (best-effort); source of truth is DB for serverless safety. */
const paymentOtpStore = new Map();
const paymentOtpSettingKey = (userId) => `payment_collection_otp_user_${userId}`;
const PAYMENT_OTP_TTL_MS = 10 * 60 * 1000;
const PAYMENT_OTP_VERIFIED_TTL_MS = 15 * 60 * 1000;
const findPaymentVerificationUser = (userId) => User.unscoped().findByPk(userId);

const setStoredPaymentOtp = async ({ tenantId, userId, otp, expiresAt }) => {
  const payload = {
    otp: String(otp || ''),
    expiresAt: Number(expiresAt) || Date.now(),
    updatedAt: new Date().toISOString(),
  };
  paymentOtpStore.set(userId, payload);
  await upsertSettingValue(tenantId, paymentOtpSettingKey(userId), payload, 'Payment collection OTP gate');
};

/** After verify-otp succeeds, allow save without resending the code until verifiedUntil. */
const markPaymentOtpVerified = async ({ tenantId, userId }) => {
  const stored = await getStoredPaymentOtp({ tenantId, userId });
  if (!stored || typeof stored.otp !== 'string') {
    return;
  }
  const payload = {
    ...stored,
    verifiedAt: Date.now(),
    verifiedUntil: Date.now() + PAYMENT_OTP_VERIFIED_TTL_MS,
    updatedAt: new Date().toISOString(),
  };
  paymentOtpStore.set(userId, payload);
  await upsertSettingValue(tenantId, paymentOtpSettingKey(userId), payload, 'Payment collection OTP gate');
};

const isPaymentOtpRecentlyVerified = (stored) =>
  Boolean(
    stored &&
      typeof stored.verifiedAt === 'number' &&
      typeof stored.verifiedUntil === 'number' &&
      Date.now() <= stored.verifiedUntil
  );

const getStoredPaymentOtp = async ({ tenantId, userId }) => {
  const cached = paymentOtpStore.get(userId);
  if (cached && typeof cached.otp === 'string') {
    return cached;
  }
  const stored = await getSettingValue(tenantId, paymentOtpSettingKey(userId), null);
  if (stored && typeof stored === 'object' && typeof stored.otp === 'string') {
    paymentOtpStore.set(userId, stored);
    return stored;
  }
  return null;
};

const clearStoredPaymentOtp = async ({ tenantId, userId }) => {
  paymentOtpStore.delete(userId);
  const setting = await Setting.findOne({
    where: {
      tenantId,
      key: paymentOtpSettingKey(userId),
    },
  });
  if (setting) {
    await setting.destroy();
  }
};

/**
 * Shared OTP + password check for payment-related settings (MoMo API, Paystack settlement).
 * Does not consume OTP unless caller clears it after success.
 * @returns {Promise<{ ok: true, user: import('../models').User } | { ok: false, status: number, message: string }>}
 */
async function verifyStoredPaymentOtp(req) {
  const { password, otp } = req.body || {};
  const user = await findPaymentVerificationUser(req.user.id);
  if (!user) {
    return { ok: false, status: 404, message: 'User not found' };
  }
  const isGoogleUser = Boolean(user.googleId);
  if (!isGoogleUser) {
    if (!password || typeof password !== 'string') {
      return { ok: false, status: 400, message: 'Password is required to update payment settings' };
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      return { ok: false, status: 401, message: 'Invalid password' };
    }
  }

  const stored = await getStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
  const receivedOtp =
    otp && typeof otp === 'string' ? String(otp).replace(/\D/g, '').slice(0, 6) : '';

  // Google users: verify-otp already confirmed identity; save may omit OTP within verified TTL.
  if (isGoogleUser && receivedOtp.length !== 6 && isPaymentOtpRecentlyVerified(stored)) {
    return { ok: true, user };
  }

  if (!otp || typeof otp !== 'string' || receivedOtp.length !== 6) {
    return { ok: false, status: 400, message: 'Verification code (OTP) is required' };
  }
  if (!stored || typeof stored.otp !== 'string') {
    return { ok: false, status: 400, message: 'Verification code expired or not requested. Please request a new code.' };
  }
  if (Date.now() > stored.expiresAt && !isPaymentOtpRecentlyVerified(stored)) {
    await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
    return { ok: false, status: 400, message: 'Verification code expired. Request a new code.' };
  }
  const expectedOtp = String(stored.otp).replace(/\D/g, '').slice(0, 6);
  if (expectedOtp.length !== 6 || receivedOtp !== expectedOtp) {
    return { ok: false, status: 400, message: 'Invalid verification code' };
  }
  return { ok: true, user };
}

const normalizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  return phone.replace(/\s+/g, '').trim();
};

const getSettingValue = async (tenantId, key, fallback = {}) => {
  const setting = await Setting.findOne({ where: { tenantId, key } });
  return setting ? setting.value : fallback;
};

const invalidateTenantSettingsCache = (tenantId) => {
  try {
    invalidateCache(tenantId, 'settings:*');
    invalidateAuthBootstrapCache({ tenantId });
  } catch (cacheErr) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Settings] cache invalidation failed:', cacheErr?.message);
    }
  }
};

const buildOrganizationPayload = (organizationSettings = {}, tenant = null) => {
  const tenantMetadata = tenant?.metadata || {};
  return {
    name: (organizationSettings.name !== undefined && organizationSettings.name !== null)
      ? organizationSettings.name
      : (tenant?.name || ''),
    legalName: organizationSettings.legalName || '',
    email: (organizationSettings.email !== undefined && organizationSettings.email !== null)
      ? organizationSettings.email
      : (tenantMetadata.email || ''),
    phone: (organizationSettings.phone !== undefined && organizationSettings.phone !== null)
      ? organizationSettings.phone
      : (tenantMetadata.phone || ''),
    website: (organizationSettings.website !== undefined && organizationSettings.website !== null)
      ? organizationSettings.website
      : (tenantMetadata.website || ''),
    logoUrl: organizationSettings.logoUrl || tenantMetadata.logo || '',
    invoiceFooter: organizationSettings.invoiceFooter || '',
    paymentDetails: organizationSettings.paymentDetails || '',
    paymentDetailsEnabled: organizationSettings.paymentDetailsEnabled === true,
    defaultPaymentTerms: organizationSettings.defaultPaymentTerms || '',
    defaultTermsAndConditions: organizationSettings.defaultTermsAndConditions || '',
    supportEmail: organizationSettings.supportEmail || '',
    address: organizationSettings.address || {},
    tax: normalizeTaxConfig(organizationSettings.tax || {}),
    taskAutomation: normalizeTaskAutomation(organizationSettings.taskAutomation || {}),
    businessType: tenant?.businessType || 'shop',
    shopType: tenant?.businessType === 'shop' ? (tenantMetadata.shopType || DEFAULT_SHOP_TYPE) : '',
    appName: organizationSettings.appName || '',
    primaryColor: organizationSettings.primaryColor || ''
  };
};

const upsertSettingValue = async (tenantId, key, value, description = null) => {
  const [setting, created] = await Setting.findOrCreate({
    where: { tenantId, key },
    defaults: {
      tenantId,
      key,
      value,
      description
    }
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

const deleteFileIfExists = async (fileUrl) => {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) {
    return;
  }

  const relativePath = fileUrl.replace('/uploads/', '').split('/').join(path.sep);
  const absolutePath = path.join(baseUploadDir, relativePath);
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to delete file:', absolutePath, error);
    }
  }
};

const buildPublicUrl = (storagePath) => `/uploads/${storagePath.replace(/\\/g, '/')}`;

// @desc    Get customer source options for current tenant (business-type specific)
// @route   GET /api/settings/customer-sources
// @access  Private
exports.getCustomerSources = async (req, res, next) => {
  try {
    const tenant = normalizeTenantInstanceForRequest(req.tenant || (req.tenantMembership && await req.tenantMembership.getTenant()));
    const businessType = tenant?.businessType || 'shop';
    const metadata = tenant?.metadata || {};
    const options = getCustomerSourceOptions(businessType, metadata);
    res.status(200).json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
};

// @desc    Get lead source options for current tenant (business-type specific)
// @route   GET /api/settings/lead-sources
// @access  Private
exports.getLeadSources = async (req, res, next) => {
  try {
    const tenant = normalizeTenantInstanceForRequest(req.tenant || (req.tenantMembership && await req.tenantMembership.getTenant()));
    const businessType = tenant?.businessType || 'shop';
    const metadata = tenant?.metadata || {};
    const options = getLeadSourceOptions(businessType, metadata);
    res.status(200).json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const { mergeNotificationPreferences } = require('../services/notificationPreferenceHelper');
    // defaultScope excludes notificationPreferences; unscoped load required for Settings UI.
    const user = await User.unscoped().findByPk(req.user.id, {
      attributes: { exclude: ['password', 'failedLoginAttempts', 'lockoutUntil'] },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userJson = user.toJSON();
    userJson.notificationPreferences = mergeNotificationPreferences(user.notificationPreferences);
    res.status(200).json({ success: true, data: userJson });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = await User.unscoped().findByPk(req.user.id, {
      attributes: { exclude: ['password', 'failedLoginAttempts', 'lockoutUntil'] },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, profilePicture, password, currentPassword } = req.body;

    if (name !== undefined) {
      user.name = name;
    }

    if (profilePicture !== undefined) {
      if (!profilePicture && user.profilePicture) {
        await deleteFileIfExists(user.profilePicture);
      }
      user.profilePicture = profilePicture;
    }

    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to set a new password' });
      }

      const matches = await user.comparePassword(currentPassword);
      if (!matches) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      user.password = password;
    }

    await user.save();

    const { mergeNotificationPreferences } = require('../services/notificationPreferenceHelper');
    const userJson = user.toJSON();
    userJson.notificationPreferences = mergeNotificationPreferences(user.notificationPreferences);
    res.status(200).json({ success: true, data: userJson });
  } catch (error) {
    next(error);
  }
};

// @desc    Request account and workspace data deletion
// @route   POST /api/settings/data-deletion-request
// @access  Private
exports.requestDataDeletion = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const tenant = req.tenant || (req.tenantId ? await Tenant.findByPk(req.tenantId) : null);
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 1000)
        : null;

    const payload = {
      requestedAt: new Date().toISOString(),
      status: 'pending',
      userId: user.id,
      userEmail: user.email,
      userName: user.name || null,
      tenantId: req.tenantId || null,
      tenantName: tenant?.name || null,
      reason,
      source: 'mobile_app',
    };

    await upsertSettingValue(
      req.tenantId,
      `data_deletion_request_${user.id}`,
      payload,
      'Mobile account and data deletion request'
    );

    setImmediate(() => {
      notifyDataDeletionRequested(payload).catch((err) => {
        console.error('[settings] Data deletion request email failed:', err?.message || err);
      });
    });

    res.status(200).json({
      success: true,
      message: 'Deletion request received',
      data: payload,
    });
  } catch (error) {
    next(error);
  }
};

exports.uploadProfilePicture = async (req, res, next) => {
  try {
    console.log('[Profile Picture Upload] Starting upload...');
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!req.file) {
      console.log('[Profile Picture Upload] ❌ No file uploaded');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    console.log('[Profile Picture Upload] File info:', {
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: !!req.file.buffer,
      hasPath: !!req.file.path
    });

    // Convert image to base64 and store in database
    let base64Image;
    const mimeType = req.file.mimetype || 'image/png';
    
    try {
      if (req.file.buffer) {
        console.log('[Profile Picture Upload] File is in memory, converting to base64...');
        const base64String = req.file.buffer.toString('base64');
        base64Image = `data:${mimeType};base64,${base64String}`;
        console.log('[Profile Picture Upload] ✅ Base64 conversion complete. Length:', base64Image.length);
      } else if (req.file.path) {
        console.log('[Profile Picture Upload] File is on disk, reading from path:', req.file.path);
        const fs = require('fs');
        
        if (!fs.existsSync(req.file.path)) {
          console.log('[Profile Picture Upload] ❌ File path does not exist');
          return res.status(400).json({ success: false, message: 'Uploaded file not found on server' });
        }
        
        const fileBuffer = fs.readFileSync(req.file.path);
        const base64String = fileBuffer.toString('base64');
        base64Image = `data:${mimeType};base64,${base64String}`;
        console.log('[Profile Picture Upload] ✅ Base64 conversion complete. Length:', base64Image.length);
        
        // Delete the temporary file since we're storing in DB
        try {
          fs.unlinkSync(req.file.path);
          console.log('[Profile Picture Upload] ✅ Temporary file deleted');
        } catch (unlinkError) {
          console.log('[Profile Picture Upload] ⚠️  Warning: Could not delete temporary file:', unlinkError.message);
        }
      } else {
        console.log('[Profile Picture Upload] ❌ File has neither buffer nor path');
        return res.status(400).json({ success: false, message: 'Unable to process uploaded file' });
      }
    } catch (processingError) {
      console.error('[Profile Picture Upload] ❌ Error processing file:', processingError);
      return res.status(500).json({ success: false, message: 'Error processing uploaded file', error: processingError.message });
    }

    // Delete old image if it was a file path (not base64)
    if (user.profilePicture && !user.profilePicture.startsWith('data:')) {
      await deleteFileIfExists(user.profilePicture);
    }

    user.profilePicture = base64Image;
    await user.save();

    console.log('[Profile Picture Upload] ✅ Upload completed successfully');
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('[Profile Picture Upload] ❌ Error:', error);
    next(error);
  }
};

exports.getOrganizationSettings = async (req, res, next) => {
  try {
    const cacheKey = getOrganizationSettingsCacheKey(req.tenantId);
    const cachedOrganization = getCacheValue(cacheKey);
    if (cachedOrganization) {
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({ success: true, data: cachedOrganization });
    }

    const [settingsRow, tenantRow] = await Promise.all([
      Setting.findOne({
        where: { tenantId: req.tenantId, key: 'organization' },
        attributes: ['value']
      }),
      Tenant.findByPk(req.tenantId, {
        attributes: ['id', 'name', 'businessType', 'metadata']
      })
    ]);

    const tenant = normalizeTenantClassification(tenantRow);
    const organization = buildOrganizationPayload(settingsRow?.value || {}, tenant);

    warmTaxConfigCache(req.tenantId, organization);
    setCacheValue(cacheKey, organization, 30, req.tenantId);

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: organization });
  } catch (error) {
    next(error);
  }
};

exports.updateOrganizationSettings = async (req, res, next) => {
  try {
    console.log('🔵 [Backend] updateOrganizationSettings called');
    console.log('🔵 [Backend] Tenant ID:', req.tenantId);
    console.log('🔵 [Backend] Raw request body:', JSON.stringify(req.body, null, 2));
    console.log('🔵 [Backend] Request body type:', typeof req.body);
    console.log('🔵 [Backend] Request body keys:', req.body ? Object.keys(req.body) : 'null/undefined');
    
    const existing = await getSettingValue(req.tenantId, 'organization', {});
    console.log('🔵 [Backend] Existing Settings from DB:', JSON.stringify(existing, null, 2));

    const tenant = normalizeTenantInstanceForRequest(await Tenant.findByPk(req.tenantId));
    const isEnterprise = tenant?.plan === 'enterprise';
    let incoming = sanitizePayload(req.body || {});
    if (!isEnterprise) {
      delete incoming.appName;
      delete incoming.primaryColor;
    }
    console.log('🔵 [Backend] Incoming data (after sanitize):', JSON.stringify(incoming, null, 2));
    console.log('🔵 [Backend] Incoming data details:', {
      name: incoming.name,
      email: incoming.email,
      phone: incoming.phone,
      nameType: typeof incoming.name,
      nameLength: incoming.name?.length,
      emailType: typeof incoming.email,
      emailLength: incoming.email?.length,
      phoneType: typeof incoming.phone,
      phoneLength: incoming.phone?.length,
      hasName: incoming.hasOwnProperty('name'),
      hasEmail: incoming.hasOwnProperty('email'),
      hasPhone: incoming.hasOwnProperty('phone')
    });

    if (incoming.phone !== undefined) {
      const normalizedPhone = normalizePhone(incoming.phone);
      incoming.phone = normalizedPhone;

      if (normalizedPhone) {
        const tenantWithPhone = await Tenant.findOne({
          where: {
            [Op.and]: [
              { id: { [Op.ne]: req.tenantId } },
              sequelize.where(sequelize.json('metadata.phone'), normalizedPhone),
            ],
          },
        });

        if (tenantWithPhone) {
          return res.status(400).json({
            success: false,
            message:
              'This business phone number is already used by another workspace. Use a different phone number.',
          });
        }
      }
    }

    if (!incoming.logoUrl && existing.logoUrl && existing.logoUrl !== incoming.logoUrl) {
      await deleteFileIfExists(existing.logoUrl);
    }

    // Merge incoming data with existing to preserve fields that aren't being updated
    const mergedIncoming = {
      ...existing,
      ...incoming,
      // Ensure address and tax are properly merged
      address: {
        ...(existing.address || {}),
        ...(incoming.address || {})
      },
      tax: {
        ...(existing.tax || {}),
        ...(incoming.tax || {})
      },
      taskAutomation: {
        ...(existing.taskAutomation || {}),
        ...(incoming.taskAutomation || {})
      },
    };

    const taxValidationError = validateMergedTaxPayload(mergedIncoming.tax);
    if (taxValidationError) {
      return res.status(400).json({ success: false, message: taxValidationError });
    }
    mergedIncoming.tax = normalizeTaxConfig(mergedIncoming.tax || {});
    mergedIncoming.taskAutomation = normalizeTaskAutomation(mergedIncoming.taskAutomation || {});

    console.log('🔵 [Backend] Merged incoming data (before save):', JSON.stringify(mergedIncoming, null, 2));
    console.log('🔵 [Backend] Merged incoming details:', {
      name: mergedIncoming.name,
      email: mergedIncoming.email,
      phone: mergedIncoming.phone,
      nameType: typeof mergedIncoming.name,
      nameLength: mergedIncoming.name?.length,
      emailType: typeof mergedIncoming.email,
      emailLength: mergedIncoming.email?.length,
      phoneType: typeof mergedIncoming.phone,
      phoneLength: mergedIncoming.phone?.length
    });

    // Update organization settings in Settings model
    const updated = await upsertSettingValue(req.tenantId, 'organization', mergedIncoming);
    warmTaxConfigCache(req.tenantId, updated);

    if (tenant && mergedIncoming.primaryColor !== undefined) {
      const meta = tenant.metadata || {};
      tenant.metadata = { ...meta, primaryColor: mergedIncoming.primaryColor || null };
      await tenant.save();
    }

    console.log('🔵 [Backend] Updated Settings value (from DB):', JSON.stringify(updated, null, 2));
    console.log('🔵 [Backend] Updated Settings details:', {
      name: updated?.name,
      email: updated?.email,
      phone: updated?.phone,
      nameType: typeof updated?.name,
      nameLength: updated?.name?.length,
      emailType: typeof updated?.email,
      emailLength: updated?.email?.length,
      phoneType: typeof updated?.phone,
      phoneLength: updated?.phone?.length,
      hasName: updated?.hasOwnProperty('name'),
      hasEmail: updated?.hasOwnProperty('email'),
      hasPhone: updated?.hasOwnProperty('phone')
    });
    
    // Also update Tenant model with name, email, phone, website
    console.log('🔵 [Backend] Tenant before update:', {
      id: tenant?.id,
      name: tenant?.name,
      metadata: tenant?.metadata
    });
    
    if (tenant) {
      // Update tenant name if provided (even if empty string, we want to save it)
      if (incoming.name !== undefined) {
        const newName = incoming.name.trim() || incoming.name;
        console.log('🔵 [Backend] Updating tenant name:', {
          oldName: tenant.name,
          newName: newName,
          incomingName: incoming.name,
          trimmed: incoming.name.trim()
        });
        tenant.name = newName;
      }
      
      // Update tenant metadata (email, phone, website)
      const metadata = tenant.metadata || {};
      if (incoming.email !== undefined) {
        console.log('🔵 [Backend] Updating tenant email:', {
          oldEmail: metadata.email,
          newEmail: incoming.email
        });
        metadata.email = incoming.email || null;
      }
      if (incoming.phone !== undefined) {
        console.log('🔵 [Backend] Updating tenant phone:', {
          oldPhone: metadata.phone,
          newPhone: incoming.phone
        });
        metadata.phone = incoming.phone || null;
      }
      if (incoming.website !== undefined) {
        metadata.website = incoming.website || null;
      }
      if (incoming.shopType !== undefined && tenant.businessType === 'shop') {
        metadata.shopType = incoming.shopType || null;
      }
      tenant.metadata = metadata;

      await tenant.save();

      if (incoming.shopType !== undefined && tenant.businessType === 'shop') {
        try {
          await seedDefaultCategories(req.tenantId, 'shop', incoming.shopType || null);
        } catch (seedError) {
          console.error('Failed to seed categories after shop type update:', seedError);
        }
      }
      console.log('🔵 [Backend] Tenant updated and saved:', {
        name: tenant.name,
        metadata: tenant.metadata
      });
      
      // Reload tenant to verify save
      await tenant.reload();
      console.log('🔵 [Backend] Tenant after reload:', {
        name: tenant.name,
        metadata: tenant.metadata
      });
      invalidateTenantSettingsCache(req.tenantId);
    }

    // Return merged data (same structure as getOrganizationSettings)
    // Priority: Settings model > Tenant model
    // The `updated` variable is the entire organization object from Settings
    // Use Settings value if it exists AND is not empty, otherwise fall back to Tenant
    const nameFromSettings = updated && updated.hasOwnProperty('name') && updated.name !== undefined && updated.name !== null && updated.name.trim() !== '';
    const emailFromSettings = updated && updated.hasOwnProperty('email') && updated.email !== undefined && updated.email !== null && updated.email.trim() !== '';
    const phoneFromSettings = updated && updated.hasOwnProperty('phone') && updated.phone !== undefined && updated.phone !== null && updated.phone.trim() !== '';
    
    console.log('🔵 [Backend] Merge logic checks:', {
      nameFromSettings,
      emailFromSettings,
      phoneFromSettings,
      settingsName: updated?.name,
      settingsEmail: updated?.email,
      settingsPhone: updated?.phone,
      tenantName: tenant?.name,
      tenantEmail: tenant?.metadata?.email,
      tenantPhone: tenant?.metadata?.phone
    });
    
    const mergedData = {
      name: nameFromSettings
        ? updated.name
        : (tenant?.name || ''),
      legalName: (updated && updated.hasOwnProperty('legalName')) ? updated.legalName : '',
      email: emailFromSettings
        ? updated.email
        : (tenant?.metadata?.email || ''),
      phone: phoneFromSettings
        ? updated.phone
        : (tenant?.metadata?.phone || ''),
      website: (updated && updated.hasOwnProperty('website') && updated.website !== undefined && updated.website !== null && updated.website.trim() !== '')
        ? updated.website
        : (tenant?.metadata?.website || ''),
      logoUrl: (updated && updated.hasOwnProperty('logoUrl')) ? updated.logoUrl : '',
      invoiceFooter: (updated && updated.hasOwnProperty('invoiceFooter')) ? updated.invoiceFooter : '',
      paymentDetails: (updated && updated.hasOwnProperty('paymentDetails')) ? updated.paymentDetails : '',
      paymentDetailsEnabled: (updated && updated.hasOwnProperty('paymentDetailsEnabled')) ? updated.paymentDetailsEnabled === true : false,
      defaultPaymentTerms: (updated && updated.hasOwnProperty('defaultPaymentTerms')) ? updated.defaultPaymentTerms : '',
      defaultTermsAndConditions: (updated && updated.hasOwnProperty('defaultTermsAndConditions')) ? updated.defaultTermsAndConditions : '',
      supportEmail: (updated && updated.hasOwnProperty('supportEmail')) ? updated.supportEmail : '',
      address: (updated && updated.address) ? updated.address : {},
      tax: normalizeTaxConfig(updated?.tax || {}),
      taskAutomation: normalizeTaskAutomation(updated?.taskAutomation || {}),
      businessType: tenant?.businessType || 'shop',
      shopType: tenant?.businessType === 'shop'
        ? (tenant?.metadata?.shopType || tenant?.metadata?.businessSubType || DEFAULT_SHOP_TYPE)
        : '',
      appName: (updated && updated.hasOwnProperty('appName')) ? updated.appName : '',
      primaryColor: (updated && updated.hasOwnProperty('primaryColor')) ? updated.primaryColor : ''
    };

    console.log('🔵 [Backend] Final merged data:', JSON.stringify(mergedData, null, 2));
    console.log('🔵 [Backend] Final merged data details:', {
      name: mergedData.name,
      email: mergedData.email,
      phone: mergedData.phone,
      nameType: typeof mergedData.name,
      nameLength: mergedData.name?.length,
      emailType: typeof mergedData.email,
      emailLength: mergedData.email?.length,
      phoneType: typeof mergedData.phone,
      phoneLength: mergedData.phone?.length
    });
    
    res.status(200).json({ success: true, data: mergedData });
  } catch (error) {
    next(error);
  }
};

exports.uploadOrganizationLogo = async (req, res, next) => {
  try {
    console.log('[Organization Logo Upload] Starting upload...');
    const organization = await getSettingValue(req.tenantId, 'organization', {});
    
    if (!req.file) {
      console.log('[Organization Logo Upload] ❌ No file uploaded');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    console.log('[Organization Logo Upload] File info:', {
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: !!req.file.buffer,
      hasPath: !!req.file.path
    });

    // Convert image to base64 and store in database
    let base64Image;
    const mimeType = req.file.mimetype || 'image/png';
    
    try {
      if (req.file.buffer) {
        console.log('[Organization Logo Upload] File is in memory, converting to base64...');
        const base64String = req.file.buffer.toString('base64');
        base64Image = `data:${mimeType};base64,${base64String}`;
        console.log('[Organization Logo Upload] ✅ Base64 conversion complete. Length:', base64Image.length);
      } else if (req.file.path) {
        console.log('[Organization Logo Upload] File is on disk, reading from path:', req.file.path);
        const fs = require('fs');
        
        if (!fs.existsSync(req.file.path)) {
          console.log('[Organization Logo Upload] ❌ File path does not exist');
          return res.status(400).json({ success: false, message: 'Uploaded file not found on server' });
        }
        
        const fileBuffer = fs.readFileSync(req.file.path);
        const base64String = fileBuffer.toString('base64');
        base64Image = `data:${mimeType};base64,${base64String}`;
        console.log('[Organization Logo Upload] ✅ Base64 conversion complete. Length:', base64Image.length);
        
        // Delete the temporary file since we're storing in DB
        try {
          fs.unlinkSync(req.file.path);
          console.log('[Organization Logo Upload] ✅ Temporary file deleted');
        } catch (unlinkError) {
          console.log('[Organization Logo Upload] ⚠️  Warning: Could not delete temporary file:', unlinkError.message);
        }
      } else {
        console.log('[Organization Logo Upload] ❌ File has neither buffer nor path');
        return res.status(400).json({ success: false, message: 'Unable to process uploaded file' });
      }
    } catch (processingError) {
      console.error('[Organization Logo Upload] ❌ Error processing file:', processingError);
      return res.status(500).json({ success: false, message: 'Error processing uploaded file', error: processingError.message });
    }

    // Delete old logo if it was a file path (not base64)
    if (organization.logoUrl && !organization.logoUrl.startsWith('data:')) {
      await deleteFileIfExists(organization.logoUrl);
    }

    organization.logoUrl = base64Image;
    const updated = await upsertSettingValue(req.tenantId, 'organization', organization);

    console.log('[Organization Logo Upload] ✅ Upload completed successfully');
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('[Organization Logo Upload] ❌ Error:', error);
    next(error);
  }
};

exports.getSubscriptionSettings = async (req, res, next) => {
  try {
    const { resolveBillingStatus, toBillingPayload } = require('../services/subscriptionBillingService');
    const subscription = await getSettingValue(req.tenantId, 'subscription', {
      plan: 'trial',
      seats: 5,
      status: 'active',
      currentPeriodEnd: null,
      paymentMethod: null,
      history: []
    });
    const tenant = await Tenant.findByPk(req.tenantId, { attributes: ['plan', 'trialEndsAt', 'status', 'metadata'] });
    const tenantPlanRaw = tenant?.plan;
    const tenantPlanNorm = tenantPlanRaw != null ? normalizeSubscriptionPlanId(tenantPlanRaw) : '';
    const effectivePlan =
      tenantPlanRaw != null && String(tenantPlanRaw).trim() !== ''
        ? tenantPlanNorm || String(tenantPlanRaw).trim().toLowerCase()
        : subscription.plan || 'trial';
    const effectiveStatus =
      effectivePlan === 'trial'
        ? subscription.status === 'active'
          ? 'trialing'
          : subscription.status || 'trialing'
        : 'active';
    const billing = toBillingPayload(await resolveBillingStatus(req.tenantId));
    const data = {
      ...subscription,
      plan: effectivePlan,
      status: effectiveStatus,
      billing,
    };
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.updateSubscriptionSettings = async (req, res, next) => {
  try {
    const body = req.body || {};
    const protectedKeys = [
      'plan',
      'status',
      'currentPeriodEnd',
      'seats',
      'billingPeriod',
      'history',
      'lastPaymentReference',
      'paymentMethod',
    ];
    const attempted = protectedKeys.filter((key) => body[key] !== undefined);
    if (attempted.length > 0) {
      return res.status(403).json({
        success: false,
        message:
          'Subscription plan and billing period can only be changed via checkout or platform admin.',
      });
    }

    const current = await getSettingValue(req.tenantId, 'subscription', {});
    const patch = {};
    if (body.notes !== undefined) {
      patch.notes = String(body.notes).trim().slice(0, 500);
    }

    const updated = await upsertSettingValue(req.tenantId, 'subscription', {
      ...sanitizePayload(current),
      ...patch,
    });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

exports.getPayrollSettings = async (req, res, next) => {
  try {
    const payroll = await getSettingValue(req.tenantId, 'payroll', {
      incomeTaxRate: 0.15,
      ssnitEmployeeRate: 0.055,
      ssnitEmployerRate: 0.13,
      bonusTaxRate: 0.05,
      overtimeRate: 1.5
    });
    res.status(200).json({ success: true, data: payroll });
  } catch (error) {
    next(error);
  }
};

exports.updatePayrollSettings = async (req, res, next) => {
  try {
    const updated = await upsertSettingValue(
      req.tenantId,
      'payroll',
      sanitizePayload(req.body || {})
    );
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc    Get tenant AI settings (masked)
// @route   GET /api/settings/ai
// @access  Private
exports.getAISettings = async (req, res, next) => {
  try {
    const { getTenantAiSettingsSummary } = require('../services/tenantAiSettingsService');
    const summary = await getTenantAiSettingsSummary(req.tenantId);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Save tenant AI API key override
// @route   PUT /api/settings/ai
// @access  Private (admin, manager)
exports.updateAISettings = async (req, res, next) => {
  try {
    const { saveTenantAiApiKey } = require('../services/tenantAiSettingsService');
    const { apiKey } = sanitizePayload(req.body || {});
    const summary = await saveTenantAiApiKey({
      tenantId: req.tenantId,
      apiKey,
      userId: req.user?.id
    });

    res.status(200).json({
      success: true,
      message: 'AI API key saved for this workspace.',
      data: summary
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// @desc    Remove tenant AI API key override
// @route   DELETE /api/settings/ai
// @access  Private (admin, manager)
exports.deleteAISettings = async (req, res, next) => {
  try {
    const { clearTenantAiApiKey } = require('../services/tenantAiSettingsService');
    const summary = await clearTenantAiApiKey(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'Workspace AI key removed. AI features will use the system default when configured.',
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get WhatsApp settings
// @route   GET /api/settings/whatsapp
// @access  Private
exports.getWhatsAppSettings = async (req, res, next) => {
  try {
    const whatsappSettings = await getSettingValue(req.tenantId, 'whatsapp', {
      enabled: false,
      phoneNumberId: '',
      accessToken: '',
      businessAccountId: '',
      webhookVerifyToken: '',
      templateNamespace: ''
    });

    const whatsappService = require('../services/whatsappService');
    const whatsappTemplates = require('../services/whatsappTemplates');

    // Don't expose access token in response
    const safeSettings = {
      ...whatsappSettings,
      accessToken: whatsappSettings.accessToken ? '***' : '',
      accessTokenConfigured: !!whatsappSettings.accessToken,
      webhookUrl: whatsappService.getPublicWebhookUrl(),
      templates: whatsappTemplates.listTemplates()
    };

    res.status(200).json({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update WhatsApp settings
// @route   PUT /api/settings/whatsapp
// @access  Private
exports.updateWhatsAppSettings = async (req, res, next) => {
  try {
    const { decryptSecret, encryptSecret } = require('../utils/secretCrypto');
    const {
      enabled,
      phoneNumberId,
      accessToken,
      businessAccountId,
      webhookVerifyToken,
      templateNamespace
    } = sanitizePayload(req.body);
    const providedAccessToken = accessToken && accessToken !== '***' ? accessToken : '';

    // Get existing settings to preserve access token if not provided
    const existing = await getSettingValue(req.tenantId, 'whatsapp', {});
    const existingAccessToken = existing.accessToken
      ? decryptSecret(existing.accessToken, 'WHATSAPP_CREDENTIALS_ENCRYPTION_KEY')
      : '';

    // Validate required fields if enabling
    if (enabled) {
      const finalAccessToken = providedAccessToken || existingAccessToken;
      const finalPhoneNumberId = phoneNumberId || existing.phoneNumberId;

      if (!finalPhoneNumberId || !finalAccessToken) {
        return res.status(400).json({
          success: false,
          message: 'Phone Number ID and Access Token are required when enabling WhatsApp'
        });
      }

      // Test connection
      const whatsappService = require('../services/whatsappService');
      const testResult = await whatsappService.testConnection(finalAccessToken, finalPhoneNumberId);
      
      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to connect to WhatsApp API',
          error: testResult.error
        });
      }
    }

    const whatsappData = {
      enabled: enabled !== undefined ? enabled : existing.enabled || false,
      phoneNumberId: phoneNumberId || existing.phoneNumberId || '',
      accessToken: providedAccessToken
        ? encryptSecret(providedAccessToken, 'WHATSAPP_CREDENTIALS_ENCRYPTION_KEY')
        : existing.accessToken || '',
      businessAccountId: businessAccountId || existing.businessAccountId || '',
      webhookVerifyToken: webhookVerifyToken || existing.webhookVerifyToken || '',
      templateNamespace: templateNamespace || existing.templateNamespace || ''
    };

    const updated = await upsertSettingValue(
      req.tenantId,
      'whatsapp',
      whatsappData,
      'WhatsApp Business API configuration'
    );

    // Don't expose access token in response
    const safeSettings = {
      ...updated,
      accessToken: updated.accessToken ? '***' : '',
      accessTokenConfigured: !!updated.accessToken
    };

    try {
      const { applyVerificationAfterIntegrationSave } = require('../services/marketingChannelVerification');
      await applyVerificationAfterIntegrationSave(req.tenantId, 'whatsapp', whatsappData.enabled === true);
    } catch (verifyErr) {
      console.warn('[Settings][whatsapp] marketing verification update:', verifyErr?.message || verifyErr);
    }

    res.status(200).json({
      success: true,
      message: 'WhatsApp settings updated successfully',
      data: safeSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Test WhatsApp connection
// @route   POST /api/settings/whatsapp/test
// @access  Private
exports.testWhatsAppConnection = async (req, res, next) => {
  try {
    const { decryptSecret } = require('../utils/secretCrypto');
    const { accessToken, phoneNumberId } = sanitizePayload(req.body);
    const existing = await getSettingValue(req.tenantId, 'whatsapp', {});
    const providedAccessToken = accessToken && accessToken !== '***' ? accessToken : '';
    const finalAccessToken = providedAccessToken || (existing.accessToken ? decryptSecret(existing.accessToken, 'WHATSAPP_CREDENTIALS_ENCRYPTION_KEY') : '');
    const finalPhoneNumberId = phoneNumberId || existing.phoneNumberId || '';

    if (!finalAccessToken || !finalPhoneNumberId) {
      return res.status(400).json({
        success: false,
        message: 'Access Token and Phone Number ID are required (or save WhatsApp settings first)'
      });
    }

    const whatsappService = require('../services/whatsappService');
    const result = await whatsappService.testConnection(finalAccessToken, finalPhoneNumberId);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Connection successful',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Connection failed',
        error: result.error
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get SMS settings
// @route   GET /api/settings/sms
// @access  Private
exports.getSMSSettings = async (req, res, next) => {
  try {
    const smsService = require('../services/smsService');
    const { getTenantUsageSummary } = require('../services/platformSmsUsageService');
    const { getPlatformSmsSettingsSummary } = require('../services/platformSmsSettingsService');

    const smsSettings = await getSettingValue(req.tenantId, 'sms', {
      enabled: false,
      provider: 'termii',
      senderId: '',
      apiKey: '',
      accountSid: '',
      authToken: '',
      fromNumber: '',
      username: ''
    });

    const [smsMode, platformAvailable, platformSettings] = await Promise.all([
      smsService.getSmsMode(req.tenantId),
      smsService.isPlatformSmsEnabled(),
      getPlatformSmsSettingsSummary(),
    ]);

    let platformSms = null;
    if (platformAvailable) {
      const usage = await getTenantUsageSummary(req.tenantId);
      platformSms = {
        available: true,
        monthlyLimit: usage.monthlyLimit,
        monthlyLimitEnabled: usage.monthlyLimitEnabled !== false,
        sentThisMonth: usage.sentCount,
        remaining: usage.remaining,
        yearMonth: usage.yearMonth,
        resetsAt: usage.resetsAt,
        senderId: platformSettings.arkesel?.senderId || 'ABS',
      };
    }

    const safeSettings = {
      ...smsSettings,
      authToken: smsSettings.authToken ? '***' : '',
      apiKey: smsSettings.apiKey ? '***' : '',
      smsMode,
      platformSms,
    };

    res.status(200).json({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update SMS settings
// @route   PUT /api/settings/sms
// @access  Private
exports.updateSMSSettings = async (req, res, next) => {
  try {
    const {
      enabled,
      provider,
      senderId,
      accountSid,
      authToken,
      fromNumber,
      apiKey,
      username
    } = sanitizePayload(req.body);

    // Get existing settings to preserve sensitive data if not provided
    const existing = await getSettingValue(req.tenantId, 'sms', {});

    // Validate required fields if enabling
    if (enabled) {
      const finalProvider = (provider || existing.provider || 'termii').toLowerCase();

      if (finalProvider === 'termii') {
        const finalApiKey = apiKey || existing.apiKey;
        const finalSenderId = (senderId || existing.senderId || '').trim();

        if (!finalApiKey || !finalSenderId) {
          return res.status(400).json({
            success: false,
            message: 'API Key and Sender ID are required for Termii (3-11 characters)'
          });
        }
        if (finalSenderId.length < 3 || finalSenderId.length > 11) {
          return res.status(400).json({
            success: false,
            message: 'Termii Sender ID must be 3-11 characters'
          });
        }

        const smsService = require('../services/smsService');
        const testResult = await smsService.testConnection({
          provider: 'termii',
          apiKey: finalApiKey
        });

        if (!testResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Failed to connect to SMS service',
            error: testResult.error
          });
        }
      } else if (finalProvider === 'twilio') {
        const finalAccountSid = accountSid || existing.accountSid;
        const finalAuthToken = authToken || existing.authToken;
        const finalFromNumber = fromNumber || existing.fromNumber;

        if (!finalAccountSid || !finalAuthToken || !finalFromNumber) {
          return res.status(400).json({
            success: false,
            message: 'Account SID, Auth Token, and From Number are required for Twilio'
          });
        }

        const smsService = require('../services/smsService');
        const testResult = await smsService.testConnection({
          provider: 'twilio',
          accountSid: finalAccountSid,
          authToken: finalAuthToken
        });

        if (!testResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Failed to connect to SMS service',
            error: testResult.error
          });
        }
      } else if (finalProvider === 'africas_talking') {
        const finalApiKey = apiKey || existing.apiKey;
        const finalUsername = username || existing.username;
        const finalFromNumber = fromNumber || existing.fromNumber;

        if (!finalApiKey || !finalUsername || !finalFromNumber) {
          return res.status(400).json({
            success: false,
            message: 'API Key, Username, and From Number are required for Africa\'s Talking'
          });
        }

        const smsService = require('../services/smsService');
        const testResult = await smsService.testConnection({
          provider: 'africas_talking',
          apiKey: finalApiKey,
          username: finalUsername
        });

        if (!testResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Failed to connect to SMS service',
            error: testResult.error
          });
        }
      } else if (finalProvider === 'arkesel') {
        const finalApiKey = apiKey || existing.apiKey;
        const finalSenderId = (senderId || existing.senderId || '').trim();

        if (!finalApiKey || !finalSenderId) {
          return res.status(400).json({
            success: false,
            message: 'API Key and Sender ID are required for Arkesel'
          });
        }
        if (finalSenderId.length < 3 || finalSenderId.length > 11) {
          return res.status(400).json({
            success: false,
            message: 'Arkesel Sender ID must be 3-11 characters'
          });
        }

        const smsService = require('../services/smsService');
        const testResult = await smsService.testConnection({
          provider: 'arkesel',
          apiKey: finalApiKey,
          senderId: finalSenderId,
        });

        if (!testResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Failed to connect to SMS service',
            error: testResult.error
          });
        }
      }
    }

    const smsData = {
      enabled: enabled !== undefined ? enabled : existing.enabled || false,
      provider: provider || existing.provider || 'termii',
      senderId: (senderId !== undefined ? senderId : existing.senderId) || '',
      apiKey: apiKey || existing.apiKey || '',
      accountSid: accountSid || existing.accountSid || '',
      authToken: authToken || existing.authToken || '',
      fromNumber: fromNumber || existing.fromNumber || '',
      username: username || existing.username || ''
    };

    const updated = await upsertSettingValue(
      req.tenantId,
      'sms',
      smsData,
      'SMS service configuration'
    );

    // Don't expose sensitive tokens in response
    const safeSettings = {
      ...updated,
      authToken: updated.authToken ? '***' : '',
      apiKey: updated.apiKey ? '***' : ''
    };

    try {
      const { applyVerificationAfterIntegrationSave } = require('../services/marketingChannelVerification');
      await applyVerificationAfterIntegrationSave(req.tenantId, 'sms', smsData.enabled === true);
    } catch (verifyErr) {
      console.warn('[Settings][sms] marketing verification update:', verifyErr?.message || verifyErr);
    }

    res.status(200).json({
      success: true,
      message: 'SMS settings updated successfully',
      data: safeSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Test SMS connection
// @route   POST /api/settings/sms/test
// @access  Private
exports.testSMSConnection = async (req, res, next) => {
  try {
    const config = sanitizePayload(req.body);

    if (!config.provider) {
      return res.status(400).json({
        success: false,
        message: 'Provider is required'
      });
    }

    const smsService = require('../services/smsService');
    const result = await smsService.testConnection(config);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Connection successful',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Connection failed',
        error: result.error
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get SMS templates for tenant
// @route   GET /api/settings/sms-templates
// @access  Private
exports.getSmsTemplates = async (req, res, next) => {
  try {
    const smsTemplateService = require('../services/smsTemplateService');
    const templates = await smsTemplateService.getTemplatesForTenant(req.tenantId);
    res.status(200).json({
      success: true,
      data: { templates },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Save SMS template override for an event
// @route   PUT /api/settings/sms-templates/:eventKey
// @access  Private
exports.updateSmsTemplate = async (req, res, next) => {
  try {
    const { eventKey } = req.params;
    const { body, enabled } = sanitizePayload(req.body);
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Template body is required',
      });
    }

    const smsTemplateService = require('../services/smsTemplateService');
    const template = await smsTemplateService.saveTemplate(req.tenantId, eventKey, body, enabled);
    invalidateTenantSettingsCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'SMS template saved',
      data: template,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.details || undefined,
      });
    }
    next(error);
  }
};

// @desc    Reset SMS template to platform default
// @route   POST /api/settings/sms-templates/:eventKey/reset
// @access  Private
exports.resetSmsTemplate = async (req, res, next) => {
  try {
    const { eventKey } = req.params;
    const smsTemplateService = require('../services/smsTemplateService');
    const template = await smsTemplateService.resetTemplate(req.tenantId, eventKey);
    invalidateTenantSettingsCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'SMS template reset to default',
      data: template,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

// @desc    Get Email settings
// @route   GET /api/settings/email
// @access  Private
exports.getEmailSettings = async (req, res, next) => {
  try {
    const emailSettings = await getSettingValue(req.tenantId, 'email', {
      enabled: false,
      provider: 'smtp',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPassword: '',
      smtpRejectUnauthorized: true,
      fromEmail: '',
      fromName: '',
      sendgridApiKey: '',
      sesAccessKeyId: '',
      sesSecretAccessKey: '',
      sesRegion: 'us-east-1',
      sesHost: ''
    });

    // Don't expose sensitive passwords/keys in response
    const safeSettings = {
      ...emailSettings,
      smtpPassword: emailSettings.smtpPassword ? '***' : '',
      sendgridApiKey: emailSettings.sendgridApiKey ? '***' : '',
      sesSecretAccessKey: emailSettings.sesSecretAccessKey ? '***' : ''
    };

    const emailService = require('../services/emailService');
    const { getPlatformEmailSettingsSummary } = require('../services/platformEmailSettingsService');

    const [emailMode, platformAvailable] = await Promise.all([
      emailService.getEmailMode(req.tenantId),
      emailService.isPlatformEmailEnabled(),
    ]);

    let platformEmail = null;
    if (platformAvailable) {
      const [platformConfig, platformSettings] = await Promise.all([
        emailService.resolvePlatformConfig(),
        getPlatformEmailSettingsSummary(),
      ]);
      const fromEmail = platformConfig?.fromEmail
        || platformSettings.sendgrid?.fromEmail
        || platformSettings.smtp?.fromEmail
        || '';
      const fromName = platformConfig?.fromName
        || platformSettings.sendgrid?.fromName
        || platformSettings.smtp?.fromName
        || process.env.APP_NAME
        || 'African Business Suite';
      platformEmail = {
        available: true,
        fromEmail,
        fromName,
        provider: platformConfig?.provider || platformSettings.provider || 'sendgrid',
      };
    }

    safeSettings.emailMode = emailMode;
    safeSettings.platformEmail = platformEmail;

    console.log(`[Email][GET /settings/email] ${emailService.formatTenantEmailAudit(req.tenantId, emailSettings)} emailMode=${emailMode}`);

    res.status(200).json({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get which notification channels (email, WhatsApp, SMS) are configured for the tenant (for quote auto-send etc.)
//         and customer notification preferences (auto-send invoice, auto-send receipt).
// @route   GET /api/settings/notification-channels
// @access  Private
exports.getNotificationChannels = async (req, res, next) => {
  try {
    const cacheKey = getNotificationChannelsCacheKey(req.tenantId);
    const cachedChannels = getCacheValue(cacheKey);
    if (cachedChannels) {
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({ success: true, data: cachedChannels });
    }

    const rows = await Setting.findAll({
      where: {
        tenantId: req.tenantId,
        key: { [Op.in]: ['sms', 'whatsapp', 'email', 'customer-notification-preferences'] }
      },
      attributes: ['key', 'value']
    });
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value || {};
      return acc;
    }, {});

    const smsService = require('../services/smsService');
    const smsResolved = await smsService.getResolvedConfig(req.tenantId);
    const whatsappConfig = settings.whatsapp || {};
    const ev = settings.email || {};
    const emailConfigured = !!(ev.enabled && (ev.smtpHost || ev.sendgridApiKey || ev.sesAccessKeyId));
    const prefs = settings['customer-notification-preferences'] || {};
    const data = {
      email: emailConfigured,
      whatsapp: !!(whatsappConfig.enabled && whatsappConfig.phoneNumberId),
      sms: !!smsResolved,
      autoSendInvoiceToCustomer: prefs.autoSendInvoiceToCustomer !== false,
      autoSendReceiptToCustomer: prefs.autoSendReceiptToCustomer === true,
      sendPaymentReminderEmail: prefs.sendPaymentReminderEmail === true,
      sendInvoicePaidConfirmationToCustomer: prefs.sendInvoicePaidConfirmationToCustomer !== false
    };

    setCacheValue(cacheKey, data, 30, req.tenantId);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @desc    Get per-event message delivery rules (channel toggles; templates owned by ABS).
// @route   GET /api/settings/message-delivery-rules
// @access  Private (admin/manager)
exports.getMessageDeliveryRules = async (req, res, next) => {
  try {
    const messageDeliveryRulesService = require('../services/messageDeliveryRulesService');
    const data = await messageDeliveryRulesService.getDeliveryRulesResponse(req.tenantId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @desc    Update per-event message delivery rules.
// @route   PUT /api/settings/message-delivery-rules
// @access  Private (admin/manager)
exports.updateMessageDeliveryRules = async (req, res, next) => {
  try {
    const messageDeliveryRulesService = require('../services/messageDeliveryRulesService');
    const payload = sanitizePayload(req.body);
    if (!payload?.events || typeof payload.events !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'events object is required',
      });
    }
    await messageDeliveryRulesService.saveDeliveryRules(req.tenantId, payload);
    const data = await messageDeliveryRulesService.getDeliveryRulesResponse(req.tenantId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @desc    Get delivery fee band settings
// @route   GET /api/settings/delivery
// @access  Private
exports.getDeliverySettings = async (req, res, next) => {
  try {
    const deliverySettingsService = require('../services/deliverySettingsService');
    const data = await deliverySettingsService.getDeliverySettings(req.tenantId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @desc    Update delivery fee band settings
// @route   PUT /api/settings/delivery
// @access  Private (admin/manager)
exports.updateDeliverySettings = async (req, res, next) => {
  try {
    const deliverySettingsService = require('../services/deliverySettingsService');
    const data = await deliverySettingsService.saveDeliverySettings(
      req.tenantId,
      sanitizePayload(req.body || {})
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Invalid delivery settings'
    });
  }
};

// @desc    Update customer notification preferences (auto-send invoice, auto-send receipt).
// @route   PUT /api/settings/customer-notification-preferences
// @access  Private
exports.updateCustomerNotificationPreferences = async (req, res, next) => {
  try {
    const { autoSendInvoiceToCustomer, autoSendReceiptToCustomer, sendPaymentReminderEmail, sendInvoicePaidConfirmationToCustomer } = sanitizePayload(req.body);
    const existing = await getSettingValue(req.tenantId, 'customer-notification-preferences', {});
    const updated = {
      ...existing,
      ...(typeof autoSendInvoiceToCustomer === 'boolean' && { autoSendInvoiceToCustomer }),
      ...(typeof autoSendReceiptToCustomer === 'boolean' && { autoSendReceiptToCustomer }),
      ...(typeof sendPaymentReminderEmail === 'boolean' && { sendPaymentReminderEmail }),
      ...(typeof sendInvoicePaidConfirmationToCustomer === 'boolean' && { sendInvoicePaidConfirmationToCustomer })
    };
    let record = await Setting.findOne({ where: { tenantId: req.tenantId, key: 'customer-notification-preferences' } });
    if (record) {
      await record.update({ value: updated });
    } else {
      await Setting.create({ tenantId: req.tenantId, key: 'customer-notification-preferences', value: updated });
    }
    invalidateTenantSettingsCache(req.tenantId);
    res.status(200).json({
      success: true,
      data: {
        autoSendInvoiceToCustomer: updated.autoSendInvoiceToCustomer !== false,
        autoSendReceiptToCustomer: updated.autoSendReceiptToCustomer === true,
        sendPaymentReminderEmail: updated.sendPaymentReminderEmail === true,
        sendInvoicePaidConfirmationToCustomer: updated.sendInvoicePaidConfirmationToCustomer !== false
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get per-user sidebar visibility preferences for the active workspace
// @route   GET /api/settings/sidebar-preferences
// @access  Private
exports.getSidebarPreferences = async (req, res, next) => {
  try {
    const {
      getSidebarPreferences: buildSidebarPreferences,
      getTenantDefaultHiddenSidebarKeys,
    } = require('../services/sidebarPreferenceHelper');

    // Platform admins in support (read-only or configuration) have no UserTenant membership.
    // Return tenant-wide sidebar defaults instead of requiring membership.
    if (req.isSupportAccess) {
      const tenant = req.tenant || (await Tenant.findByPk(req.tenantId, { attributes: ['metadata', 'businessType'] }));
      const shopType =
        tenant?.metadata?.businessSubType || tenant?.metadata?.shopType || null;
      const hiddenSidebarKeys = getTenantDefaultHiddenSidebarKeys(
        tenant?.metadata,
        tenant?.businessType,
        shopType
      );
      return res.status(200).json({
        success: true,
        data: {
          hiddenSidebarKeys,
          source: 'tenant_default',
        },
      });
    }

    const membership = req.tenantMembership;
    if (!membership) {
      return res.status(400).json({
        success: false,
        message: 'Tenant membership required',
      });
    }

    const tenant = req.tenant || (await membership.getTenant?.());
    const preferences = buildSidebarPreferences(
      membership,
      tenant?.metadata,
      tenant?.businessType || req.tenant?.businessType
    );
    res.status(200).json({
      success: true,
      data: {
        hiddenSidebarKeys: preferences.hiddenSidebarKeys,
        source: preferences.source,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update per-user sidebar visibility preferences for the active workspace
// @route   PATCH /api/settings/sidebar-preferences
// @access  Private
exports.updateSidebarPreferences = async (req, res, next) => {
  try {
    const {
      sanitizeHiddenSidebarKeys,
      getSidebarPreferences: buildSidebarPreferences,
      getTenantDefaultHiddenSidebarKeys,
    } = require('../services/sidebarPreferenceHelper');
    const { isConfigurationSupportMode } = require('../utils/supportAccess');
    const { hiddenSidebarKeys } = sanitizePayload(req.body || {});
    const tenantForType =
      req.tenant ||
      (await Tenant.findByPk(req.tenantId, { attributes: ['metadata', 'businessType'] }));
    const businessType = tenantForType?.businessType || null;
    const shopType =
      tenantForType?.metadata?.businessSubType || tenantForType?.metadata?.shopType || null;
    const sanitized = sanitizeHiddenSidebarKeys(hiddenSidebarKeys, businessType, shopType);

    if (req.isSupportAccess && isConfigurationSupportMode(req.supportAccessMode)) {
      const tenant = tenantForType || (await Tenant.findByPk(req.tenantId));
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'Tenant not found' });
      }
      const beforeKeys = getTenantDefaultHiddenSidebarKeys(
        tenant.metadata,
        tenant.businessType,
        shopType
      );
      const metadata =
        tenant.metadata && typeof tenant.metadata === 'object'
          ? { ...tenant.metadata }
          : {};
      metadata.defaultHiddenSidebarKeys = sanitized;
      tenant.metadata = metadata;
      await tenant.save();
      invalidateTenantSettingsCache(req.tenantId);

      await TenantAccessAudit.create({
        tenantId: req.tenantId,
        actorUserId: req.user.id,
        action: 'tenant_settings_updated',
        before: {
          sections: ['sidebarDefaults'],
          settings: {
            sidebarDefaults: { hiddenSidebarKeys: beforeKeys },
          },
        },
        after: {
          sections: ['sidebarDefaults'],
          settings: {
            sidebarDefaults: { hiddenSidebarKeys: sanitized },
          },
        },
        reason: req.supportAccessSession?.reason || 'Support configuration access sidebar update',
      });

      return res.status(200).json({
        success: true,
        data: {
          hiddenSidebarKeys: sanitized,
          source: 'tenant_default',
        },
      });
    }

    const membership = req.tenantMembership;
    if (!membership) {
      return res.status(400).json({
        success: false,
        message: 'Tenant membership required',
      });
    }

    const metadata =
      membership.metadata && typeof membership.metadata === 'object'
        ? { ...membership.metadata }
        : {};
    metadata.hiddenSidebarKeys = sanitized;

    await UserTenant.update(
      { metadata },
      { where: { id: membership.id, userId: req.user.id, tenantId: req.tenantId } }
    );
    invalidateTenantMembershipCache(req.user.id, req.tenantId);

    const preferences = buildSidebarPreferences(
      { metadata },
      tenantForType?.metadata,
      businessType
    );
    res.status(200).json({
      success: true,
      data: {
        hiddenSidebarKeys: preferences.hiddenSidebarKeys,
        source: preferences.source,
      },
    });
  } catch (error) {
    next(error);
  }
};

const QUOTE_WORKFLOW_DEFAULTS = { onAccept: 'record_only' };
const QUOTE_WORKFLOW_ON_ACCEPT_VALUES = [
  'record_only',
  'create_job_invoice_and_send',
  'create_sale_invoice_and_send'
];

// @desc    Get quote workflow (when customer accepts quote: record only vs create downstream document and send).
// @route   GET /api/settings/quote-workflow
// @access  Private
exports.getQuoteWorkflow = async (req, res, next) => {
  try {
    const value = await getSettingValue(req.tenantId, 'quote-workflow', QUOTE_WORKFLOW_DEFAULTS);
    const onAccept = QUOTE_WORKFLOW_ON_ACCEPT_VALUES.includes(value.onAccept)
      ? value.onAccept
      : 'record_only';
    res.status(200).json({
      success: true,
      data: {
        onAccept
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update quote workflow
// @route   PUT /api/settings/quote-workflow
// @access  Private
exports.updateQuoteWorkflow = async (req, res, next) => {
  try {
    const { onAccept } = sanitizePayload(req.body);
    const valid = QUOTE_WORKFLOW_ON_ACCEPT_VALUES.includes(onAccept);
    const value = valid ? { onAccept } : QUOTE_WORKFLOW_DEFAULTS;
    await upsertSettingValue(req.tenantId, 'quote-workflow', value, 'When customer accepts quote: record only or create sales/job document and send');
    res.status(200).json({
      success: true,
      data: { onAccept: value.onAccept }
    });
  } catch (error) {
    next(error);
  }
};

const { JOB_INVOICE_DEFAULTS } = require('../services/jobCustomerTrackingService');

// @desc    Get job + invoice options (e.g. auto-send invoice when a job is created)
// @route   GET /api/settings/job-invoice
// @access  Private
exports.getJobInvoiceSettings = async (req, res, next) => {
  try {
    const value = await getSettingValue(req.tenantId, 'job-invoice', JOB_INVOICE_DEFAULTS);
    const tenant = await Tenant.findByPk(req.tenantId, { attributes: ['slug'] });
    res.status(200).json({
      success: true,
      data: {
        autoSendInvoiceOnJobCreation: value.autoSendInvoiceOnJobCreation === true,
        customerJobTrackingEnabled: value.customerJobTrackingEnabled === true,
        emailCustomerJobTrackingOnJobCreation: value.emailCustomerJobTrackingOnJobCreation === true,
        smsCustomerJobTrackingOnJobCreation: value.smsCustomerJobTrackingOnJobCreation === true,
        // Hard-disabled: product cost feeds COGS, not Expense (avoids double-counting profit).
        autoCreateExpenseFromProductCost: false,
        tenantSlug: tenant?.slug || null
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update job + invoice options
// @route   PUT /api/settings/job-invoice
// @access  Private (admin, manager)
exports.updateJobInvoiceSettings = async (req, res, next) => {
  try {
    const {
      autoSendInvoiceOnJobCreation,
      customerJobTrackingEnabled,
      emailCustomerJobTrackingOnJobCreation,
      smsCustomerJobTrackingOnJobCreation
    } = sanitizePayload(req.body);
    const existing = await getSettingValue(req.tenantId, 'job-invoice', JOB_INVOICE_DEFAULTS);
    let value = {
      ...existing,
      ...(typeof autoSendInvoiceOnJobCreation === 'boolean' && { autoSendInvoiceOnJobCreation }),
      ...(typeof customerJobTrackingEnabled === 'boolean' && { customerJobTrackingEnabled }),
      ...(typeof emailCustomerJobTrackingOnJobCreation === 'boolean' && { emailCustomerJobTrackingOnJobCreation }),
      ...(typeof smsCustomerJobTrackingOnJobCreation === 'boolean' && { smsCustomerJobTrackingOnJobCreation }),
      // Always clear legacy flag; creating expenses from product cost is removed.
      autoCreateExpenseFromProductCost: false
    };
    if (value.customerJobTrackingEnabled !== true) {
      value.emailCustomerJobTrackingOnJobCreation = false;
      value.smsCustomerJobTrackingOnJobCreation = false;
    }
    await upsertSettingValue(
      req.tenantId,
      'job-invoice',
      value,
      'Job invoices, customer tracking links, and related emails'
    );
    const tenant = await Tenant.findByPk(req.tenantId, { attributes: ['slug'] });
    res.status(200).json({
      success: true,
      data: {
        autoSendInvoiceOnJobCreation: value.autoSendInvoiceOnJobCreation === true,
        customerJobTrackingEnabled: value.customerJobTrackingEnabled === true,
        emailCustomerJobTrackingOnJobCreation: value.emailCustomerJobTrackingOnJobCreation === true,
        smsCustomerJobTrackingOnJobCreation: value.smsCustomerJobTrackingOnJobCreation === true,
        autoCreateExpenseFromProductCost: false,
        tenantSlug: tenant?.slug || null
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Email settings
// @route   PUT /api/settings/email
// @access  Private
exports.updateEmailSettings = async (req, res, next) => {
  try {
    const {
      enabled,
      provider,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      smtpRejectUnauthorized,
      fromEmail,
      fromName,
      sendgridApiKey,
      sesAccessKeyId,
      sesSecretAccessKey,
      sesRegion,
      sesHost
    } = sanitizePayload(req.body);

    // Get existing settings to preserve sensitive data if not provided
    const existing = await getSettingValue(req.tenantId, 'email', {});

    // Validate required fields if enabling
    if (enabled) {
      const finalProvider = provider || existing.provider || 'smtp';
      
      if (finalProvider === 'smtp') {
        const finalSmtpHost = smtpHost || existing.smtpHost;
        const finalSmtpUser = smtpUser || existing.smtpUser;
        const finalSmtpPassword = smtpPassword || existing.smtpPassword;

        if (!finalSmtpHost || !finalSmtpUser || !finalSmtpPassword) {
          return res.status(400).json({
            success: false,
            message: 'SMTP Host, User, and Password are required'
          });
        }

        // Test connection
        const emailService = require('../services/emailService');
        const testResult = await emailService.testConnection({
          provider: 'smtp',
          smtpHost: finalSmtpHost,
          smtpPort: smtpPort || existing.smtpPort || 587,
          smtpUser: finalSmtpUser,
          smtpPassword: finalSmtpPassword,
          smtpRejectUnauthorized: smtpRejectUnauthorized !== undefined ? smtpRejectUnauthorized : existing.smtpRejectUnauthorized !== false,
          fromEmail: fromEmail || existing.fromEmail || ''
        }, {
          context: {
            requestId: req.id || req.headers?.['x-request-id'],
            tenantId: req.tenantId,
            userId: req.user?.id,
            source: 'settings_email_save_validation',
            mode: 'verify',
          },
        });
        
        if (!testResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Failed to connect to email service',
            error: testResult.error
          });
        }
      } else if (finalProvider === 'sendgrid') {
        const finalSendgridApiKey = sendgridApiKey || existing.sendgridApiKey;

        if (!finalSendgridApiKey) {
          return res.status(400).json({
            success: false,
            message: 'SendGrid API Key is required'
          });
        }

        // Test connection
        const emailService = require('../services/emailService');
        const testResult = await emailService.testConnection({
          provider: 'sendgrid',
          sendgridApiKey: finalSendgridApiKey,
          fromEmail: fromEmail || existing.fromEmail || ''
        }, {
          context: {
            requestId: req.id || req.headers?.['x-request-id'],
            tenantId: req.tenantId,
            userId: req.user?.id,
            source: 'settings_email_save_validation',
            mode: 'verify',
          },
        });
        
        if (!testResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Failed to connect to email service',
            error: testResult.error
          });
        }
      } else if (finalProvider === 'ses') {
        const finalSesAccessKeyId = sesAccessKeyId || existing.sesAccessKeyId;
        const finalSesSecretAccessKey = sesSecretAccessKey || existing.sesSecretAccessKey;

        if (!finalSesAccessKeyId || !finalSesSecretAccessKey) {
          return res.status(400).json({
            success: false,
            message: 'AWS SES Access Key ID and Secret Access Key are required'
          });
        }

        // Test connection
        const emailService = require('../services/emailService');
        const testResult = await emailService.testConnection({
          provider: 'ses',
          sesAccessKeyId: finalSesAccessKeyId,
          sesSecretAccessKey: finalSesSecretAccessKey,
          sesRegion: sesRegion || existing.sesRegion || 'us-east-1',
          sesHost: sesHost || existing.sesHost,
          fromEmail: fromEmail || existing.fromEmail || ''
        }, {
          context: {
            requestId: req.id || req.headers?.['x-request-id'],
            tenantId: req.tenantId,
            userId: req.user?.id,
            source: 'settings_email_save_validation',
            mode: 'verify',
          },
        });
        
        if (!testResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Failed to connect to email service',
            error: testResult.error
          });
        }
      }
    }

    // Treat empty or masked values as "keep existing" so stored password/keys are not cleared on refresh/save
    const isRealSecret = (v) => typeof v === 'string' && v.trim() !== '' && v !== '***';
    const emailData = {
      enabled: enabled !== undefined ? enabled : existing.enabled || false,
      provider: provider || existing.provider || 'smtp',
      smtpHost: smtpHost || existing.smtpHost || '',
      smtpPort: smtpPort !== undefined ? smtpPort : (existing.smtpPort || 587),
      smtpUser: smtpUser || existing.smtpUser || '',
      smtpPassword: isRealSecret(smtpPassword) ? smtpPassword : (existing.smtpPassword || ''),
      smtpRejectUnauthorized: smtpRejectUnauthorized !== undefined ? smtpRejectUnauthorized : (existing.smtpRejectUnauthorized !== false),
      fromEmail: fromEmail || existing.fromEmail || '',
      fromName: fromName || existing.fromName || '',
      sendgridApiKey: isRealSecret(sendgridApiKey) ? sendgridApiKey : (existing.sendgridApiKey || ''),
      sesAccessKeyId: sesAccessKeyId || existing.sesAccessKeyId || '',
      sesSecretAccessKey: isRealSecret(sesSecretAccessKey) ? sesSecretAccessKey : (existing.sesSecretAccessKey || ''),
      sesRegion: sesRegion || existing.sesRegion || 'us-east-1',
      sesHost: sesHost || existing.sesHost || ''
    };

    const updated = await upsertSettingValue(
      req.tenantId,
      'email',
      emailData,
      'Email service configuration'
    );

    // Don't expose sensitive passwords/keys in response
    const safeSettings = {
      ...updated,
      smtpPassword: updated.smtpPassword ? '***' : '',
      sendgridApiKey: updated.sendgridApiKey ? '***' : '',
      sesSecretAccessKey: updated.sesSecretAccessKey ? '***' : ''
    };

    const emailService = require('../services/emailService');
    console.log(`[Email][PUT /settings/email] ${emailService.formatTenantEmailAudit(req.tenantId, emailData)}`);

    try {
      const { applyVerificationAfterIntegrationSave } = require('../services/marketingChannelVerification');
      await applyVerificationAfterIntegrationSave(req.tenantId, 'email', emailData.enabled === true);
    } catch (verifyErr) {
      console.warn('[Settings][email] marketing verification update:', verifyErr?.message || verifyErr);
    }

    res.status(200).json({
      success: true,
      message: 'Email settings updated successfully',
      data: safeSettings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get POS config
// @route   GET /api/settings/pos-config
// @access  Private
const POS_CONFIG_DEFAULTS = {
  receipt: { mode: 'ask', channels: ['sms', 'print'] },
  print: { format: 'a4', showLogo: true, color: true, fontSize: 'normal' },
  customer: { phoneRequired: false, nameRequired: false },
  scanning: { enabled: false, allowManualBarcodeEntry: true, allowExternalScanner: true },
};

const VALID_RECEIPT_MODES = ['ask', 'auto_send', 'auto_print', 'auto_both'];
const VALID_CHANNELS = ['sms', 'whatsapp', 'email', 'print'];
const VALID_PRINT_FORMATS = ['a4', 'thermal_58', 'thermal_80'];
const VALID_FONT_SIZES = ['normal', 'small'];

exports.getPOSConfig = async (req, res, next) => {
  try {
    const config = await getSettingValue(req.tenantId, 'pos_config', POS_CONFIG_DEFAULTS);
    const merged = {
      receipt: { ...POS_CONFIG_DEFAULTS.receipt, ...(config.receipt || {}) },
      print: { ...POS_CONFIG_DEFAULTS.print, ...(config.print || {}) },
      customer: { ...POS_CONFIG_DEFAULTS.customer, ...(config.customer || {}) },
      scanning: { ...POS_CONFIG_DEFAULTS.scanning, ...(config.scanning || {}) },
    };

    // Check which receipt channels (SMS, WhatsApp, Email) are actually integrated
    const smsService = require('../services/smsService');
    const [smsSetting, whatsappSetting, emailSetting, smsResolved] = await Promise.all([
      Setting.findOne({ where: { tenantId: req.tenantId, key: 'sms' } }),
      Setting.findOne({ where: { tenantId: req.tenantId, key: 'whatsapp' } }),
      Setting.findOne({ where: { tenantId: req.tenantId, key: 'email' } }),
      smsService.getResolvedConfig(req.tenantId),
    ]);
    merged.receiptChannelsAvailable = {
      sms: !!smsResolved,
      whatsapp: !!(whatsappSetting?.value?.enabled),
      email: !!(emailSetting?.value?.enabled)
    };

    const { getSaleReceiptAutomationCoverage } = require('../services/customerNotificationBridgeService');
    merged.automationReceiptCoverage = await getSaleReceiptAutomationCoverage(req.tenantId);

    res.status(200).json({ success: true, data: merged });
  } catch (error) {
    next(error);
  }
};

// @desc    Update POS config
// @route   PUT /api/settings/pos-config
// @access  Private
exports.updatePOSConfig = async (req, res, next) => {
  try {
    const existing = await getSettingValue(req.tenantId, 'pos_config', POS_CONFIG_DEFAULTS);
    const incoming = sanitizePayload(req.body || {});

    const receipt = { ...(existing.receipt || {}), ...(incoming.receipt || {}) };
    if (receipt.mode && !VALID_RECEIPT_MODES.includes(receipt.mode)) {
      return res.status(400).json({ success: false, message: 'Invalid receipt mode' });
    }
    if (receipt.channels) {
      if (!Array.isArray(receipt.channels)) {
        return res.status(400).json({ success: false, message: 'channels must be an array' });
      }
      const invalid = receipt.channels.filter((c) => !VALID_CHANNELS.includes(c));
      if (invalid.length) {
        return res.status(400).json({ success: false, message: `Invalid channels: ${invalid.join(', ')}` });
      }
    }

    const print = { ...(existing.print || {}), ...(incoming.print || {}) };
    if (print.format && !VALID_PRINT_FORMATS.includes(print.format)) {
      return res.status(400).json({ success: false, message: 'Invalid print format' });
    }
    if (print.fontSize && !VALID_FONT_SIZES.includes(print.fontSize)) {
      return res.status(400).json({ success: false, message: 'Invalid font size' });
    }
    if (['thermal_58', 'thermal_80'].includes(print.format)) {
      print.showLogo = false;
      print.color = false;
      print.fontSize = 'small';
    }

    const customer = { ...(existing.customer || {}), ...(incoming.customer || {}) };
    if (typeof customer.phoneRequired !== 'undefined') {
      customer.phoneRequired = Boolean(customer.phoneRequired);
    }
    if (typeof customer.nameRequired !== 'undefined') {
      customer.nameRequired = Boolean(customer.nameRequired);
    }

    const scanning = { ...(existing.scanning || POS_CONFIG_DEFAULTS.scanning), ...(incoming.scanning || {}) };
    if (typeof scanning.enabled !== 'undefined') {
      scanning.enabled = Boolean(scanning.enabled);
    }
    if (typeof scanning.allowManualBarcodeEntry !== 'undefined') {
      scanning.allowManualBarcodeEntry = Boolean(scanning.allowManualBarcodeEntry);
    }
    if (typeof scanning.allowExternalScanner !== 'undefined') {
      scanning.allowExternalScanner = Boolean(scanning.allowExternalScanner);
    }

    const merged = { receipt, print, customer, scanning };
    const updated = await upsertSettingValue(req.tenantId, 'pos_config', merged, 'POS and checkout configuration');
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc    Test Email connection
// @route   POST /api/settings/email/test
// @access  Private
exports.testEmailConnection = async (req, res, next) => {
  try {
    const config = sanitizePayload(req.body);
    const provider = config.provider || 'smtp';
    const emailService = require('../services/emailService');
    const diag = emailService.getConfigDiagnostic(config);
    console.log('[Email Test][request_body_received]', {
      requestId: req.id || req.headers?.['x-request-id'],
      tenantId: req.tenantId,
      userId: req.user?.id,
      provider,
      smtpHost: config.smtpHost || 'n/a',
      smtpUser: diag.smtpUserMasked,
      fromEmail: diag.fromEmailMasked,
      fromMatchesSmtpUser: diag.fromMatchesSmtpUser,
      hasPassword: !!config.smtpPassword,
      hasSendgridApiKey: !!config.sendgridApiKey,
      hasSesSecret: !!config.sesSecretAccessKey,
    });

    if (!config.provider) {
      console.log('[Email Test] Rejected: provider missing');
      return res.status(400).json({
        success: false,
        message: 'Provider is required'
      });
    }

    const result = await emailService.testConnection(config, {
      context: {
        requestId: req.id || req.headers?.['x-request-id'],
        tenantId: req.tenantId,
        userId: req.user?.id,
        source: 'settings_email_request_body_test',
        mode: 'verify',
      },
    });

    if (result.success) {
      console.log('[Email Test] Success: provider=%s', provider);
      res.status(200).json({
        success: true,
        message: 'Connection successful',
        data: result.data
      });
    } else {
      console.log('[Email Test] Failed: provider=%s, error=%s', provider, emailService.maskEmailsInText(result.error));
      res.status(400).json({
        success: false,
        message: 'Connection failed',
        error: result.error
      });
    }
  } catch (error) {
    const emailService = require('../services/emailService');
    const err = emailService.summarizeProviderError(error);
    console.error('[Email Test][request_body_exception]', {
      requestId: req.id || req.headers?.['x-request-id'],
      tenantId: req.tenantId,
      userId: req.user?.id,
      code: err.code,
      responseCode: err.responseCode,
      command: err.command,
      message: err.message,
      response: err.response,
    });
    next(error);
  }
};

// @desc    Get Paystack banks (for payment collection / subaccount setup)
// @route   GET /api/settings/payment-collection/banks
// @query   country (optional) - 'nigeria' | 'ghana'. If omitted, tries Nigeria then Ghana.
// @access  Private
exports.getPaymentCollectionBanks = async (req, res, next) => {
  const logId = `get-banks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logPrefix = '[Payment Collection] GET /banks';
  try {
    console.log(`${logPrefix} [${logId}] STEP 1: Handler entered`, { tenantId: req.tenantId, query: req.query });
    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      console.warn(`${logPrefix} [${logId}] STEP 2: Abort – PAYSTACK_SECRET_KEY missing`);
      return res.status(503).json({
        success: false,
        message: 'Paystack is not configured'
      });
    }
    const country = (req.query.country || process.env.PAYSTACK_BANK_COUNTRY || '').toLowerCase();
    console.log(`${logPrefix} [${logId}] STEP 2: Calling Paystack listBanks`, { country: country || '(empty)' });

    const extractBanks = (result) => {
      if (Array.isArray(result)) return result;
      if (Array.isArray(result?.data)) return result.data;
      return [];
    };

    let banks = [];

    if (country === 'nigeria') {
      console.log(`${logPrefix} [${logId}] STEP 3a: listBanks(country=nigeria)`);
      const result = await paystackService.listBanks({ country: 'nigeria' });
      banks = extractBanks(result);
      console.log(`${logPrefix} [${logId}] STEP 3a done: Nigeria banks`, { count: banks.length });
    } else if (country === 'ghana') {
      console.log(`${logPrefix} [${logId}] STEP 3b: listBanks(country=ghana) – attempt 1`);
      let result = await paystackService.listBanks({ country: 'ghana' });
      banks = extractBanks(result);
      console.log(`${logPrefix} [${logId}] STEP 3b attempt 1 done:`, { rawCount: banks.length, types: [...new Set((banks || []).map((b) => b.type))] });
      if (banks.length === 0) {
        console.log(`${logPrefix} [${logId}] STEP 3b: listBanks(ghana, GHS) – attempt 2`);
        result = await paystackService.listBanks({ country: 'ghana', currency: 'GHS' });
        banks = extractBanks(result);
        console.log(`${logPrefix} [${logId}] STEP 3b attempt 2 done:`, { rawCount: banks.length });
      }
      if (banks.length === 0) {
        console.log(`${logPrefix} [${logId}] STEP 3b: listBanks(ghana, ghipps) – attempt 3`);
        result = await paystackService.listBanks({ country: 'ghana', type: 'ghipps' });
        banks = extractBanks(result);
        console.log(`${logPrefix} [${logId}] STEP 3b attempt 3 done:`, { rawCount: banks.length });
      }
      // For "Bank" option, show only bank channels (not mobile_money); prefer GHS to avoid duplicate names
      const bankType = (t) => (t || '').toLowerCase() === 'ghipss' || (t || '').toLowerCase() === 'ghipps';
      const beforeFilter = banks.length;
      const typesBefore = [...new Set((banks || []).map((b) => b.type))];
      banks = banks.filter((b) => bankType(b.type));
      console.log(`${logPrefix} [${logId}] STEP 3b filter: ghipss/ghipps`, { beforeFilter, afterFilter: banks.length, typesInResponse: typesBefore });
      if (banks.length > 0) {
        const ghsOnly = banks.filter((b) => (b.currency || '').toUpperCase() === 'GHS');
        if (ghsOnly.length > 0) banks = ghsOnly;
        console.log(`${logPrefix} [${logId}] STEP 3b final (GHS preferred):`, { count: banks.length });
      }
    } else {
      console.log(`${logPrefix} [${logId}] STEP 3c: listBanks(country=nigeria) fallback`);
      let result = await paystackService.listBanks({ country: 'nigeria' });
      banks = extractBanks(result);
      console.log(`${logPrefix} [${logId}] STEP 3c Nigeria:`, { count: banks.length });
      if (banks.length === 0) {
        result = await paystackService.listBanks({ country: 'ghana' });
        banks = extractBanks(result);
        const bankType = (t) => (t || '').toLowerCase() === 'ghipss' || (t || '').toLowerCase() === 'ghipps';
        banks = banks.filter((b) => bankType(b.type));
        console.log(`${logPrefix} [${logId}] STEP 3c Ghana fallback:`, { count: banks.length });
      }
    }

    if (banks.length === 0) {
      console.warn(`${logPrefix} [${logId}] STEP 4: No banks – result empty. Check PAYSTACK_SECRET_KEY and Paystack dashboard (Ghana support, API shape).`);
    } else {
      console.log(`${logPrefix} [${logId}] STEP 4: Success`, { country: country || 'auto', banksReturned: banks.length });
    }
    res.status(200).json({ success: true, data: banks });
  } catch (error) {
    const status = error?.response?.status;
    const body = error?.response?.data;
    const isHtml = typeof body === 'string' && (body && (body.includes('<html') || body.includes('Just a moment')));
    const isPaystackDenied = status === 403 || status === 401;
    console.warn(`${logPrefix} [${logId}] STEP ERROR: Paystack error caught in controller (returning empty list):`, {
      where: 'getPaymentCollectionBanks',
      message: error?.message,
      responseStatus: status,
      isCloudflareHtml: isHtml,
      ...(isHtml ? { note: 'Response body is Cloudflare challenge – check PAYSTACK_BASE_URL is https://api.paystack.co (not .com)' } : { responseDataSummary: typeof body === 'object' && body?.message ? body.message : (typeof body === 'string' ? body.slice(0, 150) : body) })
    });
    // Return 200 with empty list so UI (e.g. MoMo-only flow) does not break; Paystack 403/401 often when key invalid or region restricted
    res.status(200).json({ success: true, data: [], _message: isPaystackDenied ? 'Banks list unavailable' : undefined });
  }
};

// @desc    Get payment collection settings (masked; for receive payments / subaccount)
// @route   GET /api/settings/payment-collection
// @access  Private
exports.getPaymentCollectionSettings = async (req, res, next) => {
  try {
    const { findTenantWithOptionalColumns } = require('../utils/tenantUtils');
    const tenant = await findTenantWithOptionalColumns(req.tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }
    const pc = tenant.metadata?.paymentCollection || {};
    const accountNumber = pc.account_number || '';
    const momoPhone = pc.momoPhone || pc.momo_phone || '';
    const explicitMomo = pc.settlementType === 'momo' || pc.settlement_type === 'momo';
    const hasMomoMeta = Boolean(momoPhone || explicitMomo);
    const hasBankMeta = Boolean(pc.bank_code && accountNumber);
    const subaccountLinked = Boolean(tenant.paystackSubaccountCode);
    let settlementType = null;
    if (subaccountLinked || hasBankMeta || hasMomoMeta) {
      settlementType = explicitMomo || (hasMomoMeta && !hasBankMeta) ? 'momo' : 'bank';
    }
    const { getMtnCollectionPublicSummary } = require('../services/tenantMomoCollectionService');
    let mtn_collection = {
      configured: false,
      merchantId: '',
      hasApiCredentials: false,
      environment: '',
      collectionApiUrl: '',
      callbackUrl: '',
      subscriptionKeyMasked: '',
      apiUserMasked: '',
      encryptionConfigured: false,
      platformFallbackAvailable: false,
      activeSource: 'none'
    };
    try {
      mtn_collection = getMtnCollectionPublicSummary(tenant);
    } catch (mtnErr) {
      console.error('[Payment Collection] mtn_collection summary failed:', mtnErr?.message || mtnErr);
    }

    const { getHubtelCollectionPublicSummary } = require('../services/tenantHubtelCollectionService');
    let hubtel_collection = {
      configured: false,
      clientIdMasked: '',
      merchantAccountNumber: '',
      posSalesId: '',
      encryptionConfigured: false
    };
    try {
      hubtel_collection = getHubtelCollectionPublicSummary(tenant);
    } catch (hubtelErr) {
      console.error('[Payment Collection] hubtel_collection summary failed:', hubtelErr?.message || hubtelErr);
    }

    const mtnConfigured =
      Boolean(mtn_collection?.configured) ||
      Boolean(mtn_collection?.merchantId) ||
      mtn_collection?.activeSource === 'tenant';
    const hubtelConfigured = Boolean(hubtel_collection?.configured);
    const configured =
      subaccountLinked || hasMomoMeta || hasBankMeta || mtnConfigured || hubtelConfigured;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Payment Collection] GET: tenantId=', req.tenantId, 'pcKeys=', Object.keys(pc), 'settlementType=', settlementType, 'configured=', configured, 'hasSubaccount=', subaccountLinked || hasBankMeta);
    }
    const safe = {
      business_name: pc.business_name || '',
      bank_code: pc.bank_code || '',
      bank_name: pc.bank_name || '',
      account_number_masked: accountNumber ? `****${accountNumber.slice(-4)}` : '',
      primary_contact_email: pc.primary_contact_email || '',
      hasSubaccount: subaccountLinked || hasBankMeta,
      settlement_type: settlementType,
      momo_phone_masked: momoPhone ? `****${momoPhone.slice(-4)}` : '',
      momo_provider: pc.momoProvider || '',
      configured,
      mtn_collection,
      hubtel_collection
    };
    res.status(200).json({ success: true, data: safe });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify account password only. Google accounts must use email OTP instead.
// @route   POST /api/settings/payment-collection/verify-password
// @access  Private (admin, manager)
exports.verifyPaymentCollectionPassword = async (req, res, next) => {
  try {
    const user = await findPaymentVerificationUser(req.user.id);
    if (!user) {
      console.log('[Payment OTP] verify-password: rejected (user not found)', req.user?.id);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const isGoogleUser = Boolean(user.googleId);
    if (isGoogleUser) {
      console.log('[Payment OTP] verify-password: rejected for Google user userId=', req.user?.id);
      return res.status(400).json({
        success: false,
        message: 'Use the email verification code for your Google account',
        data: { passwordRequired: false, otpRequired: true, authMethod: 'otp' },
      });
    }
    const { password } = sanitizePayload(req.body);
    if (!password || typeof password !== 'string') {
      console.log('[Payment OTP] verify-password: rejected (missing password)');
      return res.status(400).json({ success: false, message: 'Password is required' });
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      console.log('[Payment OTP] verify-password: rejected (invalid password) userId=', req.user?.id);
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }
    console.log('[Payment OTP] verify-password: success userId=', req.user?.id);
    res.status(200).json({
      success: true,
      message: 'Password verified',
      data: { passwordRequired: true, authMethod: 'password' },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send OTP to user email for payment integration (add/update). Requires password (step 2 after verify-password).
// @route   POST /api/settings/payment-collection/send-otp
// @access  Private (admin, manager)
exports.sendPaymentCollectionOtp = async (req, res, next) => {
  try {
    console.log('[Payment OTP] send-otp: request userId=', req.user?.id);
    const user = await findPaymentVerificationUser(req.user.id);
    if (!user) {
      console.log('[Payment OTP] send-otp: rejected (user not found)');
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!user.email || typeof user.email !== 'string') {
      console.log('[Payment OTP] send-otp: rejected (missing account email) userId=', req.user?.id);
      return res.status(400).json({ success: false, message: 'Your account email is required to send a verification code' });
    }
    const isGoogleUser = Boolean(user.googleId);
    if (!isGoogleUser) {
      const { password } = sanitizePayload(req.body);
      if (!password || typeof password !== 'string') {
        console.log('[Payment OTP] send-otp: rejected (missing password)');
        return res.status(400).json({ success: false, message: 'Password is required' });
      }
      const valid = await user.comparePassword(password);
      if (!valid) {
        console.log('[Payment OTP] send-otp: rejected (invalid password)');
        return res.status(401).json({ success: false, message: 'Invalid password' });
      }
    } else {
      console.log('[Payment OTP] send-otp: password skipped for Google user userId=', req.user?.id);
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + PAYMENT_OTP_TTL_MS;
    await setStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id, otp, expiresAt });
    console.log('[Payment OTP] send-otp: stored OTP for userId=', req.user?.id, 'expiresAt=', new Date(expiresAt).toISOString());

    const emailService = require('../services/emailService');
    const { emailOtpCode } = require('../services/emailTemplates');
    const { subject, html, text } = emailOtpCode({
      userName: user.name || user.email || 'there',
      code: otp,
      purpose: 'Use this code to confirm changes to payment collection settings.',
      minutesValid: 10,
      company: { name: process.env.APP_NAME || 'African Business Suite' }
    });
    const emailResult = await emailService.sendPlatformMessage(user.email, subject, html, text, [], {
      categories: ['payment-collection-otp'],
      context: {
        requestId: req.requestId,
        tenantId: req.tenantId,
        userId: req.user.id,
        source: 'payment_collection_otp',
      },
    });
    if (!emailResult?.success) {
      await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
      console.log('[Payment OTP] send-otp: email provider rejected send userId=', req.user?.id, 'reason=', emailResult?.error || 'unknown');
      return res.status(503).json({
        success: false,
        message: 'Could not send verification code. Please contact support or try again later.',
      });
    }
    console.log('[Payment OTP] send-otp: email sent to', user.email ? `${user.email.slice(0, 3)}***` : '?');
    res.status(200).json({ success: true, message: 'Verification code sent to your email' });
  } catch (error) {
    console.log('[Payment OTP] send-otp: error', error?.message || error);
    next(error);
  }
};

// @desc    Verify OTP only (does not consume OTP; used so frontend can gate "pass stage" until code is correct).
// @route   POST /api/settings/payment-collection/verify-otp
// @access  Private (admin, manager)
exports.verifyPaymentCollectionOtp = async (req, res, next) => {
  try {
    console.log('[Payment OTP] verify-otp: request userId=', req.user?.id);
    const { password, otp } = req.body || {};
    if (!otp || typeof otp !== 'string') {
      console.log('[Payment OTP] verify-otp: rejected (missing otp)');
      return res.status(400).json({ success: false, message: 'Verification code is required' });
    }
    const user = await findPaymentVerificationUser(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const isGoogleUser = Boolean(user.googleId);
    if (!isGoogleUser) {
      if (!password || typeof password !== 'string') {
        console.log('[Payment OTP] verify-otp: rejected (missing password)');
        return res.status(400).json({ success: false, message: 'Password is required' });
      }
      const valid = await user.comparePassword(password);
      if (!valid) {
        console.log('[Payment OTP] verify-otp: rejected (invalid password)');
        return res.status(401).json({ success: false, message: 'Invalid password' });
      }
    } else {
      console.log('[Payment OTP] verify-otp: password skipped for Google user userId=', req.user?.id);
    }
    const stored = await getStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
    if (!stored || typeof stored.otp !== 'string') {
      console.log('[Payment OTP] verify-otp: rejected (no stored OTP)');
      return res.status(400).json({ success: false, message: 'Verification code expired or not requested. Request a new code.' });
    }
    if (Date.now() > stored.expiresAt) {
      await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
      console.log('[Payment OTP] verify-otp: rejected (expired)');
      return res.status(400).json({ success: false, message: 'Verification code expired. Request a new code.' });
    }
    const expectedOtp = String(stored.otp).replace(/\D/g, '').slice(0, 6);
    const receivedOtp = String(otp || '').replace(/\D/g, '').slice(0, 6);
    if (expectedOtp.length !== 6 || receivedOtp.length !== 6 || receivedOtp !== expectedOtp) {
      console.log('[Payment OTP] verify-otp: rejected (invalid code) receivedLen=', receivedOtp.length, 'match=', receivedOtp === expectedOtp);
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }
    await markPaymentOtpVerified({ tenantId: req.tenantId, userId: req.user.id });
    console.log('[Payment OTP] verify-otp: success (OTP correct, verified until save) userId=', req.user?.id);
    res.status(200).json({ success: true, message: 'Verification code correct' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update payment collection settings and create Paystack subaccount (bank or MoMo settlement)
// @route   PUT /api/settings/payment-collection
// @access  Private (admin, manager)
exports.updatePaymentCollectionSettings = async (req, res, next) => {
  try {
    const { password, otp, ...restBody } = req.body || {};
    console.log('[Payment Collection] PUT: start userId=', req.user?.id, 'tenantId=', req.tenantId, 'bodyKeys=', Object.keys(req.body || {}).filter(k => k !== 'password' && k !== 'otp'), 'settlement_type(raw)=', restBody?.settlement_type ?? restBody?.settlementType);
    const user = await findPaymentVerificationUser(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const isGoogleUser = Boolean(user.googleId);
    if (!isGoogleUser) {
      if (!password || typeof password !== 'string') {
        console.log('[Payment Collection] PUT: rejected (missing password)');
        return res.status(400).json({ success: false, message: 'Password is required to update payment settings' });
      }
      const valid = await user.comparePassword(password);
      if (!valid) {
        console.log('[Payment Collection] PUT: rejected (invalid password)');
        return res.status(401).json({ success: false, message: 'Invalid password' });
      }
    } else {
      const gate = await verifyStoredPaymentOtp({ ...req, body: { ...(req.body || {}), otp } });
      if (!gate.ok) {
        console.log('[Payment Collection] PUT: rejected (Google OTP gate)', gate.message);
        return res.status(gate.status).json({ success: false, message: gate.message });
      }
      console.log('[Payment Collection] PUT: OTP verified for Google user userId=', req.user?.id);
    }

    const { findTenantWithOptionalColumns } = require('../utils/tenantUtils');
    const tenant = await findTenantWithOptionalColumns(req.tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }
    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(503).json({
        success: false,
        message: 'Paystack is not configured'
      });
    }
    const payload = sanitizePayload(restBody);
    const settlement_type = (payload.settlement_type || payload.settlementType || '').toLowerCase();
    console.log('[Payment Collection] PUT: payload keys=', Object.keys(payload), 'settlement_type=', settlement_type, 'tenant.paystackSubaccountCode=', !!tenant.paystackSubaccountCode, 'value=', tenant.paystackSubaccountCode ? `${String(tenant.paystackSubaccountCode).slice(0, 8)}...` : null);

    if (tenant.paystackSubaccountCode) {
      console.log('[Payment Collection] PUT: rejected (settlement already linked) tenantId=', req.tenantId);
      return res.status(400).json({
        success: false,
        message: 'A payout destination is already linked. Contact support to change it.'
      });
    }

    if (settlement_type === 'momo') {
      console.log('[Payment Collection] PUT: entering MoMo branch');
      const { business_name, momo_phone, momo_provider, primary_contact_email } = payload;
      const momoPhone = typeof momo_phone === 'string' ? momo_phone.replace(/\s/g, '') : '';
      const momoProvider = (momo_provider || payload.momoProvider || '').toUpperCase().replace(/\s/g, '');
      console.log('[Payment Collection] PUT MoMo: extracted business_name=', business_name ? `${String(business_name).slice(0, 30)}...` : null, 'momo_phone(len)=', momoPhone.length, 'momo_provider=', momoProvider, 'primary_contact_email=', primary_contact_email ? 'set' : 'unset');
      if (!business_name || typeof business_name !== 'string' || !business_name.trim()) {
        console.log('[Payment Collection] PUT MoMo: rejected (missing business_name)');
        return res.status(400).json({ success: false, message: 'Business / account name is required' });
      }
      if (!momoPhone || momoPhone.length < 9) {
        console.log('[Payment Collection] PUT MoMo: rejected (invalid momo_phone) len=', momoPhone.length);
        return res.status(400).json({ success: false, message: 'MoMo phone number is required (e.g. 0XXXXXXXXX or 233XXXXXXXXX)' });
      }
      if (!['MTN', 'AIRTEL', 'TELECEL', 'VODAFONE'].includes(momoProvider)) {
        console.log('[Payment Collection] PUT MoMo: rejected (invalid momo_provider)', momoProvider);
        return res.status(400).json({
          success: false,
          message: 'MoMo provider must be MTN, AirtelTigo Money, or Vodafone Cash'
        });
      }
      const normalizedPhone = momoPhone.replace(/^\+?233/, '0');
      const momoBankCode = paystackService.getMoMoBankCode(momoProvider);
      const momoPutLogId = `put-momo-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.log('[Payment Collection] PUT [' + momoPutLogId + '] MoMo: calling Paystack createSubaccount (MoMo settlement)', {
        tenantId: req.tenantId,
        momo_bank_code: momoBankCode,
        phone_len: normalizedPhone.length
      });
      let momoSubResult;
      try {
        momoSubResult = await paystackService.createSubaccount({
          business_name: business_name.trim(),
          bank_code: momoBankCode,
          account_number: normalizedPhone,
          primary_contact_email: primary_contact_email && String(primary_contact_email).trim() ? String(primary_contact_email).trim() : undefined,
          currency: 'GHS'
        });
      } catch (momoSubErr) {
        const status = momoSubErr?.response?.status;
        const msg = paystackService.userFacingPaystackErrorMessage(momoSubErr);
        console.warn('[Payment Collection] PUT [' + momoPutLogId + '] MoMo createSubaccount failed', {
          responseStatus: status,
          message: msg || momoSubErr?.message
        });
        return res.status(502).json({
          success: false,
          message: msg || 'MoMo wallet could not be linked with Paystack. Check the number and network, or try bank settlement.'
        });
      }

      const subaccountCode = momoSubResult?.data?.subaccount_code || momoSubResult?.subaccount_code;
      const isValidMomoSub = typeof subaccountCode === 'string' && subaccountCode.trim().length > 0 && subaccountCode.startsWith('ACCT_');
      if (!isValidMomoSub) {
        console.warn('[Payment Collection] PUT MoMo: no valid subaccount_code from Paystack', { hasData: !!momoSubResult?.data });
        return res.status(502).json({
          success: false,
          message: momoSubResult?.message || momoSubResult?.data?.message || 'MoMo wallet was not linked. Paystack did not return a subaccount.'
        });
      }

      const paymentCollection = {
        ...(tenant.metadata?.paymentCollection || {}),
        settlementType: 'momo',
        business_name: business_name.trim(),
        momoPhone: normalizedPhone,
        momoProvider,
        primary_contact_email: primary_contact_email && String(primary_contact_email).trim() ? String(primary_contact_email).trim() : undefined
      };
      tenant.paystackSubaccountCode = subaccountCode.trim();
      tenant.metadata = { ...(tenant.metadata || {}), paymentCollection };
      await tenant.save({ fields: ['metadata', 'paystackSubaccountCode'] });
      await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
      invalidateTenantSettingsCache(req.tenantId);
      console.log('[Payment Collection] PUT: success MoMo subaccount linked tenantId=', req.tenantId, 'provider=', momoProvider);

      const emailService = require('../services/emailService');
      const { paystackMomoLinkedEmail } = require('../services/emailTemplates');
      const toEmail = user?.email || tenant.metadata?.paymentCollection?.primary_contact_email;
      if (toEmail) {
        const last4 = normalizedPhone.slice(-4);
        const { subject, html, text } = paystackMomoLinkedEmail(
          { businessName: (business_name || '').trim(), last4Digits: last4 },
          { name: process.env.APP_NAME || 'African Business Suite' }
        );
        const emailResult = await emailService.sendPlatformMessage(toEmail, subject, html, text);
        if (!emailResult?.success) {
          console.warn('[Payment Collection] PUT MoMo: confirmation email failed', emailResult?.error || '');
        }
      }

      const safe = {
        business_name: tenant.metadata.paymentCollection.business_name,
        settlement_type: 'momo',
        momo_phone_masked: `****${normalizedPhone.slice(-4)}`,
        momo_provider: tenant.metadata.paymentCollection.momoProvider,
        primary_contact_email: tenant.metadata.paymentCollection.primary_contact_email || '',
        hasSubaccount: true
      };
      return res.status(200).json({
        success: true,
        message: 'MoMo wallet linked. Paystack will settle your share of card and MoMo payments to this number.',
        data: safe
      });
    }

    console.log('[Payment Collection] PUT: not MoMo, continuing with bank branch settlement_type=', settlement_type);
    const { business_name, bank_code, account_number, bank_name, primary_contact_email } = payload;

    if (!business_name || typeof business_name !== 'string' || !business_name.trim()) {
      return res.status(400).json({ success: false, message: 'Business / account name is required' });
    }
    if (!bank_code || typeof bank_code !== 'string' || !bank_code.trim()) {
      return res.status(400).json({ success: false, message: 'Bank is required' });
    }
    if (!account_number || typeof account_number !== 'string') {
      return res.status(400).json({ success: false, message: 'Account number is required' });
    }
    const accountNumberStr = String(account_number).replace(/\s/g, '');
    if (accountNumberStr.length < 8) {
      return res.status(400).json({ success: false, message: 'Account number is too short' });
    }

    const putLogId = `put-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log('[Payment Collection] PUT [' + putLogId + '] STEP 1: Calling Paystack createSubaccount', {
      tenantId: req.tenantId,
      business_name: business_name ? `${String(business_name).slice(0, 25)}...` : undefined,
      bank_code: bank_code ? `${String(bank_code).slice(0, 6)}...` : undefined,
      account_number_length: accountNumberStr.length
    });
    let result;
    try {
      result = await paystackService.createSubaccount({
        business_name: business_name.trim(),
        bank_code: bank_code.trim(),
        account_number: accountNumberStr,
        primary_contact_email: primary_contact_email && String(primary_contact_email).trim() ? String(primary_contact_email).trim() : undefined
      });
      console.log('[Payment Collection] PUT [' + putLogId + '] STEP 2: createSubaccount returned', { hasResult: !!result, hasSubaccountCode: !!(result?.data?.subaccount_code || result?.subaccount_code) });
    } catch (subaccountErr) {
      const status = subaccountErr?.response?.status;
      const body = subaccountErr?.response?.data;
      const isHtml = paystackService.paystackResponseIsUnusableHtml(body);
      const msg = paystackService.userFacingPaystackErrorMessage(subaccountErr);
      console.warn('[Payment Collection] PUT [' + putLogId + '] STEP ERROR: createSubaccount failed', {
        where: 'updatePaymentCollectionSettings (bank branch)',
        responseStatus: status,
        message: msg || subaccountErr?.message,
        isCloudflareHtml: isHtml,
        url: subaccountErr?.config?.url
      });
      return res.status(502).json({
        success: false,
        message: msg || 'Bank account could not be linked. Please check details and try again, or use MoMo.'
      });
    }

    const subaccountCode = result?.data?.subaccount_code || result?.subaccount_code;
    const isValidSubaccountCode = typeof subaccountCode === 'string' && subaccountCode.trim().length > 0 && subaccountCode.startsWith('ACCT_');
    if (!isValidSubaccountCode) {
      console.warn('[Payment Collection] PUT: no valid subaccount_code in Paystack response', { hasData: !!result?.data, hasCode: !!subaccountCode });
      return res.status(502).json({
        success: false,
        message: result?.message || result?.data?.message || 'Bank account was not linked. Paystack did not return a subaccount. Please try again or use MoMo.'
      });
    }

    tenant.paystackSubaccountCode = subaccountCode.trim();
    const paymentCollectionBank = {
      ...(tenant.metadata?.paymentCollection || {}),
      settlementType: 'bank',
      business_name: business_name.trim(),
      bank_code: bank_code.trim(),
      bank_name: bank_name && String(bank_name).trim() ? String(bank_name).trim() : undefined,
      account_number: accountNumberStr,
      primary_contact_email: primary_contact_email && String(primary_contact_email).trim() ? String(primary_contact_email).trim() : undefined
    };
    tenant.metadata = { ...(tenant.metadata || {}), paymentCollection: paymentCollectionBank };
    await tenant.save({ fields: ['metadata', 'paystackSubaccountCode'] });
    await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
    invalidateTenantSettingsCache(req.tenantId);
    console.log('[Payment Collection] PUT: success bank linked tenantId=', req.tenantId, 'subaccountCode=', subaccountCode ? `${subaccountCode.slice(0, 8)}...` : '?');

    const emailService = require('../services/emailService');
    const { paystackBankLinkedEmail } = require('../services/emailTemplates');
    const toEmail = user?.email || tenant.metadata?.paymentCollection?.primary_contact_email;
    if (toEmail) {
      const last4 = accountNumberStr.slice(-4);
      const { subject, html, text } = paystackBankLinkedEmail(
        { businessName: (business_name || '').trim(), last4Digits: last4 },
        { name: process.env.APP_NAME || 'African Business Suite' }
      );
      const emailResult = await emailService.sendPlatformMessage(toEmail, subject, html, text);
      if (emailResult?.success) {
        console.log('[Payment Collection] PUT: confirmation email sent to', toEmail.substring(0, 6) + '***');
      } else {
        console.warn('[Payment Collection] PUT: failed to send confirmation email', emailResult?.error || '');
      }
    }

    const safe = {
      business_name: tenant.metadata.paymentCollection.business_name,
      bank_code: tenant.metadata.paymentCollection.bank_code,
      bank_name: tenant.metadata.paymentCollection.bank_name,
      account_number_masked: `****${accountNumberStr.slice(-4)}`,
      primary_contact_email: tenant.metadata.paymentCollection.primary_contact_email || '',
      hasSubaccount: true,
      settlement_type: 'bank'
    };
    res.status(200).json({
      success: true,
      message: 'Bank account linked. You will receive your share of card/MoMo payments here.',
      data: safe
    });
  } catch (error) {
    const paystackServiceFinal = require('../services/paystackService');
    const status = error?.response?.status;
    const body = error?.response?.data;
    const paystackMsg =
      paystackServiceFinal.userFacingPaystackErrorMessage(error) ||
      (typeof body === 'object' && body?.message && typeof body.message === 'string' && !paystackServiceFinal.paystackResponseIsUnusableHtml(body.message)
        ? body.message
        : null);
    const isHtml = paystackServiceFinal.paystackResponseIsUnusableHtml(body);
    console.error('[Payment Collection] PUT: ERROR (final catch):', {
      where: 'updatePaymentCollectionSettings',
      tenantId: req?.tenantId,
      message: error?.message,
      name: error?.name,
      responseStatus: status,
      isPaystackResponse: !!error?.response,
      isCloudflareHtml: isHtml,
      paystackMessage: paystackMsg || undefined
    });
    if (status === 400 && paystackMsg) {
      return res.status(400).json({
        success: false,
        message: paystackMsg
      });
    }
    if (error?.response) {
      return res.status(502).json({
        success: false,
        message: paystackMsg || 'Payment collection could not be updated. Please try again.'
      });
    }
    next(error);
  }
};

// @desc    Connect MTN Merchant ID (and optional Collection API credentials) for this tenant
// @route   PUT /api/settings/mtn-collection-credentials
// @access  Private (admin, manager)
exports.updateMtnCollectionCredentials = async (req, res, next) => {
  try {
    const {
      merchantId,
      subscriptionKey,
      apiUser,
      apiKey,
      environment,
      collectionApiUrl,
      callbackUrl
    } = sanitizePayload(req.body || {});

    const gate = await verifyStoredPaymentOtp(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const trimmedMerchantId = merchantId != null ? String(merchantId).trim() : '';
    if (!trimmedMerchantId) {
      return res.status(400).json({
        success: false,
        message: 'Merchant ID is required'
      });
    }

    const providingKeys = Boolean(
      (subscriptionKey && String(subscriptionKey).trim()) ||
      (apiUser && String(apiUser).trim()) ||
      (apiKey && String(apiKey).trim())
    );
    if (providingKeys) {
      if (!subscriptionKey || !apiUser || !apiKey) {
        return res.status(400).json({
          success: false,
          message: 'Subscription key, API user, and API key are all required when saving API credentials'
        });
      }
      const { isEncryptionConfigured } = require('../services/tenantMomoCollectionService');
      if (!isEncryptionConfigured()) {
        return res.status(503).json({
          success: false,
          message:
            'Server is missing MOMO_CREDENTIALS_ENCRYPTION_KEY (64 hex chars). Ask your administrator to configure it.'
        });
      }
    }

    const { saveTenantMtnCollectionCredentials } = require('../services/tenantMomoCollectionService');
    const summary = await saveTenantMtnCollectionCredentials(req.tenantId, {
      merchantId: trimmedMerchantId,
      subscriptionKey,
      apiUser,
      apiKey,
      environment,
      collectionApiUrl,
      callbackUrl
    });
    await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
    res.status(200).json({
      success: true,
      message: 'MTN Merchant ID saved for this workspace.',
      data: summary
    });
  } catch (error) {
    console.error('[Settings] updateMtnCollectionCredentials:', error?.message || error);
    const msg = error?.message || '';
    if (msg.includes('Merchant ID') || msg.includes('API credentials') || msg.includes('encryption')) {
      return res.status(400).json({ success: false, message: msg });
    }
    next(error);
  }
};

// @desc    Test MTN token with credentials from body (does not save; does not consume OTP)
// @route   POST /api/settings/mtn-collection-credentials/test
// @access  Private (admin, manager)
exports.testMtnCollectionCredentials = async (req, res, next) => {
  try {
    const gate = await verifyStoredPaymentOtp(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const {
      subscriptionKey,
      apiUser,
      apiKey,
      environment,
      collectionApiUrl
    } = sanitizePayload(req.body || {});

    if (!subscriptionKey || !apiUser || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Subscription key, API user, and API key are required to test'
      });
    }

    const mobileMoneyService = require('../services/mobileMoneyService');
    const env = String(environment || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    const collectionUrl =
      (collectionApiUrl && String(collectionApiUrl).trim()) ||
      process.env.MTN_MOMO_COLLECTION_URL ||
      'https://sandbox.momodeveloper.mtn.com/collection';

    await mobileMoneyService.mtn.getAccessToken({
      subscriptionKey: String(subscriptionKey).trim(),
      apiUser: String(apiUser).trim(),
      apiKey: String(apiKey).trim(),
      environment: env,
      collectionApiUrl: collectionUrl
    });

    res.status(200).json({
      success: true,
      message: 'MTN MoMo authentication succeeded. You can save these credentials.'
    });
  } catch (error) {
    const msg = error?.message || 'MTN test failed';
    console.error('[Settings] testMtnCollectionCredentials:', msg);
    res.status(400).json({
      success: false,
      message: msg.includes('authenticate') ? msg : `MTN test failed: ${msg}`
    });
  }
};

// @desc    Remove tenant MTN Collection credentials (falls back to server env if configured)
// @route   POST /api/settings/mtn-collection-credentials/disconnect
// @access  Private (admin, manager)
exports.disconnectMtnCollectionCredentials = async (req, res, next) => {
  try {
    const gate = await verifyStoredPaymentOtp(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const { clearTenantMtnCollectionCredentials, getMtnCollectionPublicSummary } = require('../services/tenantMomoCollectionService');
    await clearTenantMtnCollectionCredentials(req.tenantId);
    await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });

    const tenant = await Tenant.findByPk(req.tenantId);
    const summary = tenant ? getMtnCollectionPublicSummary(tenant) : {};

    res.status(200).json({
      success: true,
      message: 'Workspace MTN Merchant ID and credentials removed. Direct MTN charges will use platform keys if set on the server.',
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Save encrypted Hubtel merchant credentials for this tenant (BYO ClientID/Secret)
// @route   PUT /api/settings/hubtel-collection-credentials
// @access  Private (admin, manager)
exports.updateHubtelCollectionCredentials = async (req, res, next) => {
  try {
    const { clientId, clientSecret, merchantAccountNumber, posSalesId } = sanitizePayload(req.body || {});

    const gate = await verifyStoredPaymentOtp(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: 'Client ID and Client Secret are required'
      });
    }

    const {
      isEncryptionConfigured,
      saveTenantHubtelCollectionCredentials
    } = require('../services/tenantHubtelCollectionService');
    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          'Server is missing MOMO_CREDENTIALS_ENCRYPTION_KEY (64 hex chars). Ask your administrator to configure it.'
      });
    }

    const summary = await saveTenantHubtelCollectionCredentials(req.tenantId, {
      clientId,
      clientSecret,
      merchantAccountNumber,
      posSalesId
    });
    await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });
    res.status(200).json({
      success: true,
      message: 'Hubtel credentials saved for this workspace.',
      data: summary
    });
  } catch (error) {
    console.error('[Settings] updateHubtelCollectionCredentials:', error?.message || error);
    next(error);
  }
};

// @desc    Test Hubtel Basic auth with credentials from body (does not save; does not consume OTP)
// @route   POST /api/settings/hubtel-collection-credentials/test
// @access  Private (admin, manager)
exports.testHubtelCollectionCredentials = async (req, res, next) => {
  try {
    const gate = await verifyStoredPaymentOtp(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const { clientId, clientSecret, merchantAccountNumber, posSalesId } = sanitizePayload(req.body || {});

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: 'Client ID and Client Secret are required to test'
      });
    }

    const { testHubtelCredentials } = require('../services/tenantHubtelCollectionService');
    await testHubtelCredentials({
      clientId: String(clientId).trim(),
      clientSecret: String(clientSecret).trim(),
      merchantAccountNumber,
      posSalesId
    });

    res.status(200).json({
      success: true,
      message: 'Hubtel authentication succeeded. You can save these credentials.'
    });
  } catch (error) {
    const msg = error?.message || 'Hubtel test failed';
    console.error('[Settings] testHubtelCollectionCredentials:', msg);
    res.status(400).json({
      success: false,
      message: msg.includes('Hubtel') ? msg : `Hubtel test failed: ${msg}`
    });
  }
};

// @desc    Remove tenant Hubtel collection credentials
// @route   POST /api/settings/hubtel-collection-credentials/disconnect
// @access  Private (admin, manager)
exports.disconnectHubtelCollectionCredentials = async (req, res, next) => {
  try {
    const gate = await verifyStoredPaymentOtp(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const {
      clearTenantHubtelCollectionCredentials,
      getHubtelCollectionPublicSummary
    } = require('../services/tenantHubtelCollectionService');
    await clearTenantHubtelCollectionCredentials(req.tenantId);
    await clearStoredPaymentOtp({ tenantId: req.tenantId, userId: req.user.id });

    const tenant = await Tenant.findByPk(req.tenantId);
    const summary = tenant ? getHubtelCollectionPublicSummary(tenant) : {};

    res.status(200).json({
      success: true,
      message: 'Workspace Hubtel credentials removed.',
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

function parsePaystackTransactionMetadata(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function paystackTransactionBelongsToTenant(tx, tenant) {
  const sub = tx.subaccount;
  const code = sub && (sub.subaccount_code || sub.subaccountCode);
  if (tenant.paystackSubaccountCode && code && String(code) === String(tenant.paystackSubaccountCode)) {
    return true;
  }
  const meta = parsePaystackTransactionMetadata(tx.metadata);
  if (meta) {
    const tid = meta.tenant_id ?? meta.tenantId;
    if (tid != null && String(tid) === String(tenant.id)) return true;
  }
  return false;
}

function maskPaystackCustomerEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***@${email.slice(at + 1)}`;
}

// @desc    Paystack successful transactions attributed to this workspace (subaccount or metadata tenant id)
// @route   GET /api/settings/payment-collection/paystack-transactions
// @access  Private (admin, manager)
exports.getPaystackWorkspaceTransactions = async (req, res, next) => {
  try {
    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      return res.status(503).json({ success: false, message: 'Paystack is not configured' });
    }

    const tenant = await Tenant.findByPk(req.tenantId, {
      attributes: ['id', 'paystackSubaccountCode']
    });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(5, parseInt(req.query.perPage, 10) || 20));
    const maxPaystackPages = Math.min(20, Math.max(1, parseInt(req.query.maxPaystackPages, 10) || 8));

    let fromDay = req.query.from;
    let toDay = req.query.to;
    if (!fromDay || !toDay) {
      const end = new Date();
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - 30);
      if (!fromDay) fromDay = start.toISOString().slice(0, 10);
      if (!toDay) toDay = end.toISOString().slice(0, 10);
    }

    const fromIso = `${fromDay}T00:00:00.000Z`;
    const toIso = `${toDay}T23:59:59.999Z`;

    const collected = [];
    let stoppedByPageLimit = false;
    let paystackPagesScanned = 0;

    for (let p = 1; p <= maxPaystackPages; p += 1) {
      paystackPagesScanned = p;
      let data;
      try {
        // eslint-disable-next-line no-await-in-loop
        data = await paystackService.listTransactions({
          page: p,
          perPage: 50,
          from: fromIso,
          to: toIso,
          status: 'success'
        });
      } catch (err) {
        const status = err?.response?.status;
        const body = err?.response?.data;
        const blocked = paystackService.paystackResponseIsUnusableHtml(body);
        let msg =
          paystackService.userFacingPaystackErrorMessage(err, {
            blocked:
              'Could not load Paystack activity: our server could not reach Paystack (network block). Confirm PAYSTACK_BASE_URL is https://api.paystack.co and try again; if it persists, contact support.'
          }) ||
          err.message ||
          'Paystack request failed';
        if (!blocked && (status === 403 || status === 401)) {
          msg = `${msg} Check PAYSTACK_SECRET_KEY on the server (correct Paystack business, live vs test).`;
        }
        // Use 502 for upstream Paystack errors so 403 is reserved for app RBAC (workspace role).
        return res.status(502).json({ success: false, message: msg, paystackHttpStatus: status });
      }

      if (!data?.status) {
        return res.status(502).json({
          success: false,
          message: typeof data?.message === 'string' ? data.message : 'Paystack returned an error'
        });
      }

      const rows = Array.isArray(data.data) ? data.data : [];
      for (const tx of rows) {
        if (paystackTransactionBelongsToTenant(tx, tenant)) {
          collected.push(tx);
        }
      }

      const meta = data.meta || {};
      const pageCount = meta.pageCount != null ? Number(meta.pageCount) : null;
      if (rows.length === 0) break;
      if (pageCount != null && p >= pageCount) break;
      if (rows.length < 50) break;
      if (p === maxPaystackPages) {
        stoppedByPageLimit = true;
        break;
      }
    }

    collected.sort((a, b) => {
      const da = new Date(a.paid_at || a.paidAt || a.created_at || a.createdAt || 0).getTime();
      const db = new Date(b.paid_at || b.paidAt || b.created_at || b.createdAt || 0).getTime();
      return db - da;
    });

    const currency = collected[0]?.currency || 'GHS';
    let grossSub = 0;
    let feesSub = 0;
    for (const tx of collected) {
      grossSub += Number(tx.amount || 0);
      feesSub += Number(tx.fees || 0);
    }
    const div = 100;
    const summary = {
      successfulCount: collected.length,
      grossVolumeMain: Math.round((grossSub / div) * 100) / 100,
      feesMain: Math.round((feesSub / div) * 100) / 100,
      netEstimateMain: Math.round(((grossSub - feesSub) / div) * 100) / 100,
      currency
    };

    const totalFiltered = collected.length;
    const startIdx = (page - 1) * perPage;
    const slice = collected.slice(startIdx, startIdx + perPage);

    const transactions = slice.map((tx) => ({
      reference: tx.reference,
      paidAt: tx.paid_at || tx.paidAt || null,
      amountMain: Math.round((Number(tx.amount || 0) / div) * 100) / 100,
      feesMain: Math.round((Number(tx.fees || 0) / div) * 100) / 100,
      channel: tx.channel || '',
      status: tx.status || '',
      customerEmail: maskPaystackCustomerEmail(tx.customer?.email)
    }));

    res.status(200).json({
      success: true,
      data: {
        dateRange: { from: fromDay, to: toDay },
        summary,
        pagination: {
          page,
          perPage,
          totalFiltered,
          paystackPagesScanned
        },
        truncated: stoppedByPageLimit,
        attribution: tenant.paystackSubaccountCode
          ? 'Matched Paystack subaccount on this workspace or tenant id in charge metadata.'
          : 'Matched tenant id in charge metadata (invoice/POS). Link a bank subaccount to also match subaccount splits.',
        disclaimer:
          'Amounts are successful Paystack charges tied to this workspace. Payout timing, MoMo transfers, and final settlement are handled by Paystack; use the Paystack dashboard for ledger and transfer details.',
        transactions
      }
    });
  } catch (error) {
    next(error);
  }
};
