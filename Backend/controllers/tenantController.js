const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const config = require('../config/config');
const { Tenant, User, UserTenant, Setting, EmailVerificationToken } = require('../models');
const { seedDefaultCategories, seedDefaultEquipmentCategories } = require('../utils/categorySeeder');
const { seedDefaultChartOfAccounts } = require('../utils/seedAccountingAccounts');
const emailService = require('../services/emailService');
const { emailVerification: emailVerificationTemplate } = require('../services/emailTemplates');
const { notifyAccountCreated, notifyTenantOnboarded } = require('../services/platformAdminNotificationService');
const {
  TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
  buildTermsAcceptanceMetadata,
  isTermsAccepted,
} = require('../utils/legalTerms');
const {
  DEFAULT_SHOP_TYPE,
  normalizeTenantClassification,
} = require('../utils/tenantClassification');
const {
  resolveSignupPlanAssignment,
  buildSignupSubscriptionSettingValue,
} = require('../utils/signupPlanAssignment');

const generateToken = (userId) =>
  jwt.sign({ id: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expire,
  });

const normalizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  return phone.replace(/\s+/g, '').trim();
};

const slugify = (value = '') => {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .substring(0, 150) || `tenant-${Date.now()}`;
};

/**
 * Generate a unique slug for a new tenant.
 * Uses random suffix to avoid DB round-trip – critical for remote DB latency (~100–300ms saved).
 */
const generateUniqueSlug = (name) => {
  const base = slugify(name);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
};

exports.signupTenant = async (req, res, next) => {
  const t0 = Date.now();
  const {
    companyName,
    companyEmail,
    companyPhone,
    companyWebsite,
    adminName,
    adminEmail,
    password,
    businessType, // NEW: business type ('printing_press', 'shop', 'pharmacy')
    shopType, // NEW: shop type (only if businessType is 'shop')
    businessInfo, // NEW: business information object
    acceptedTerms,
    termsVersion,
    agentCode,
    code: referralCode,
  } = req.body || {};

  try {
    if (!adminName || !adminEmail || !password) {
      return res.status(400).json({
        success: false,
        message:
          'Account owner name, email, and password are required to create a business.',
      });
    }

    if (!isTermsAccepted(acceptedTerms)) {
      return res.status(400).json({
        success: false,
        message: TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
      });
    }

    const salesAgentService = require('../services/salesAgentService');
    const requestedAgentCode = agentCode || referralCode || null;
    if (salesAgentService.normalizeAgentCode(requestedAgentCode)) {
      const codeCheck = await salesAgentService.validateAgentCode(requestedAgentCode);
      if (!codeCheck.valid) {
        return res.status(400).json({
          success: false,
          message: codeCheck.error || 'Invalid sales agent code',
          error: codeCheck.error || 'Invalid sales agent code',
          errorCode: codeCheck.errorCode || 'AGENT_CODE_NOT_FOUND',
        });
      }
    }

    const normalizedEmail = adminEmail.trim().toLowerCase();
    // Company name is optional - default to a placeholder if not provided
    const trimmedCompanyName = (companyName?.trim() || 'My Business');
    const trimmedAdminName = adminName.trim();

    const t1 = Date.now();
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[signup] User.findOne:', Date.now() - t1, 'ms');
    }

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          'An account with this email already exists. Please sign in instead.',
      });
    }

    const normalizedCompanyPhone = companyPhone ? normalizePhone(companyPhone) : null;

    if (normalizedCompanyPhone) {
      const existingTenantWithPhone = await Tenant.findOne({
        where: sequelize.where(sequelize.json('metadata.phone'), normalizedCompanyPhone),
      });

      if (existingTenantWithPhone) {
        return res.status(400).json({
          success: false,
          message:
            'This business phone number is already used by another workspace. Use a different phone number.',
        });
      }
    }

    const { SubscriptionPlan } = require('../models');
    const planAssignment = await resolveSignupPlanAssignment({
      req,
      SubscriptionPlan,
    });
    // Channel-driven only — ignore any client-supplied plan body field.
    const initialPlan = planAssignment.planId;
    const trialEndDate = new Date(planAssignment.trialEndsAt);

    const transaction = await sequelize.transaction();

    try {
      const slug = generateUniqueSlug(trimmedCompanyName);

      // Build metadata object with business information
      const metadata = {
        website: companyWebsite || null,
        email: companyEmail || null,
        phone: normalizedCompanyPhone || null,
        signupSource: 'self_service',
        termsAcceptance: buildTermsAcceptanceMetadata(req, {
          source: 'self_service_signup',
          termsVersion,
        }),
        ...planAssignment.metadataExtras,
      };

      // Add shopType to metadata if provided (only for shop business type)
      if (businessType === 'shop' && shopType) {
        metadata.shopType = shopType;
        console.log('[tenant] createTenant businessType=shop shopType=%s (stored in metadata)', shopType);
      } else if (businessType === 'shop' && !shopType) {
        console.log('[tenant] createTenant businessType=shop shopType=missing (no type-specific categories)');
      } else {
        console.log('[tenant] createTenant businessType=%s shopType=n/a', businessType || 'shop');
      }

      // Add businessInfo to metadata if provided
      if (businessInfo) {
        metadata.businessInfo = businessInfo;
      }

      // Resolve business type (legacy types like 'printing_press' become 'studio').
      // When businessType is not provided, default to 'shop' and let onboarding refine it.
      const { resolveBusinessType } = require('../config/businessTypes');
      const finalBusinessType = resolveBusinessType(businessType || 'shop');
      
      // If businessType is a legacy studio type, set studioType in metadata
      if (['printing_press', 'mechanic', 'barber', 'salon'].includes(businessType)) {
        metadata.studioType = businessType;
      }
      if (finalBusinessType === 'shop' && !metadata.shopType) {
        metadata.shopType = metadata.businessSubType || DEFAULT_SHOP_TYPE;
      }

      const tenant = await Tenant.create(
        {
          name: trimmedCompanyName,
          slug,
          plan: initialPlan,
          businessType: finalBusinessType, // Store resolved business type ('shop', 'studio', 'pharmacy')
          status: 'active',
          metadata,
          trialEndsAt: trialEndDate,
        },
        { transaction }
      );

      if (salesAgentService.normalizeAgentCode(requestedAgentCode)) {
        const attribution = await salesAgentService.applyAgentCodeToTenant({
          tenant,
          rawCode: requestedAgentCode,
          transaction,
          requireCode: true,
        });
        if (attribution.trialEndsAt) {
          // Keep local trialEndDate aligned for subscription setting below
          trialEndDate.setTime(attribution.trialEndsAt.getTime());
        }
      }

      // Category seeding moved to after response – runs in background so signup returns quickly

      const user = await User.create(
        {
          name: trimmedAdminName,
          email: normalizedEmail,
          password,
          role: 'admin',
        },
        { transaction }
      );

      const membershipRecord = await UserTenant.create(
        {
          tenantId: tenant.id,
          userId: user.id,
          role: 'owner',
          status: 'active',
          isDefault: true,
          invitedBy: null,
          invitedAt: new Date(),
          joinedAt: new Date(),
          metadata: {
            termsAcceptance: metadata.termsAcceptance,
          },
        },
        { transaction }
      );

      if (finalBusinessType === 'studio') {
        const { StudioLocation, UserStudioLocation } = require('../models');
        const defaultStudio = await StudioLocation.create(
          {
            tenantId: tenant.id,
            name: trimmedCompanyName,
            isDefault: true,
            isActive: true,
          },
          { transaction }
        );
        await UserStudioLocation.create(
          {
            userId: user.id,
            tenantId: tenant.id,
            studioLocationId: defaultStudio.id,
          },
          { transaction }
        );
      }

      if (finalBusinessType === 'shop') {
        const { resolveShopSeedData } = require('../utils/shopUtils');
        const { Shop } = require('../models');
        const shopPayload = await resolveShopSeedData(
          tenant.id,
          {
            name: trimmedCompanyName,
            phone: normalizedCompanyPhone,
            email: companyEmail || normalizedEmail,
            source: 'signup',
          },
          transaction
        );
        if (shopPayload) {
          await Shop.create({ ...shopPayload, tenantId: tenant.id }, { transaction });
        }
      }

      await Setting.bulkCreate(
        [
          {
            tenantId: tenant.id,
            key: 'organization',
            value: {
              name: trimmedCompanyName,
              legalName: trimmedCompanyName,
              email: companyEmail || normalizedEmail,
              phone: normalizedCompanyPhone || '',
              website: companyWebsite || '',
              logoUrl: '',
              address: {
                line1: '',
                city: '',
                state: '',
                country: '',
                postalCode: '',
              },
              tax: {
                vatNumber: '',
                tin: '',
              },
              invoiceFooter: 'Thank you for doing business with us.',
            },
            description: 'Organization profile',
          },
          {
            tenantId: tenant.id,
            key: 'subscription',
            value: buildSignupSubscriptionSettingValue(planAssignment, {
              trialEndsAt: trialEndDate,
              ...(tenant.referredByAgentId
                ? { salesAgentFreeMonths: salesAgentService.AGENT_FREE_MONTHS }
                : {}),
            }),
            description: 'Subscription and billing information',
          },
          {
            tenantId: tenant.id,
            key: 'payroll',
            value: {
              payeRate: 0.1,
              ssnitRate: 0.135,
              currency: 'GHS',
              payCycle: 'monthly',
            },
            description: 'Default payroll configuration',
          },
        ],
        { transaction }
      );

      await transaction.commit();

      // Seed default categories in background so signup responds quickly (~2–3s faster)
      // Pass force=true to bypass cache/flag checks since this is initial onboarding
      const studioType = metadata.studioType || null;
      seedDefaultCategories(tenant.id, finalBusinessType, shopType || null, studioType, true)
        .then(() => console.log(`✅ Seeded default categories for business type: ${finalBusinessType}${studioType ? `/${studioType}` : ''}`))
        .catch((err) => console.error('Error seeding default categories (non-blocking):', err.message));

      seedDefaultChartOfAccounts(tenant.id, true)
        .then(({ created }) => { if (created) console.log(`✅ Seeded ${created} default accounting accounts for tenant ${tenant.id}`); })
        .catch((err) => console.error('Error seeding default chart of accounts (non-blocking):', err.message));

      seedDefaultEquipmentCategories(tenant.id, true)
        .then((created) => { if (created) console.log(`✅ Seeded ${created} default equipment categories for tenant ${tenant.id}`); })
        .catch((err) => console.error('Error seeding default equipment categories (non-blocking):', err.message));

      // Send email verification link (non-blocking; do not fail signup if email fails)
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiresAt = dayjs().add(24, 'hour').toDate();
      EmailVerificationToken.create({
        userId: user.id,
        token: verificationToken,
        expiresAt: verificationExpiresAt,
      }).then(() => {
        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
        const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
        const company = { name: process.env.APP_NAME || 'ABS' };
        const { subject, html, text } = emailVerificationTemplate(user, verifyLink, company);
        return emailService.sendPlatformMessage(normalizedEmail, subject, html, text, [], { categories: ['transactional', 'signup'] });
      }).then((result) => {
        if (result?.success) console.log('[signup] Verification email sent to', normalizedEmail);
      }).catch((err) => {
        console.error('[signup] Failed to send verification email (non-blocking):', err?.message || err);
      });

      setImmediate(() => {
        notifyAccountCreated({
          userName: user?.name,
          userEmail: user?.email,
          source: 'self_service_signup',
          tenantName: tenant?.name,
          tenantId: tenant?.id,
        }).catch((err) => {
          console.error('[signup] Platform admin notify failed (account created):', err?.message);
        });
      });

      const token = generateToken(user.id);

      // Build memberships from in-memory data – saves 1 remote DB round-trip (~100–300ms)
      const safeMemberships = [
        {
          ...membershipRecord.toJSON(),
          tenant: tenant.toJSON(),
        },
      ];
      const safeUser = user.toJSON();

      if (process.env.NODE_ENV === 'development') {
        console.log('[signup] total:', Date.now() - t0, 'ms');
      }
      return res.status(201).json({
        success: true,
        data: {
          user: safeUser,
          token,
          memberships: safeMemberships,
          defaultTenantId: tenant.id,
        },
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if a business phone is already used by another workspace
 * @route   POST /api/tenants/check-business-phone
 * @access  Private
 */
exports.checkBusinessPhone = async (req, res, next) => {
  try {
    const { phone } = req.body || {};
    const tenantId = req.tenantId || null;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid phone number',
      });
    }

    const whereClause = tenantId
      ? {
          [Op.and]: [
            { id: { [Op.ne]: tenantId } },
            sequelize.where(sequelize.json('metadata.phone'), normalizedPhone),
          ],
        }
      : sequelize.where(sequelize.json('metadata.phone'), normalizedPhone);

    const existingTenant = await Tenant.findOne({
      where: whereClause,
      attributes: ['id'],
    });

    return res.status(200).json({
      success: true,
      data: {
        exists: Boolean(existingTenant),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Complete onboarding
// @route   POST /api/tenants/onboarding
// @access  Private
exports.completeOnboarding = async (req, res, next) => {
  const {
    businessType,
    shopType,
    studioType,
    businessSubType,
    industry,
    companyName,
    companyEmail,
    companyPhone,
    companyWebsite,
    companyAddress,
    acceptedTerms,
    termsVersion,
  } = req.body;
  const companyLogo = req.file;
  const tenantId = req.tenantId;

  try {
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const existingTenantMetadata = tenant.metadata || {};
    const existingTermsAcceptance = existingTenantMetadata.termsAcceptance;
    const requiresTermsAcceptance = !existingTermsAcceptance?.acceptedAt;
    if (requiresTermsAcceptance && !isTermsAccepted(acceptedTerms)) {
      return res.status(400).json({
        success: false,
        message: TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
      });
    }

    const trimmedCompanyName = typeof companyName === 'string' ? companyName.trim() : '';
    if (!trimmedCompanyName) {
      return res.status(400).json({
        success: false,
        message: 'Company name is required'
      });
    }

    const normalizedCompanyPhone =
      typeof companyPhone === 'string' && companyPhone.trim() ? normalizePhone(companyPhone) : null;

    if (normalizedCompanyPhone && normalizedCompanyPhone !== tenant.metadata?.phone) {
      const existingTenantWithPhone = await Tenant.findOne({
        where: {
          [Op.and]: [
            { id: { [Op.ne]: tenantId } },
            sequelize.where(sequelize.json('metadata.phone'), normalizedCompanyPhone),
          ],
        },
      });

      if (existingTenantWithPhone) {
        return res.status(400).json({
          success: false,
          message:
            'This business phone number is already used by another workspace. Use a different phone number.',
        });
      }
    }

    const { resolveBusinessType } = require('../config/businessTypes');
    const previousBusinessType = tenant.businessType;
    const resolvedBusinessType = businessType ? resolveBusinessType(businessType) : tenant.businessType;
    const selectedStudioType = resolvedBusinessType === 'studio'
      ? (studioType || businessSubType || tenant.metadata?.studioType || null)
      : null;

    // Store onboarding data in metadata
    // Create a new metadata object to ensure Sequelize detects the change
    const metadata = { ...existingTenantMetadata };
    const termsAcceptance = isTermsAccepted(acceptedTerms)
      ? buildTermsAcceptanceMetadata(req, {
          source: 'tenant_onboarding',
          termsVersion,
        })
      : existingTermsAcceptance;
    if (termsAcceptance) {
      metadata.termsAcceptance = termsAcceptance;
    }
    metadata.onboarding = {
      industry,
      completedAt: new Date().toISOString()
    };
    
    // Store business sub-type (everyday label) in metadata for analytics and routing
    if (businessSubType) {
      metadata.businessSubType = businessSubType;
      console.log('[tenant] completeOnboarding tenantId=%s businessSubType=%s', tenantId, businessSubType);
    }
    
    // Store shop type in metadata (for shop business type)
    if (resolvedBusinessType === 'shop' && shopType) {
      metadata.shopType = shopType;
      console.log('[tenant] completeOnboarding tenantId=%s businessType=shop shopType=%s (stored in metadata)', tenantId, shopType);
      delete metadata.studioType;
    } else if (resolvedBusinessType === 'shop' && !shopType) {
      console.log('[tenant] completeOnboarding tenantId=%s businessType=shop shopType=missing', tenantId);
      delete metadata.studioType;
    } else if (resolvedBusinessType === 'studio') {
      if (selectedStudioType) metadata.studioType = selectedStudioType;
      delete metadata.shopType;
      console.log('[tenant] completeOnboarding tenantId=%s businessType=studio studioType=%s', tenantId, selectedStudioType || 'default');
    } else if (businessType) {
      delete metadata.shopType;
      delete metadata.studioType;
      console.log('[tenant] completeOnboarding tenantId=%s businessType=%s shopType=n/a', tenantId, resolvedBusinessType);
    }

    // Store business contact information in metadata
    if (companyEmail) metadata.email = companyEmail;
    if (normalizedCompanyPhone) metadata.phone = normalizedCompanyPhone;
    if (companyWebsite) metadata.website = companyWebsite;
    if (companyAddress) metadata.address = companyAddress;
    
    // Handle logo upload (convert to base64 or save file path)
    if (companyLogo) {
      const fs = require('fs');
      const logoBuffer = companyLogo.buffer;
      const logoBase64 = logoBuffer.toString('base64');
      metadata.logo = `data:${companyLogo.mimetype};base64,${logoBase64}`;
    }
    
    // Apply updates
    if (businessType) {
      tenant.businessType = resolvedBusinessType;
    }
    tenant.name = trimmedCompanyName;

    // Sync organization settings so business name appears everywhere (Dashboard, receipts, etc.)
    const [orgSetting] = await Setting.findOrCreate({
      where: { tenantId, key: 'organization' },
      defaults: { tenantId, key: 'organization', value: {}, description: 'Organization profile' }
    });
    const orgValue = orgSetting.value || {};
    const addressUpdate = companyAddress
      ? (typeof companyAddress === 'string' ? { ...(orgValue.address || {}), line1: companyAddress } : { ...(orgValue.address || {}), ...companyAddress })
      : (orgValue.address || {});
    const orgUpdate = {
      ...orgValue,
      name: trimmedCompanyName,
      legalName: orgValue.legalName || trimmedCompanyName,
      email: companyEmail || orgValue.email || tenant.metadata?.email || '',
      phone: normalizedCompanyPhone || orgValue.phone || tenant.metadata?.phone || '',
      website: companyWebsite || orgValue.website || tenant.metadata?.website || '',
      address: addressUpdate
    };
    if (metadata.logo) {
      orgUpdate.logoUrl = metadata.logo;
    }
    orgSetting.value = orgUpdate;
    await orgSetting.save();
    
    // Directly assign metadata and save to ensure JSONB changes are persisted
    tenant.metadata = metadata;
    await tenant.save();

    if (termsAcceptance && req.user?.id) {
      const membership = await UserTenant.findOne({ where: { userId: req.user.id, tenantId } });
      if (membership) {
        membership.metadata = {
          ...(membership.metadata || {}),
          termsAcceptance,
        };
        await membership.save();
      }
    }
    
    // Reload to get the latest data
    await tenant.reload();

    const resolvedOnboardingType = resolvedBusinessType || tenant.businessType;
    if (resolvedOnboardingType === 'shop') {
      try {
        const { syncDefaultShopFromOrganization } = require('../utils/shopUtils');
        await syncDefaultShopFromOrganization(tenantId, {
          name: trimmedCompanyName,
          phone: normalizedCompanyPhone,
          email: companyEmail || orgUpdate.email,
          address: companyAddress,
          shopType: metadata.shopType || metadata.businessSubType || null,
          source: 'onboarding',
        });
        console.log('[tenant] completeOnboarding ensured default shop for tenantId=%s', tenantId);
      } catch (shopErr) {
        console.error('[tenant] completeOnboarding default shop failed (non-blocking):', shopErr.message);
      }
    } else if (resolvedOnboardingType === 'studio') {
      try {
        const { ensureDefaultStudioLocation } = require('../utils/studioLocationUtils');
        await ensureDefaultStudioLocation(tenantId, {
          name: trimmedCompanyName,
          studioType: metadata.studioType || metadata.businessSubType || null,
          source: 'onboarding',
        });
        console.log('[tenant] completeOnboarding ensured default studio location for tenantId=%s', tenantId);
      } catch (studioErr) {
        console.error('[tenant] completeOnboarding default studio location failed (non-blocking):', studioErr.message);
      }
    }

    // Seed default categories based on business type and shop type
    // This runs if business type is set/changed, or if shop type is provided
    const shouldSeedCategories = businessType && (
      !previousBusinessType || // First time setting business type
      resolveBusinessType(previousBusinessType) !== resolvedBusinessType || // Business type changed
      (resolvedBusinessType === 'shop' && shopType) || // Shop type provided
      (resolvedBusinessType === 'studio' && selectedStudioType) // Studio type provided
    );
    
    if (shouldSeedCategories) {
      try {
        // Pass force=true to bypass cache/flag checks since this is onboarding
        await seedDefaultCategories(
          tenantId,
          resolvedBusinessType,
          resolvedBusinessType === 'shop' ? shopType || null : null,
          resolvedBusinessType === 'studio' ? selectedStudioType : null,
          true
        );
        console.log(`✅ Seeded default categories for ${resolvedBusinessType}${shopType ? ` (${shopType})` : ''}${selectedStudioType ? ` (${selectedStudioType})` : ''}`);
      } catch (error) {
        console.error('Failed to seed categories during onboarding:', error);
        // Don't fail onboarding if category seeding fails
      }
    }

    // Pass force=true to bypass cache/flag checks since this is onboarding
    seedDefaultEquipmentCategories(tenantId, true)
      .then((created) => { if (created) console.log(`✅ Seeded ${created} default equipment categories for tenant ${tenantId}`); })
      .catch((err) => console.error('Failed to seed equipment categories during onboarding (non-blocking):', err.message));

    const { ensureDefaultAutomationsSafe } = require('../services/defaultAutomationService');
    ensureDefaultAutomationsSafe(tenantId, { tenant })
      .then((summary) => {
        if (summary?.created) {
          console.log(`[tenant] Seeded ${summary.created} default automations for tenant ${tenantId}`);
        }
      });

    setImmediate(() => {
      notifyTenantOnboarded({
        tenantName: tenant?.name,
        tenantId: tenant?.id,
        businessType: tenant?.businessType || businessType,
        companyEmail: companyEmail || tenant?.metadata?.email,
        companyPhone: normalizedCompanyPhone || tenant?.metadata?.phone,
        actorName: req.user?.name,
        actorEmail: req.user?.email,
      }).catch((err) => {
        console.error('[tenant] Platform admin notify failed (onboarding):', err?.message);
      });
    });

    const normalizedTenant = normalizeTenantClassification(tenant);
    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          businessType: normalizedTenant.businessType,
          metadata: normalizedTenant.metadata
        }
      }
    });
  } catch (error) {
    next(error);
  }
};


// Update the completeOnboarding function - replace the destructuring line