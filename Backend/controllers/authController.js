const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const {
  User,
  InviteToken,
  UserTenant,
  Tenant,
  PlatformAdminRole,
  PlatformAdminUserRole,
  PasswordResetToken,
  EmailVerificationToken,
  Setting,
  Shop,
  StudioLocation,
  OnlineStoreSettings,
} = require('../models');
const config = require('../config/config');
const { sequelize } = require('../config/database');
const {
  getAuthBootstrapCacheKey,
  getCacheValue,
  invalidateUserCache,
  setCacheValue,
} = require('../middleware/cache');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const emailService = require('../services/emailService');
const { passwordReset: passwordResetEmailTemplate, emailVerification: emailVerificationTemplate, welcomeEmail: welcomeEmailTemplate } = require('../services/emailTemplates');
const { notifyAccountCreated } = require('../services/platformAdminNotificationService');
const { getFrontendBaseUrl } = require('../utils/frontendUrl');
const { seedDefaultCategories, seedDefaultEquipmentCategories } = require('../utils/categorySeeder');
const { seedDefaultChartOfAccounts } = require('../utils/seedAccountingAccounts');
const { resolveBusinessType } = require('../config/businessTypes');
const { getTenantEffectiveEntitlements } = require('../utils/tenantEntitlements');
const {
  DEFAULT_SHOP_TYPE,
  normalizeMembershipForResponse,
  normalizeTenantClassification,
} = require('../utils/tenantClassification');
const {
  TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
  buildTermsAcceptanceMetadata,
  isTermsAccepted,
} = require('../utils/legalTerms');
const { getUserShopIds } = require('../utils/shopUtils');
const { getUserStudioLocationIds } = require('../utils/studioLocationUtils');
const { startHotPathTimer } = require('../utils/performanceLogger');

/** User defaultScope omits emailVerifiedAt/googleId; auth responses need both for verification UI. */
const findUserForAuthResponse = (userId, options = {}) =>
  User.unscoped().findByPk(userId, {
    ...options,
    attributes: {
      exclude: ['password', 'failedLoginAttempts', 'lockoutUntil'],
      ...(options.attributes || {}),
    },
  });

const withAuthResponseFields = (userJson = {}) => {
  const isGoogleUser = Boolean(userJson.googleId);
  return {
    ...userJson,
    authProvider: isGoogleUser ? 'google' : 'password',
    paymentVerificationMethod: isGoogleUser ? 'otp' : 'password',
  };
};

// Slug utility functions (copied from tenantController)
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

const generateUniqueSlug = async (name, transaction) => {
  const base = slugify(name);
  let candidate = base;
  let counter = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await Tenant.findOne({
      where: { slug: candidate },
      transaction,
      attributes: ['id'],
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${counter++}`;
  }
};

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expire
  });
};

const toPlainJsonSafe = (value) => {
  const seen = new WeakSet();
  return JSON.parse(
    JSON.stringify(value, (key, current) => {
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return undefined;
        seen.add(current);
      }
      return current;
    })
  );
};

const normalizeMembershipsForResponse = (memberships = []) =>
  (memberships || []).map((membership) => normalizeMembershipForResponse(membership));

const { buildTrialSubscriptionSettingValue } = require('../utils/subscriptionDefaults');
const {
  resolveSignupPlanAssignment,
  buildSignupSubscriptionSettingValue,
} = require('../utils/signupPlanAssignment');

const ensureTrialSubscriptionSetting = async (tenantId, trialEndDate, options = {}) =>
  Setting.findOrCreate({
    where: { tenantId, key: 'subscription' },
    defaults: {
      tenantId,
      key: 'subscription',
      value: buildTrialSubscriptionSettingValue(trialEndDate),
      description: 'Subscription and billing information',
    },
    transaction: options.transaction,
  });

/**
 * @desc    Check if an email is already registered
 * @route   POST /api/auth/check-email
 * @access  Public
 */
exports.checkEmailAvailability = async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
      attributes: ['id']
    });

    return res.status(200).json({
      success: true,
      data: {
        exists: Boolean(existingUser)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, inviteToken, acceptedTerms, termsVersion } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password'
      });
    }

    if (!isTermsAccepted(acceptedTerms)) {
      return res.status(400).json({
        success: false,
        message: TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
      });
    }

    // Check if invite token is required (for security, we want invites to be required)
    if (!inviteToken) {
      return res.status(400).json({
        success: false,
        message: 'Invite token is required for registration'
      });
    }

    // Validate and find invite token
    const invite = await InviteToken.findOne({
      where: { token: inviteToken },
      include: [
        {
          model: Tenant,
          as: 'tenant',
          // Keep invite validation resilient on older demo schemas
          // that may not yet have newer optional tenant columns.
          attributes: ['id', 'name', 'slug', 'status', 'plan', 'businessType']
        }
      ]
    });

    if (!invite) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invite token'
      });
    }

    if (invite.used) {
      return res.status(400).json({
        success: false,
        message: 'This invite has already been used'
      });
    }

    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'This invite has expired'
      });
    }

    // Verify email matches invite
    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'Email does not match the invite'
      });
    }

    const normalizedInviteType = String(invite.inviteType || '').trim().toLowerCase();
    const termsAcceptance = buildTermsAcceptanceMetadata(req, {
      source: `invite_signup:${normalizedInviteType || 'tenant'}`,
      termsVersion,
    });

    // new_tenant invites use tenantId null — must run before the legacy rule that treats
    // any null tenantId as platform-admin signup.
    if (normalizedInviteType === 'new_tenant') {
      // Admin-invited tenant: create new tenant + user as owner, then mark invite used
      const trimmedCompanyName = 'My Business';
      const salesAgentService = require('../services/salesAgentService');
      const requestedAgentCode = req.body?.agentCode || req.body?.code || null;
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

      const transaction = await sequelize.transaction();
      try {
        const slug = await generateUniqueSlug(trimmedCompanyName, transaction);
        const trialEndDate = dayjs().add(1, 'month').toDate();
        const metadata = {
          signupSource: 'admin_invite',
          shopType: DEFAULT_SHOP_TYPE,
          termsAcceptance,
        };

        const tenant = await Tenant.create(
          {
            name: trimmedCompanyName,
            slug,
            plan: 'trial',
            businessType: 'shop',
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
            trialEndDate.setTime(attribution.trialEndsAt.getTime());
          }
        }

        const user = await User.create(
          {
            name,
            email: (email || '').trim().toLowerCase(),
            password,
            role: 'admin',
            // Admin-invited businesses should have their email verified automatically
            emailVerifiedAt: new Date(),
          },
          { transaction }
        );

        await UserTenant.create(
          {
            tenantId: tenant.id,
            userId: user.id,
            role: 'owner',
            status: 'active',
            isDefault: true,
            invitedBy: invite.createdBy,
            invitedAt: invite.createdAt,
            joinedAt: new Date(),
            metadata: {
              termsAcceptance,
            },
          },
          { transaction }
        );

        await Setting.bulkCreate(
          [
            {
              tenantId: tenant.id,
              key: 'organization',
              value: {
                name: trimmedCompanyName,
                legalName: trimmedCompanyName,
                email: (email || '').trim().toLowerCase(),
                phone: '',
                website: '',
                logoUrl: '',
                address: { line1: '', city: '', state: '', country: '', postalCode: '' },
                tax: { vatNumber: '', tin: '' },
                invoiceFooter: 'Thank you for doing business with us.',
              },
              description: 'Organization profile',
            },
            {
              tenantId: tenant.id,
              key: 'subscription',
              value: {
                plan: 'trial',
                status: 'trialing',
                trialEndsAt: trialEndDate,
                paymentMethod: null,
                seats: 1,
                ...(tenant.referredByAgentId
                  ? { salesAgentFreeMonths: salesAgentService.AGENT_FREE_MONTHS }
                  : {}),
              },
              description: 'Subscription and billing information',
            },
            {
              tenantId: tenant.id,
              key: 'payroll',
              value: { payeRate: 0.1, ssnitRate: 0.135, currency: 'GHS', payCycle: 'monthly' },
              description: 'Default payroll configuration',
            },
          ],
          { transaction }
        );

        await invite.update(
          {
            used: true,
            usedAt: new Date(),
            usedBy: user.id,
            metadata: {
              ...(invite.metadata || {}),
              termsAcceptance,
            },
          },
          { transaction }
        );

        await transaction.commit();

        seedDefaultCategories(tenant.id, 'shop', null, null, true)
          .then(() => console.log('[Auth] Seeded default categories for new_tenant'))
          .catch((err) => console.error('[Auth] seedDefaultCategories (new_tenant):', err?.message));
        seedDefaultChartOfAccounts(tenant.id, true)
          .then(({ created }) => { if (created) console.log('[Auth] Seeded accounting for new_tenant'); })
          .catch((err) => console.error('[Auth] seedDefaultChartOfAccounts (new_tenant):', err?.message));
        seedDefaultEquipmentCategories(tenant.id, true)
          .then((created) => { if (created) console.log('[Auth] Seeded equipment categories for new_tenant'); })
          .catch((err) => console.error('[Auth] seedDefaultEquipmentCategories (new_tenant):', err?.message));

        const token = generateToken(user.id);
        const memberships = await UserTenant.findAll({
          where: { userId: user.id },
          include: [{ model: Tenant, as: 'tenant' }],
          order: [['isDefault', 'DESC'], ['createdAt', 'ASC']],
        });

        const platformCompany = { name: 'African Business Suite', primaryColor: '#166534' };
        const loginUrl = getFrontendBaseUrl(req);
        setImmediate(() => {
          try {
            const { subject, html, text } = welcomeEmailTemplate(user, platformCompany, loginUrl);
            emailService.sendPlatformMessage(user.email, subject, html, text).catch(err => {
              console.error('[Auth] Welcome email failed (new_tenant):', err?.message);
            });
            notifyAccountCreated({
              userName: user?.name,
              userEmail: user?.email,
              source: 'invite:new_tenant',
              tenantName: tenant?.name,
              tenantId: tenant?.id,
            }).catch((err) => {
              console.error('[Auth] Platform admin notify failed (new_tenant):', err?.message);
            });
          } catch (err) {
            console.error('[Auth] Welcome email error (new_tenant):', err?.message);
          }
        });

        return res.status(201).json({
          success: true,
          data: {
            user,
            token,
            memberships: normalizeMembershipsForResponse(memberships),
            defaultTenantId: tenant.id,
          },
        });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }

    const isPlatformAdminInvite =
      normalizedInviteType === 'platform_admin' || !invite.tenantId;

    if (isPlatformAdminInvite) {
      // Platform admin invite: create user with isPlatformAdmin, assign invited platform role, no tenant
      const user = await User.create({
        name,
        email: (email || '').trim().toLowerCase(),
        password,
        role: 'admin',
        isPlatformAdmin: true,
        // Invite was sent to this email — no separate verification step
        emailVerifiedAt: new Date()
      });

      const roleToAssign = invite.platformAdminRoleName
        ? await PlatformAdminRole.findOne({ where: { name: invite.platformAdminRoleName } })
        : null;
      const fallbackRole = roleToAssign || await PlatformAdminRole.findOne({
        where: { isDefault: true },
        order: [['createdAt', 'ASC']]
      }) || await PlatformAdminRole.findOne({ order: [['createdAt', 'ASC']] });
      if (fallbackRole) {
        await PlatformAdminUserRole.create({ userId: user.id, roleId: fallbackRole.id });
      }

      await invite.update({
        used: true,
        usedAt: new Date(),
        usedBy: user.id,
        metadata: {
          ...(invite.metadata || {}),
          termsAcceptance,
        },
      });

      const token = generateToken(user.id);
      const platformCompany = { name: 'African Business Suite', primaryColor: '#166534' };
      const loginUrl = getFrontendBaseUrl(req);
      setImmediate(() => {
        try {
          const { subject, html, text } = welcomeEmailTemplate(user, platformCompany, loginUrl);
          emailService.sendPlatformMessage(user.email, subject, html, text).catch(err => {
            console.error('[Auth] Welcome email failed (platform admin):', err?.message);
          });
          notifyAccountCreated({
            userName: user?.name,
            userEmail: user?.email,
            source: 'invite:platform_admin',
            tenantName: null,
            tenantId: null,
          }).catch((err) => {
            console.error('[Auth] Platform admin notify failed (platform admin):', err?.message);
          });
        } catch (err) {
          console.error('[Auth] Welcome email error (platform admin):', err?.message);
        }
      });
      return res.status(201).json({
        success: true,
        data: {
          user: user.toJSON(),
          token,
          memberships: [],
          defaultTenantId: null,
          isPlatformAdmin: true
        }
      });
    }

    // Tenant invite: create user and UserTenant membership (existing tenant)
    if (!invite.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invite configuration. Please request a new invite link.'
      });
    }
    const user = await User.create({
      name,
      email: (email || '').trim().toLowerCase(),
      password,
      role: invite.role,
      // Invite was sent to this email — no separate verification step
      emailVerifiedAt: new Date()
    });

    const existingMembershipCount = await UserTenant.count({
      where: { userId: user.id }
    });

    await UserTenant.create({
      userId: user.id,
      tenantId: invite.tenantId,
      role: invite.role,
      status: 'active',
      isDefault: existingMembershipCount === 0,
      invitedBy: invite.createdBy,
      invitedAt: invite.createdAt,
      joinedAt: new Date(),
      metadata: {
        termsAcceptance,
      },
    });

    const inviteLocationIds = invite.metadata?.studioLocationIds;
    if (Array.isArray(inviteLocationIds) && inviteLocationIds.length > 0) {
      const { setUserStudioLocations } = require('../utils/studioLocationUtils');
      try {
        await setUserStudioLocations(user.id, invite.tenantId, inviteLocationIds);
      } catch (assignErr) {
        console.warn('[Auth] Studio location assignment from invite failed:', assignErr?.message);
      }
    }

    const inviteShopIds = invite.metadata?.shopIds;
    if (Array.isArray(inviteShopIds) && inviteShopIds.length > 0) {
      const { setUserShops } = require('../utils/shopUtils');
      try {
        await setUserShops(user.id, invite.tenantId, inviteShopIds);
      } catch (assignErr) {
        console.warn('[Auth] Shop assignment from invite failed:', assignErr?.message);
      }
    }

    await invite.update({
      used: true,
      usedAt: new Date(),
      usedBy: user.id,
      metadata: {
        ...(invite.metadata || {}),
        termsAcceptance,
      },
    });

    const token = generateToken(user.id);

    const memberships = await UserTenant.findAll({
      where: { userId: user.id },
      include: [
        {
          model: Tenant,
          as: 'tenant'
        }
      ],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'ASC']
      ]
    });

    const platformCompany = { name: 'African Business Suite', primaryColor: '#166534' };
    const loginUrl = getFrontendBaseUrl(req);
    setImmediate(() => {
      try {
        const { subject, html, text } = welcomeEmailTemplate(user, platformCompany, loginUrl);
        emailService.sendPlatformMessage(user.email, subject, html, text).catch(err => {
          console.error('[Auth] Welcome email failed (tenant user):', err?.message);
        });
        notifyAccountCreated({
          userName: user?.name,
          userEmail: user?.email,
          source: 'invite:tenant_user',
          tenantName: invite?.tenant?.name,
          tenantId: invite?.tenantId,
        }).catch((err) => {
          console.error('[Auth] Platform admin notify failed (tenant user):', err?.message);
        });
      } catch (err) {
        console.error('[Auth] Welcome email error (tenant user):', err?.message);
      }
    });

    res.status(201).json({
      success: true,
      data: {
        user,
        token,
        memberships: normalizeMembershipsForResponse(memberships),
        defaultTenantId: memberships[0]?.tenantId || null
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Account lockout configuration
const LOCKOUT_CONFIG = {
  maxAttempts: 5,        // Lock after 5 failed attempts
  lockoutMinutes: 15,    // Lock for 15 minutes
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check for user (email is case-insensitive)
    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(404).json({
        success: false,
        errorCode: 'EMAIL_NOT_FOUND',
        message: 'No account exists for this email. Sign up instead.'
      });
    }

    // Check if account is locked
    if (user.isLocked && user.isLocked()) {
      const remainingSeconds = user.getLockoutRemainingSeconds();
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      
      console.log(`[Auth] Account locked for ${email}. Remaining: ${remainingMinutes} minutes`);
      
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
        lockedUntil: user.lockoutUntil,
        remainingSeconds,
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      // Increment failed attempts
      const attempts = await user.incrementFailedAttempts(
        LOCKOUT_CONFIG.maxAttempts,
        LOCKOUT_CONFIG.lockoutMinutes
      );
      
      const remainingAttempts = LOCKOUT_CONFIG.maxAttempts - attempts;
      
      // If account is now locked
      if (attempts >= LOCKOUT_CONFIG.maxAttempts) {
        console.log(`[Auth] Account locked for ${email} after ${attempts} failed attempts`);
        return res.status(423).json({
          success: false,
          message: `Account has been locked due to too many failed login attempts. Please try again in ${LOCKOUT_CONFIG.lockoutMinutes} minutes.`,
          lockedUntil: user.lockoutUntil,
        });
      }
      
      console.log(`[Auth] Failed login for ${email}. Attempts: ${attempts}/${LOCKOUT_CONFIG.maxAttempts}`);
      
      return res.status(401).json({
        success: false,
        message: remainingAttempts > 0 
          ? `Invalid email or password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining before account lockout.`
          : 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    // Reset failed attempts on successful login
    await user.resetFailedAttempts();

    const token = generateToken(user.id);

    const memberships = await UserTenant.findAll({
      where: { userId: user.id, status: 'active' },
      include: [
        {
          model: Tenant,
          as: 'tenant'
        }
      ],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'ASC']
      ]
    });

    const invitedByList = memberships.map((m) => ({ tenantId: m.tenantId, role: m.role, invitedBy: m.invitedBy }));
    console.log('[ProfileCompletion] login auth data:', {
      userId: user?.id,
      email: user?.email,
      isFirstLogin: user?.isFirstLogin,
      isPlatformAdmin: user?.isPlatformAdmin,
      membershipsInvitedBy: invitedByList,
    });

    const userForResponse = await findUserForAuthResponse(user.id);

    res.status(200).json({
      success: true,
      data: {
        user: withAuthResponseFields(userForResponse.toJSON ? userForResponse.toJSON() : userForResponse),
        token,
        memberships: normalizeMembershipsForResponse(memberships),
        defaultTenantId: memberships[0]?.tenantId || null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify Google ID token and either log in existing user or create account (sign-up).
 * @route   POST /api/auth/google
 * @access  Public
 * @body    { string } idToken - Google ID token from frontend
 * @body    { boolean } [signUp] - If true and user not found, create user + tenant. If false, return 404.
 * @body    { string } [businessType] - For sign-up: 'shop' | 'printing_press' | 'pharmacy'
 * @body    { string } [companyName] - For sign-up: optional business name (default 'My Business')
 */
exports.googleAuth = async (req, res, next) => {
  try {
    const googleAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ]
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean);

    if (googleAudiences.length === 0) {
      return res.status(503).json({
        success: false,
        message: 'Google sign-in is not configured',
      });
    }

    const {
      idToken,
      signUp = false,
      businessType = 'shop',
      companyName,
      acceptedTerms,
      termsVersion,
      agentCode,
      code: referralCode,
    } = req.body || {};
    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google ID token is required',
      });
    }

    const salesAgentService = require('../services/salesAgentService');
    const requestedAgentCode = agentCode || referralCode || null;
    if (signUp && salesAgentService.normalizeAgentCode(requestedAgentCode)) {
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

    const client = new OAuth2Client(googleAudiences[0]);
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: googleAudiences });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired Google token',
      });
    }

    const googleId = payload.sub;
    const email = (payload.email || '').trim().toLowerCase();
    const name = (payload.name || payload.email || 'User').trim();
    const picture = payload.picture || null;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Google account must have an email',
      });
    }

    let user = await User.findOne({
      where: {
        [Op.or]: [
          { googleId },
          { email },
        ],
      },
    });

    if (user) {
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive',
        });
      }
      const updatePayload = { lastLogin: new Date() };
      if (!user.googleId) updatePayload.googleId = googleId;
      if (picture && !user.profilePicture) updatePayload.profilePicture = picture;
      if (!user.emailVerifiedAt) updatePayload.emailVerifiedAt = new Date();
      await user.update(updatePayload);

      const token = generateToken(user.id);
      const memberships = await UserTenant.findAll({
        where: { userId: user.id, status: 'active' },
        include: [{ model: Tenant, as: 'tenant' }],
        order: [
          ['isDefault', 'DESC'],
          ['createdAt', 'ASC'],
        ],
      });

      const updatedUser = await findUserForAuthResponse(user.id);
      return res.status(200).json({
        success: true,
        data: {
          user: withAuthResponseFields(updatedUser.toJSON ? updatedUser.toJSON() : updatedUser),
          token,
          memberships: normalizeMembershipsForResponse(memberships),
          defaultTenantId: memberships[0]?.tenantId || null,
        },
      });
    }

    if (!signUp) {
      return res.status(404).json({
        success: false,
        code: 'GOOGLE_USER_NOT_FOUND',
        message: 'No account found with this Google account. Sign up to create one.',
        email,
        name,
      });
    }

    if (!isTermsAccepted(acceptedTerms)) {
      return res.status(400).json({
        success: false,
        message: TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
      });
    }

    const existingByEmail = await User.findOne({ where: { email } });
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists. Sign in with password or link Google in settings.',
      });
    }

    let newUser;
    let tenant;
    let finalBusinessType;
    let metadata = {};
    const transaction = await sequelize.transaction();
    try {
      const trimmedCompanyName = (companyName || 'My Business').trim();
      const slug = await generateUniqueSlug(trimmedCompanyName, transaction);
      const { SubscriptionPlan } = require('../models');
      const planAssignment = await resolveSignupPlanAssignment({
        req,
        SubscriptionPlan,
      });
      const trialEndDate = new Date(planAssignment.trialEndsAt);
      finalBusinessType = resolveBusinessType(businessType);
      metadata = {
        signupSource: 'google_oauth',
        termsAcceptance: buildTermsAcceptanceMetadata(req, {
          source: 'google_oauth_signup',
          termsVersion,
        }),
        ...planAssignment.metadataExtras,
      };
      if (['printing_press', 'mechanic', 'barber', 'salon'].includes(businessType)) {
        metadata.studioType = businessType;
      }
      if (finalBusinessType === 'shop' && !metadata.shopType) {
        metadata.shopType = DEFAULT_SHOP_TYPE;
      }

      tenant = await Tenant.create(
        {
          name: trimmedCompanyName,
          slug,
          plan: planAssignment.planId,
          businessType: finalBusinessType,
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
          trialEndDate.setTime(attribution.trialEndsAt.getTime());
        }
      }

      const randomPassword = crypto.randomBytes(32).toString('hex');
      newUser = await User.create(
        {
          name,
          email,
          password: randomPassword,
          role: 'admin',
          googleId,
          profilePicture: picture,
          emailVerifiedAt: new Date(),
        },
        { transaction }
      );

      await UserTenant.create(
        {
          tenantId: tenant.id,
          userId: newUser.id,
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

      await Setting.bulkCreate(
        [
          {
            tenantId: tenant.id,
            key: 'organization',
            value: {
              name: trimmedCompanyName,
              legalName: trimmedCompanyName,
              email,
              phone: '',
              website: '',
              logoUrl: '',
              address: { line1: '', city: '', state: '', country: '', postalCode: '' },
              tax: { vatNumber: '', tin: '' },
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
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }

    user = await findUserForAuthResponse(newUser.id);
    const shopType = metadata?.shopType || null;
    const studioType = metadata?.studioType || null;
    seedDefaultCategories(tenant.id, finalBusinessType, shopType, studioType, true)
      .then(() => console.log(`[Google Auth] Seeded default categories for tenant ${tenant.id}`))
      .catch((err) => console.error('[Google Auth] seedDefaultCategories error:', err.message));
    seedDefaultChartOfAccounts(tenant.id, true)
      .then(({ created }) => { if (created) console.log(`[Google Auth] Seeded accounting accounts for tenant ${tenant.id}`); })
      .catch((err) => console.error('[Google Auth] seedDefaultChartOfAccounts error:', err.message));
    seedDefaultEquipmentCategories(tenant.id, true)
      .then((created) => { if (created) console.log(`[Google Auth] Seeded equipment categories for tenant ${tenant.id}`); })
      .catch((err) => console.error('[Google Auth] seedDefaultEquipmentCategories error:', err.message));

    const token = generateToken(user.id);
    const memberships = await UserTenant.findAll({
      where: { userId: user.id, status: 'active' },
      include: [{ model: Tenant, as: 'tenant' }],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'ASC'],
      ],
    });

    setImmediate(() => {
      notifyAccountCreated({
        userName: user?.name,
        userEmail: user?.email,
        source: 'google_oauth_signup',
        tenantName: tenant?.name,
        tenantId: tenant?.id,
      }).catch((err) => {
        console.error('[Auth] Platform admin notify failed (google signup):', err?.message);
      });
    });

    res.status(201).json({
      success: true,
      data: {
        user: withAuthResponseFields(user.toJSON ? user.toJSON() : user),
        token,
        memberships: normalizeMembershipsForResponse(memberships),
        defaultTenantId: memberships[0]?.tenantId || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Public config for frontend (e.g. Google OAuth client ID, self-signup flag for marketing site)
// @route   GET /api/auth/config
// @access  Public
exports.getPublicConfig = async (req, res, next) => {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID || '';
    const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID || '';
    const masked = googleClientId ? `${googleClientId.substring(0, 15)}...` : '(empty)';
    console.log('[getPublicConfig] GET /api/auth/config -> GOOGLE_CLIENT_ID:', masked, 'length=', googleClientId.length);

    let selfSignupEnabled = true;
    try {
      const featureFlagsSetting = await Setting.findOne({
        where: { tenantId: null, key: 'platform:featureFlags' },
        attributes: ['value']
      });
      if (featureFlagsSetting && featureFlagsSetting.value && typeof featureFlagsSetting.value === 'object') {
        selfSignupEnabled = featureFlagsSetting.value.publicSignup !== false;
      }
    } catch (dbError) {
      // Public config should remain available even if DB has transient issues.
      console.warn(
        '[getPublicConfig] Failed reading platform:featureFlags; using fallback defaults:',
        dbError?.message || dbError
      );
    }

    res.status(200).json({
      googleClientId,
      googleIosClientId,
      googleAndroidClientId,
      selfSignupEnabled
    });
  } catch (error) {
    next(error);
  }
};

const buildAuthUserPayload = async (req) => {
  const user = await findUserForAuthResponse(req.user.id, {
    include: [
      {
        model: UserTenant,
        as: 'tenantMemberships',
        include: [{ model: Tenant, as: 'tenant' }]
      }
    ]
  });
    const firstMembership = user?.tenantMemberships?.[0];
    const firstTenant = firstMembership?.tenant;
    console.log(
      '[getMe] userId=%s memberships=%s firstTenantId=%s businessType=%s onboarding=%j',
      req.user.id,
      user?.tenantMemberships?.length,
      firstTenant?.id,
      firstTenant?.businessType || 'n/a',
      firstTenant?.metadata?.onboarding
    );

    const memberships = user?.tenantMemberships || [];
    const tenantFeatureMap = {};
    for (const membership of memberships) {
      if (!membership?.tenant) continue;
      try {
        const tenantJson = normalizeTenantClassification(membership.tenant);
        const entitlements = await getTenantEffectiveEntitlements(tenantJson, {
          logContext: `getMe:user=${req.user.id}`,
        });
        const { resolveBillingStatus, toBillingPayload } = require('../services/subscriptionBillingService');
        const billing = toBillingPayload(await resolveBillingStatus(tenantJson));
        tenantFeatureMap[String(membership.tenantId)] = {
          ...tenantJson,
          effectiveFeatureFlags: entitlements.effectiveFeatureFlags || {},
          billingStatus: billing,
        };
      } catch (error) {
        console.warn('[getMe] Failed to resolve feature flags for tenant %s: %s', membership.tenantId, error?.message || error);
      }
    }
    const invitedByList = memberships.map((m) => ({ tenantId: m.tenantId, role: m.role, invitedBy: m.invitedBy }));
    console.log('[ProfileCompletion] getMe auth data:', {
      userId: user?.id,
      email: user?.email,
      isFirstLogin: user?.isFirstLogin,
      isPlatformAdmin: user?.isPlatformAdmin,
      membershipsInvitedBy: invitedByList,
    });

    const { mergeNotificationPreferences } = require('../services/notificationPreferenceHelper');
    const userJson = withAuthResponseFields(user.toJSON());
    userJson.notificationPreferences = mergeNotificationPreferences(user.notificationPreferences);
    if (Array.isArray(userJson.tenantMemberships)) {
      userJson.tenantMemberships = userJson.tenantMemberships.map((membership) => {
        const plain =
          membership && typeof membership.toJSON === 'function'
            ? membership.toJSON()
            : membership?.dataValues
              ? { ...membership.dataValues }
              : { ...membership };
        const tenantId = plain.tenantId ?? plain.tenant?.id;
        const mappedTenant = tenantFeatureMap[String(tenantId)];
        if (!mappedTenant) return plain;
        return {
          ...plain,
          tenantId,
          tenant: mappedTenant
        };
      });
    }

    const safeUserJson = toPlainJsonSafe(userJson);
  return safeUserJson;
};

const resolveBootstrapTenant = (memberships = [], requestedTenantId = null) => {
  const activeTenantId = requestedTenantId ? String(requestedTenantId) : null;
  if (activeTenantId) {
    const requested = memberships.find((membership) => String(membership.tenantId || membership.tenant?.id) === activeTenantId);
    if (requested) return requested;
  }
  return memberships.find((membership) => membership.isDefault) || memberships[0] || null;
};

const indexSettingsByKey = (rows = []) => rows.reduce((acc, row) => {
  acc[row.key] = row.value;
  return acc;
}, {});

const buildTenantBootstrapPayload = async ({ userId, membership }) => {
  if (!membership?.tenantId) {
    return {
      activeTenantId: null,
      activeTenant: null,
      settings: {},
      access: { shops: [], studioLocations: [] },
      onlineStore: null,
    };
  }

  const tenantId = membership.tenantId;
  const tenant = membership.tenant || null;
  const role = membership.role || null;
  const [
    settingsRows,
    shopIds,
    studioLocationIds,
    onlineStore,
  ] = await Promise.all([
    Setting.findAll({
      where: {
        tenantId,
        key: {
          [Op.in]: [
            'organization',
            'subscription',
            'payment-collection',
            'paymentCollection',
            'customer-notification-preferences',
          ],
        },
      },
      attributes: ['key', 'value'],
    }),
    getUserShopIds(userId, tenantId, role).catch(() => []),
    getUserStudioLocationIds(userId, tenantId, role).catch(() => []),
    OnlineStoreSettings.findOne({
      where: { tenantId },
      attributes: [
        'id',
        'tenantId',
        'shopId',
        'studioLocationId',
        'enabled',
        'slug',
        'displayName',
        'setupCompletedAt',
        'updatedAt',
      ],
      order: [['updatedAt', 'DESC']],
    }).catch(() => null),
  ]);

  const [shops, studioLocations] = await Promise.all([
    shopIds.length
      ? Shop.findAll({
        where: { tenantId, id: { [Op.in]: shopIds }, isActive: true },
        attributes: ['id', 'name', 'shopType', 'isDefault', 'city', 'country'],
        order: [['isDefault', 'DESC'], ['createdAt', 'ASC']],
      })
      : [],
    studioLocationIds.length
      ? StudioLocation.findAll({
        where: { tenantId, id: { [Op.in]: studioLocationIds }, isActive: true },
        attributes: ['id', 'name', 'city', 'country', 'isDefault'],
        order: [['isDefault', 'DESC'], ['createdAt', 'ASC']],
      })
      : [],
  ]);

  return {
    activeTenantId: tenantId,
    activeTenant: tenant,
    tenantRole: role,
    settings: indexSettingsByKey(settingsRows),
    access: {
      shops,
      studioLocations,
    },
    onlineStore,
  };
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const safeUserJson = await buildAuthUserPayload(req);
    res.status(200).json({
      success: true,
      data: safeUserJson
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Lightweight post-login bootstrap data
// @route   GET /api/auth/bootstrap
// @access  Private
exports.getBootstrap = async (req, res, next) => {
  const finishTiming = startHotPathTimer('auth.bootstrap', req);
  try {
    res.set('Cache-Control', 'no-store');
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];

    const requestedTenantId = req.query?.tenantId ? String(req.query.tenantId) : 'default';
    const cacheKey = getAuthBootstrapCacheKey(req.user.id, requestedTenantId);
    const cachedData = getCacheValue(cacheKey);
    if (cachedData) {
      finishTiming({
        cached: true,
        memberships: cachedData.memberships?.length || 0,
        activeTenantId: cachedData.activeTenantId || null,
        shops: cachedData.access?.shops?.length || 0,
        studioLocations: cachedData.access?.studioLocations?.length || 0,
      });
      return res.status(200).json({ success: true, data: cachedData });
    }

    const userPayload = await buildAuthUserPayload(req);
    const memberships = Array.isArray(userPayload.tenantMemberships)
      ? userPayload.tenantMemberships
      : [];
    const activeMembership = resolveBootstrapTenant(memberships, req.query?.tenantId);
    const tenantBootstrap = await buildTenantBootstrapPayload({
      userId: req.user.id,
      membership: activeMembership,
    });
    const data = toPlainJsonSafe({
      user: userPayload,
      memberships,
      defaultTenantId: resolveBootstrapTenant(memberships)?.tenantId || null,
      ...tenantBootstrap,
    });
    setCacheValue(cacheKey, data, 30, data.activeTenantId || null);

    finishTiming({
      memberships: memberships.length,
      activeTenantId: data.activeTenantId || null,
      shops: data.access?.shops?.length || 0,
      studioLocations: data.access?.studioLocations?.length || 0,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    finishTiming({ error: error?.message || 'unknown' });
    next(error);
  }
};

// @desc    Update staff notification preferences (in-app + email copy)
// @route   PATCH /api/auth/notification-preferences
// @access  Private
exports.updateNotificationPreferences = async (req, res, next) => {
  try {
    const {
      mergeNotificationPreferences,
      applyNotificationPreferencePatch,
    } = require('../services/notificationPreferenceHelper');
    const user = await findUserForAuthResponse(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const raw = req.body || {};
    const patch =
      raw.categories && typeof raw.categories === 'object' ? raw.categories : raw;
    const toSave = applyNotificationPreferencePatch(user.notificationPreferences, patch);
    const merged = mergeNotificationPreferences(toSave);

    user.notificationPreferences = toSave;
    try {
      await user.save();
    } catch (error) {
      if (error?.original?.code === '42703' || /notificationPreferences/i.test(error?.message || '')) {
        console.warn('[Auth] notificationPreferences column missing; returning merged preferences without persistence.');
        return res.status(200).json({ success: true, data: merged, persisted: false });
      }
      throw error;
    }
    invalidateUserCache(user.id);

    res.status(200).json({ success: true, data: merged });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
exports.updateDetails = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    const newEmail = req.body.email != null ? String(req.body.email).trim().toLowerCase() : null;
    const isChangingEmail = newEmail && user.email && newEmail !== user.email.trim().toLowerCase();

    if (isChangingEmail && !user.emailVerifiedAt) {
      const memberships = await UserTenant.findAll({
        where: { userId: user.id, status: 'active' },
        attributes: ['invitedBy']
      });
      const joinedOnlyViaInvite =
        memberships.length > 0 && memberships.every((m) => m.invitedBy != null);
      if (!joinedOnlyViaInvite) {
        return res.status(403).json({
          success: false,
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Please verify your email before changing it.',
        });
      }
    }

    const fieldsToUpdate = {
      name: req.body.name,
      email: req.body.email
    };
    await user.update(fieldsToUpdate);

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    // Check current password
    if (!(await user.comparePassword(req.body.currentPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Password is incorrect'
      });
    }

    user.password = req.body.newPassword;
    await user.save();
    invalidateUserCache(user.id);

    const token = generateToken(user.id);

    res.status(200).json({
      success: true,
      data: {
        user,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Set initial password (admin-created users: no current password required when isFirstLogin)
// @route   PUT /api/auth/set-initial-password
// @access  Private
exports.setInitialPassword = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!user.isFirstLogin) {
      return res.status(400).json({
        success: false,
        message: 'Initial password already set. Use change password instead.'
      });
    }
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }
    user.password = newPassword;
    user.isFirstLogin = false;
    await user.save();

    const token = generateToken(user.id);
    const userForResponse = await findUserForAuthResponse(user.id);
    res.status(200).json({
      success: true,
      data: { user: withAuthResponseFields(userForResponse.toJSON ? userForResponse.toJSON() : userForResponse), token }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request password reset (forgot password)
// @route   POST /api/auth/forgot-password
// @access  Public
exports.requestPasswordReset = async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({
      where: { email },
      attributes: ['id', 'name', 'email']
    });

    // Always return same response to avoid leaking whether email exists
    const message = 'If an account exists with that email, you will receive a password reset link shortly.';

    if (!user) {
      return res.status(200).json({ success: true, message });
    }

    // Remove any existing reset tokens for this user
    await PasswordResetToken.destroy({ where: { userId: user.id } });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await PasswordResetToken.create({
      userId: user.id,
      token,
      expiresAt
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    // Send email in background so the request returns immediately (~20s faster)
    const company = { name: process.env.APP_NAME || 'African Business Suite' };
    const { subject, html, text } = passwordResetEmailTemplate(user, resetLink, company);
    const recipientEmail = user.email;
    setImmediate(async () => {
      try {
        console.log('[Auth] Sending password reset email to', recipientEmail);
        const result = await emailService.sendPlatformMessage(recipientEmail, subject, html, text);
        if (result.success) {
          console.log('[Auth] Password reset email sent successfully to', recipientEmail);
        } else {
          console.error('[Auth] Password reset email failed:', result.error);
        }
      } catch (emailErr) {
        console.error('[Auth] Password reset email exception:', emailErr.message, emailErr.code || '');
      }
    });

    return res.status(200).json({ success: true, message });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password with token (from email link)
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const resetRecord = await PasswordResetToken.findOne({
      where: { token },
      include: [{ model: User, as: 'user', attributes: ['id'] }]
    });

    if (!resetRecord || !resetRecord.user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link. Please request a new password reset.'
      });
    }
    if (new Date() > new Date(resetRecord.expiresAt)) {
      await PasswordResetToken.destroy({ where: { token } });
      return res.status(400).json({
        success: false,
        message: 'This reset link has expired. Please request a new password reset.'
      });
    }

    const user = await User.findByPk(resetRecord.userId);
    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();
    await PasswordResetToken.destroy({ where: { token } });
    invalidateUserCache(user.id);

    return res.status(200).json({
      success: true,
      message: 'Password has been reset. You can now sign in with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify email via token (from link in email)
// @route   GET /api/auth/verify-email?token=...
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
    }

    const record = await EmailVerificationToken.findOne({
      where: { token },
      include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
    });

    if (!record || !record.user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification link. Please request a new verification email.',
      });
    }
    if (new Date() > new Date(record.expiresAt)) {
      await EmailVerificationToken.destroy({ where: { token } });
      return res.status(400).json({
        success: false,
        message: 'This verification link has expired. Please request a new verification email.',
      });
    }

    const user = await User.findByPk(record.userId);
    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    await user.update({ emailVerifiedAt: new Date() });
    await EmailVerificationToken.destroy({ where: { token } });
    invalidateUserCache(user.id);

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now sign in.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend verification email (protected)
// @route   POST /api/auth/resend-verification
// @access  Private
exports.resendVerification = async (req, res, next) => {
  try {
    const user = await findUserForAuthResponse(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.emailVerifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.',
      });
    }

    await EmailVerificationToken.destroy({ where: { userId: user.id } });
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = dayjs().add(24, 'hour').toDate();
    await EmailVerificationToken.create({
      userId: user.id,
      token: verificationToken,
      expiresAt,
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
    const company = { name: process.env.APP_NAME || 'ABS' };
    const { subject, html, text } = emailVerificationTemplate(user, verifyLink, company);
    const result = await emailService.sendPlatformMessage(user.email, subject, html, text, [], { categories: ['transactional', 'signup'] });

    if (!result?.success) {
      return res.status(503).json({
        success: false,
        message: result?.error || 'Failed to send verification email. Please try again later.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification email sent. Check your inbox.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify ABS token for Sabito SSO (called by Sabito)
// @route   GET /api/auth/verify-token
// @access  Public (but requires API key from Sabito)
// This endpoint allows Sabito to verify ABS JWT tokens and get user info for auto-login
exports.verifyNexproToken = async (req, res, next) => {
  try {
    // Get token from query parameter or Authorization header
    const token = req.query.token || 
                  (req.headers.authorization && req.headers.authorization.startsWith('Bearer') 
                    ? req.headers.authorization.split(' ')[1] 
                    : null);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Optional: Verify API key from Sabito
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.SABITO_API_KEY;
    
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, config.jwt.secret);
      
      // Get user with Sabito user ID if linked
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'email', 'name', 'sabitoUserId', 'isActive']
      });

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      // Return user info for Sabito to use for SSO
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          sabitoUserId: user.sabitoUserId || null,
          nexproUserId: user.id
        }
      });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

// @desc    SSO login from Sabito (Sabito → ABS)
// @route   POST /api/auth/sso/sabito
// @access  Public
exports.sabitoSSO = async (req, res, next) => {
  // Log immediately - this should always appear
  console.log('='.repeat(80));
  console.log('[SSO POST] 🚀🚀🚀 ENDPOINT CALLED 🚀🚀🚀');
  console.log('[SSO POST] Method:', req.method);
  console.log('[SSO POST] URL:', req.url);
  console.log('[SSO POST] Path:', req.path);
  console.log('[SSO POST] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[SSO POST] Has Body:', !!req.body);
  console.log('[SSO POST] Body Keys:', req.body ? Object.keys(req.body) : []);
  console.log('[SSO POST] Body:', JSON.stringify(req.body, null, 2));
  console.log('='.repeat(80));
  
  try {
    const { sabitoToken } = req.body;
    console.log('[SSO POST] 📝 Received sabitoToken:', sabitoToken ? `${sabitoToken.substring(0, 20)}...` : 'MISSING');

    if (!sabitoToken) {
      return res.status(400).json({
        success: false,
        message: 'Sabito token is required'
      });
    }

    // Verify token with Sabito API
    const sabitoApiUrl = process.env.SABITO_API_URL || 'http://localhost:4002';
    const sabitoApiKey = process.env.SABITO_API_KEY;

    if (!sabitoApiKey) {
      return res.status(500).json({
        success: false,
        message: 'Sabito API key not configured'
      });
    }

    try {
      // Verify token with Sabito
      console.log('[SSO POST] 🔍 Verifying token with Sabito:', {
        sabitoApiUrl,
        token: sabitoToken ? `${sabitoToken.substring(0, 20)}...` : 'missing'
      });
      
      const verifyResponse = await axios.get(`${sabitoApiUrl}/api/auth/verify-token`, {
        headers: {
          'Authorization': `Bearer ${sabitoToken}`,
          'X-API-Key': sabitoApiKey
        },
        timeout: 10000
      });

      console.log('='.repeat(100));
      console.log('[SSO POST] 📥 RAW SABITO RESPONSE (COMPLETE)');
      console.log('='.repeat(100));
      console.log('[SSO POST] Status:', verifyResponse.status);
      console.log('[SSO POST] Status Text:', verifyResponse.statusText);
      console.log('[SSO POST] Has Data:', !!verifyResponse.data);
      console.log('[SSO POST] Data Type:', typeof verifyResponse.data);
      console.log('[SSO POST] Data Keys:', verifyResponse.data ? Object.keys(verifyResponse.data) : []);
      console.log('[SSO POST] Full Response (JSON):');
      console.log(JSON.stringify(verifyResponse.data, null, 2));
      console.log('='.repeat(100));

      const responseData = verifyResponse.data?.data || verifyResponse.data || {};
      
      console.log('[SSO POST] 🔍 Extracted responseData:', {
        hasData: !!responseData,
        dataKeys: Object.keys(responseData),
        fullResponseData: JSON.stringify(responseData, null, 2)
      });
      
      const sabitoUser = responseData.user;
      const sabitoBusiness = responseData.business; // Business object from Sabito
      const installation = responseData.installation;
      
      console.log('='.repeat(100));
      console.log('[SSO POST] 📊 PARSED SABITO DATA');
      console.log('='.repeat(100));
      console.log('[SSO POST] User Object:', {
        exists: !!sabitoUser,
        email: sabitoUser?.email,
        id: sabitoUser?.id,
        name: sabitoUser?.name,
        fullUser: JSON.stringify(sabitoUser, null, 2)
      });
      console.log('[SSO POST] Installation Object:', {
        exists: !!installation,
        id: installation?.id,
        apiKey: installation?.apiKey ? `${installation.apiKey.substring(0, 20)}...` : 'MISSING',
        fullInstallation: JSON.stringify(installation, null, 2)
      });
      console.log('[SSO POST] Business Object:', {
        exists: !!sabitoBusiness,
        type: typeof sabitoBusiness,
        isNull: sabitoBusiness === null,
        isUndefined: sabitoBusiness === undefined,
        keys: sabitoBusiness ? Object.keys(sabitoBusiness) : [],
        name: sabitoBusiness?.name,
        email: sabitoBusiness?.email,
        phone: sabitoBusiness?.phone,
        address: sabitoBusiness?.address,
        website: sabitoBusiness?.website,
        description: sabitoBusiness?.description,
        industry: sabitoBusiness?.industry,
        FULL_BUSINESS_OBJECT: JSON.stringify(sabitoBusiness, null, 2)
      });
      console.log('='.repeat(100));
      
      if (!sabitoUser || !sabitoUser.id) {
        return res.status(401).json({
          success: false,
          message: 'Invalid Sabito token'
        });
      }

      // Find or create user in ABS
      let user = await User.findOne({
        where: {
          [Op.or]: [
            { sabitoUserId: sabitoUser.id },
            { email: sabitoUser.email }
          ]
        }
      });

      if (user) {
        // Update existing user with Sabito ID if not set
        if (!user.sabitoUserId) {
          user.sabitoUserId = sabitoUser.id;
          await user.save();
        }

        // Update user info if changed
        if (sabitoUser.name && sabitoUser.name !== user.name) {
          user.name = sabitoUser.name;
          await user.save();
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();
      } else {
        // Create new user (SSO users need a default password - they'll set it on first login)
        // Generate a random password that won't be used (SSO users don't need password)
        const crypto = require('crypto');
        const randomPassword = crypto.randomBytes(32).toString('hex');
        
        console.log('[SSO POST] 👤 Creating new user:', {
          email: sabitoUser.email,
          name: sabitoUser.name || sabitoUser.email
        });
        
        user = await User.create({
          name: sabitoUser.name || sabitoUser.email,
          email: sabitoUser.email,
          password: randomPassword, // Will be hashed by hook
          sabitoUserId: sabitoUser.id,
          role: 'staff', // Default role
          isFirstLogin: true
        });
        
        console.log('[SSO POST] ✅ New user created:', {
          userId: user.id,
          email: user.email
        });
        
        // Create a default tenant for the new SSO user
        // Use business name from Sabito if available, otherwise use user's name
        const tenantName = sabitoBusiness?.name || `Workspace for ${sabitoUser.name || sabitoUser.email}`;
        const tenantSlug = await generateUniqueSlug(tenantName);
        
        // Set trial end date to 1 month from now
        const trialEndDate = dayjs().add(1, 'month').toDate();
        
        console.log('[SSO POST] 🏢 Creating default tenant for new user:', {
          tenantName,
          tenantSlug,
          userId: user.id,
          hasBusinessData: !!sabitoBusiness
        });
        
        const defaultTenant = await Tenant.create({
          name: tenantName,
          slug: tenantSlug,
          plan: 'trial',
          status: 'active',
          trialEndsAt: trialEndDate,
          metadata: sabitoBusiness ? {
            website: sabitoBusiness.website || null,
            email: sabitoBusiness.email || null,
            phone: sabitoBusiness.phone || null,
            description: sabitoBusiness.description || null,
            industry: sabitoBusiness.industry || null,
            signupSource: 'sabito_sso'
          } : {
            signupSource: 'sabito_sso'
          }
        });
        
        console.log('[SSO POST] ✅ Default tenant created:', {
          tenantId: defaultTenant.id,
          tenantName: defaultTenant.name
        });
        
        // Create UserTenant relationship
        await UserTenant.create({
          userId: user.id,
          tenantId: defaultTenant.id,
          role: 'owner',
          status: 'active',
          isDefault: true,
          invitedBy: null,
          invitedAt: new Date(),
          joinedAt: new Date()
        });
        await ensureTrialSubscriptionSetting(defaultTenant.id, trialEndDate);
        
        console.log('[SSO POST] ✅ UserTenant relationship created');
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive'
        });
      }

      // Generate ABS JWT token
      const token = generateToken(user.id);

      // Get user memberships
      console.log('[SSO POST] 👤 Getting memberships for user:', {
        userId: user.id,
        userEmail: user.email
      });
      
      let memberships = await UserTenant.findAll({
        where: { userId: user.id, status: 'active' },
        include: [
          {
            model: Tenant,
            as: 'tenant'
          }
        ],
        order: [
          ['isDefault', 'DESC'],
          ['createdAt', 'ASC']
        ]
      });

      console.log('[SSO POST] 📋 Memberships retrieved:', {
        membershipsCount: memberships.length,
        membershipDetails: memberships.map(m => ({
          tenantId: m.tenantId,
          tenantName: m.tenant?.name,
          isDefault: m.isDefault
        }))
      });

      // If user has no tenant membership, create one (for existing users who logged in before this fix)
      if (memberships.length === 0) {
        console.log('[SSO POST] ⚠️ User has no tenant membership, creating one...');
        
        // Use business name from Sabito if available, otherwise use user's name
        const tenantName = sabitoBusiness?.name || `Workspace for ${user.name || user.email}`;
        const tenantSlug = await generateUniqueSlug(tenantName);
        
        // Set trial end date to 1 month from now
        const trialEndDate = dayjs().add(1, 'month').toDate();
        
        console.log('[SSO POST] 🏢 Creating tenant for existing user without membership:', {
          tenantName,
          tenantSlug,
          userId: user.id,
          hasBusinessData: !!sabitoBusiness
        });
        
        const defaultTenant = await Tenant.create({
          name: tenantName,
          slug: tenantSlug,
          plan: 'trial',
          status: 'active',
          trialEndsAt: trialEndDate,
          metadata: sabitoBusiness ? {
            website: sabitoBusiness.website || null,
            email: sabitoBusiness.email || null,
            phone: sabitoBusiness.phone || null,
            description: sabitoBusiness.description || null,
            industry: sabitoBusiness.industry || null,
            signupSource: 'sabito_sso'
          } : {
            signupSource: 'sabito_sso'
          }
        });
        
        console.log('[SSO POST] ✅ Tenant created for existing user:', {
          tenantId: defaultTenant.id,
          tenantName: defaultTenant.name
        });
        
        // Create UserTenant relationship
        await UserTenant.create({
          userId: user.id,
          tenantId: defaultTenant.id,
          role: 'owner',
          status: 'active',
          isDefault: true,
          invitedBy: null,
          invitedAt: new Date(),
          joinedAt: new Date()
        });
        await ensureTrialSubscriptionSetting(defaultTenant.id, trialEndDate);
        
        console.log('[SSO POST] ✅ UserTenant relationship created for existing user');
        
        // Re-fetch memberships
        memberships = await UserTenant.findAll({
          where: { userId: user.id, status: 'active' },
          include: [
            {
              model: Tenant,
              as: 'tenant'
            }
          ],
          order: [
            ['isDefault', 'DESC'],
            ['createdAt', 'ASC']
          ]
        });
        
        console.log('[SSO POST] 📋 Memberships after creation:', {
          membershipsCount: memberships.length,
          membershipDetails: memberships.map(m => ({
            tenantId: m.tenantId,
            tenantName: m.tenant?.name,
            isDefault: m.isDefault
          }))
        });
      }

      // Auto-populate organization settings from Sabito business object
      console.log('[SSO POST] 🔄 Checking if should auto-populate:', {
        membershipsCount: memberships.length,
        hasBusiness: !!sabitoBusiness,
        businessName: sabitoBusiness?.name,
        businessEmail: sabitoBusiness?.email,
        businessPhone: sabitoBusiness?.phone
      });
      
      if (memberships.length > 0 && sabitoBusiness) {
        const defaultTenant = memberships[0].tenant;
        const nexproTenantId = defaultTenant?.id;
        
        console.log('[SSO POST] ✅ Proceeding with auto-populate for tenant:', nexproTenantId);
        
        if (nexproTenantId) {
          try {
            const Setting = require('../models').Setting;
            
            const getSettingValue = async (tenantId, key, fallback = {}) => {
              const setting = await Setting.findOne({ where: { tenantId, key } });
              return setting ? setting.value : fallback;
            };
            
            const upsertSettingValue = async (tenantId, key, value, description = null) => {
              const [setting] = await Setting.findOrCreate({
                where: { tenantId, key },
                defaults: {
                  tenantId,
                  key,
                  value,
                  description
                }
              });
              await setting.update({ value, description });
              return setting.value;
            };
            
            const existingOrgSettings = await getSettingValue(nexproTenantId, 'organization', {});
            const isIncomplete = !existingOrgSettings?.name || 
                                !existingOrgSettings?.email || 
                                !existingOrgSettings?.phone ||
                                existingOrgSettings?.name === 'My Workspace';
            
            console.log('[SSO POST] 🔍 Processing business object for tenant:', nexproTenantId, {
              hasBusiness: !!sabitoBusiness,
              existingOrgSettings: {
                name: existingOrgSettings?.name,
                email: existingOrgSettings?.email,
                phone: existingOrgSettings?.phone,
                isIncomplete
              },
              businessObject: sabitoBusiness ? JSON.stringify(sabitoBusiness, null, 2) : 'null'
            });
            
            console.log('='.repeat(100));
            console.log('[SSO POST] 📋 EXTRACTING BUSINESS FIELDS FROM SABITO');
            console.log('='.repeat(100));
            console.log('[SSO POST] Business Object Type:', typeof sabitoBusiness);
            console.log('[SSO POST] Business Object Value:', sabitoBusiness);
            console.log('[SSO POST] Business Object Stringified:', JSON.stringify(sabitoBusiness, null, 2));
            
            const businessName = sabitoBusiness?.name;
            const businessEmail = sabitoBusiness?.email;
            const businessPhone = sabitoBusiness?.phone;
            const businessAddress = sabitoBusiness?.address;
            const businessWebsite = sabitoBusiness?.website;
            const businessDescription = sabitoBusiness?.description;
            const businessIndustry = sabitoBusiness?.industry;
            
            console.log('[SSO POST] Extracted Values:');
            console.log('  - businessName:', businessName, `(${typeof businessName})`);
            console.log('  - businessEmail:', businessEmail, `(${typeof businessEmail})`);
            console.log('  - businessPhone:', businessPhone, `(${typeof businessPhone})`);
            console.log('  - businessAddress:', businessAddress, `(${typeof businessAddress})`);
            console.log('  - businessWebsite:', businessWebsite, `(${typeof businessWebsite})`);
            console.log('  - businessDescription:', businessDescription, `(${typeof businessDescription})`);
            console.log('  - businessIndustry:', businessIndustry, `(${typeof businessIndustry})`);
            console.log('='.repeat(100));
            
            console.log('[SSO POST] 📋 Extracted business fields (summary):', {
              businessName: businessName || 'MISSING',
              businessEmail: businessEmail || 'MISSING',
              businessPhone: businessPhone || 'MISSING',
              businessAddress: businessAddress || 'MISSING',
              businessWebsite: businessWebsite || 'MISSING',
              businessDescription: businessDescription || 'MISSING',
              businessIndustry: businessIndustry || 'MISSING'
            });
            
            const hasAnyBusinessData = businessName || businessEmail || businessPhone;
            const shouldAutoPopulate = isIncomplete || (hasAnyBusinessData && !existingOrgSettings?.name);
            
            console.log('[SSO POST] 🤔 Auto-populate decision:', {
              hasAnyBusinessData,
              isIncomplete,
              existingName: existingOrgSettings?.name,
              shouldAutoPopulate
            });
            
            // Populate with whatever business data is available
            if (shouldAutoPopulate && hasAnyBusinessData) {
              let addressObj = existingOrgSettings?.address || {};
              if (businessAddress) {
                if (typeof businessAddress === 'string') {
                  addressObj = { ...addressObj, line1: businessAddress };
                } else if (typeof businessAddress === 'object') {
                  addressObj = { ...addressObj, ...businessAddress };
                }
              }
              
              const orgUpdate = {
                ...existingOrgSettings,
                name: existingOrgSettings?.name || businessName || defaultTenant.name,
                email: existingOrgSettings?.email || businessEmail || '',
                phone: existingOrgSettings?.phone || businessPhone || '',
                legalName: existingOrgSettings?.legalName || businessName || '',
                website: existingOrgSettings?.website || businessWebsite || '',
                address: addressObj,
                tax: existingOrgSettings?.tax || {}
              };
              
              console.log('[SSO POST] 💾 Saving organization settings:', {
                tenantId: nexproTenantId,
                orgUpdate: JSON.stringify(orgUpdate, null, 2),
                name: orgUpdate.name,
                email: orgUpdate.email,
                phone: orgUpdate.phone
              });
              
              const savedSettings = await upsertSettingValue(nexproTenantId, 'organization', orgUpdate);
              
              console.log('[SSO POST] ✅ Organization settings saved:', {
                tenantId: nexproTenantId,
                savedSettings: JSON.stringify(savedSettings, null, 2),
                savedName: savedSettings?.name,
                savedEmail: savedSettings?.email,
                savedPhone: savedSettings?.phone
              });
              
              // Verify the save worked by reading it back
              const verifySettings = await getSettingValue(nexproTenantId, 'organization', {});
              console.log('[SSO POST] 🔍 Verification - Read back organization settings:', {
                tenantId: nexproTenantId,
                verifiedName: verifySettings?.name,
                verifiedEmail: verifySettings?.email,
                verifiedPhone: verifySettings?.phone,
                fullVerifiedSettings: JSON.stringify(verifySettings, null, 2)
              });
              
              if (businessName && (defaultTenant.name === 'My Workspace' || !defaultTenant.name)) {
                defaultTenant.name = businessName;
                await defaultTenant.save();
                console.log('[SSO POST] ✅ Updated tenant name to:', businessName);
              }
              
              const tenantMetadata = defaultTenant.metadata || {};
              if (businessWebsite) tenantMetadata.website = businessWebsite;
              if (sabitoBusiness.description) tenantMetadata.description = sabitoBusiness.description;
              if (sabitoBusiness.industry) tenantMetadata.industry = sabitoBusiness.industry;
              if (Object.keys(tenantMetadata).length > 0) {
                defaultTenant.metadata = tenantMetadata;
                await defaultTenant.save();
                console.log('[SSO POST] ✅ Updated tenant metadata:', tenantMetadata);
              }
              
              console.log('[SSO POST] ✅ Auto-populated organization settings from Sabito business object:', {
                tenantId: nexproTenantId,
                name: orgUpdate.name,
                email: orgUpdate.email,
                phone: orgUpdate.phone
              });
            } else {
              console.log('[SSO POST] ⚠️ Skipping auto-populate:', {
                shouldAutoPopulate,
                hasAnyBusinessData,
                reason: !shouldAutoPopulate ? 'shouldAutoPopulate is false' : 'hasAnyBusinessData is false'
              });
            }
          } catch (orgError) {
            console.error('[SSO POST] ❌ Error auto-populating organization settings:', {
              message: orgError.message,
              stack: orgError.stack,
              tenantId: nexproTenantId
            });
          }
        } else {
          console.log('[SSO POST] ⚠️ No tenant ID available for auto-populate');
        }
      } else {
        console.log('[SSO POST] ⚠️ Skipping auto-populate - conditions not met:', {
          hasMemberships: memberships.length > 0,
          hasBusiness: !!sabitoBusiness
        });
      }

      // Auto-create tenant mapping if business ID is available from Sabito
      // This happens automatically when user logs in via SSO
      if (sabitoUser.businessId && memberships.length > 0) {
        const defaultTenant = memberships[0].tenant;
        const nexproTenantId = defaultTenant?.id;
        
        if (nexproTenantId) {
          // Step 1: Store tenant ID in Sabito installation settings
          try {
            // Get installation ID from Sabito
            const installationsResponse = await axios.get(`${sabitoApiUrl}/api/apps/installations`, {
              headers: {
                'Authorization': `Bearer ${sabitoToken}`,
                'X-API-Key': sabitoApiKey
              },
              timeout: 10000
            });
            
            const installations = installationsResponse.data?.data || installationsResponse.data || [];
            const installation = installations[0];
            
            if (installation && installation.id) {
              // Store tenant ID in installation settings (merge with existing settings)
              await axios.put(
                `${sabitoApiUrl}/api/apps/installations/${installation.id}/settings`,
                {
                  settings: {
                    nexproTenantId: nexproTenantId,
                    // Preserve existing settings
                    ...(installation.settings || {})
                  },
                  fromSettings: false, // Not stored in settings yet
                  fallbackToBusinessId: true // Fallback to business ID if tenant ID not found
                },
                {
                  headers: {
                    'Authorization': `Bearer ${sabitoToken}`,
                    'X-API-Key': sabitoApiKey,
                    'Content-Type': 'application/json'
                  },
                  timeout: 10000
                }
              );
              
              console.log('[SSO] ✅ Stored ABS tenant ID in Sabito installation:', {
                installationId: installation.id,
                nexproTenantId,
                businessId: sabitoUser.businessId
              });
            }
          } catch (settingsError) {
            // Don't fail SSO if this fails, just log it
            console.error('[SSO] Error storing tenant ID in Sabito installation:', {
              message: settingsError.message,
              response: settingsError.response?.data
            });
          }
          
          // Step 2: Auto-create tenant mapping in ABS database
          try {
            const { SabitoTenantMapping } = require('../models');
            
            if (defaultTenant) {
              // Check if mapping already exists
              const existingMapping = await SabitoTenantMapping.findOne({
                where: { sabitoBusinessId: sabitoUser.businessId }
              });

              if (!existingMapping) {
                // Auto-create mapping
                await SabitoTenantMapping.create({
                  sabitoBusinessId: sabitoUser.businessId,
                  nexproTenantId: defaultTenant.id,
                  businessName: sabitoUser.businessName || defaultTenant.name
                });
                console.log('[SSO] Auto-created tenant mapping for business:', sabitoUser.businessId);
              }
            }
          } catch (mappingError) {
            // Don't fail SSO if mapping creation fails, just log it
            console.error('[SSO] Error auto-creating tenant mapping:', mappingError.message);
          }
        }
      }

      res.status(200).json({
        success: true,
        data: {
          user,
          token,
          memberships: normalizeMembershipsForResponse(memberships),
          defaultTenantId: memberships[0]?.tenantId || null
        }
      });

    } catch (sabitoError) {
      console.error('='.repeat(100));
      console.error('[SSO POST] ❌ SABITO TOKEN VERIFICATION ERROR');
      console.error('='.repeat(100));
      console.error('[SSO POST] Error Type:', sabitoError.name);
      console.error('[SSO POST] Error Message:', sabitoError.message);
      console.error('[SSO POST] Error Status:', sabitoError.response?.status);
      console.error('[SSO POST] Error Status Text:', sabitoError.response?.statusText);
      console.error('[SSO POST] Error Response Data:', JSON.stringify(sabitoError.response?.data, null, 2));
      console.error('[SSO POST] Full Error:', sabitoError);
      console.error('='.repeat(100));
      
      // Check if token expired
      if (sabitoError.response?.status === 401 || sabitoError.response?.status === 403) {
        const errorMessage = sabitoError.response?.data?.message || sabitoError.message;
        if (errorMessage?.toLowerCase().includes('expired') || errorMessage?.toLowerCase().includes('invalid')) {
          return res.status(401).json({
            success: false,
            message: 'Sabito token has expired or is invalid. Please try logging in again from Sabito.',
            error: 'token_expired'
          });
        }
      }
      
      if (sabitoError.response?.status === 401) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired Sabito token'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to verify token with Sabito'
      });
    }

  } catch (error) {
    next(error);
  }
};

// @desc    SSO login from Sabito via GET (Sabito → ABS)
// @route   GET /sso?token=xxx&appName=nexpro
// @access  Public
exports.sabitoSSOGet = async (req, res, next) => {
  // Log immediately - this should always appear
  console.log('='.repeat(100));
  console.log('[SSO GET] 🚀🚀🚀 GET ENDPOINT CALLED 🚀🚀🚀');
  console.log('[SSO GET] Method:', req.method);
  console.log('[SSO GET] URL:', req.url);
  console.log('[SSO GET] Path:', req.path);
  console.log('[SSO GET] Query:', JSON.stringify(req.query, null, 2));
  console.log('[SSO GET] Query Keys:', Object.keys(req.query));
  console.log('[SSO GET] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('='.repeat(100));
  
  try {
    const { token, appName } = req.query;
    console.log('[SSO GET] 📝 Extracted from query:');
    console.log('  - token:', token ? `${token.substring(0, 20)}...` : 'MISSING');
    console.log('  - appName:', appName || 'MISSING');
    console.log('  - token length:', token?.length || 0);

    if (!token) {
      console.error('[SSO GET] ❌ No token provided in query string');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      console.log('[SSO GET] 🔄 Redirecting to login (missing_token)');
      return res.redirect(`${frontendUrl}/login?error=missing_token`);
    }

    // Verify token with Sabito API
    const sabitoApiUrl = process.env.SABITO_API_URL || 'http://localhost:4002';
    const sabitoApiKey = process.env.SABITO_API_KEY;

    if (!sabitoApiKey) {
      console.error('[SSO GET] ❌ Sabito API key not configured');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      console.log('[SSO GET] 🔄 Redirecting to login (config_error)');
      return res.redirect(`${frontendUrl}/login?error=config_error`);
    }
    
    console.log('[SSO GET] ✅ Configuration check passed:', {
      sabitoApiUrl,
      hasApiKey: !!sabitoApiKey
    });

    try {
      // Verify token with Sabito using query params
      console.log('[SSO GET] 🔍 Verifying token with Sabito:', {
        sabitoApiUrl,
        token: token ? `${token.substring(0, 20)}...` : 'missing',
        appName: appName || 'nexpro'
      });
      
      const verifyResponse = await axios.get(`${sabitoApiUrl}/api/auth/verify-token`, {
        params: {
          token: token,
          appName: appName || 'nexpro'
        },
        headers: {
          'X-API-Key': sabitoApiKey
        },
        timeout: 10000
      });

      console.log('='.repeat(100));
      console.log('[SSO GET] 📥 RAW SABITO RESPONSE (COMPLETE)');
      console.log('='.repeat(100));
      console.log('[SSO GET] Status:', verifyResponse.status);
      console.log('[SSO GET] Status Text:', verifyResponse.statusText);
      console.log('[SSO GET] Has Data:', !!verifyResponse.data);
      console.log('[SSO GET] Data Type:', typeof verifyResponse.data);
      console.log('[SSO GET] Data Keys:', verifyResponse.data ? Object.keys(verifyResponse.data) : []);
      console.log('[SSO GET] Full Response (JSON):');
      console.log(JSON.stringify(verifyResponse.data, null, 2));
      console.log('='.repeat(100));

      const responseData = verifyResponse.data?.data || verifyResponse.data || {};
      
      console.log('[SSO GET] 🔍 Extracted responseData:', {
        hasData: !!responseData,
        dataKeys: Object.keys(responseData),
        fullResponseData: JSON.stringify(responseData, null, 2)
      });
      
      const sabitoUser = responseData.user;
      const installation = responseData.installation;
      const sabitoBusiness = responseData.business; // Business object from Sabito
      const apiKey = installation?.apiKey;

      console.log('='.repeat(100));
      console.log('[SSO GET] 📊 PARSED SABITO DATA');
      console.log('='.repeat(100));
      console.log('[SSO GET] User Object:', {
        exists: !!sabitoUser,
        email: sabitoUser?.email,
        id: sabitoUser?.id,
        name: sabitoUser?.name,
        fullUser: JSON.stringify(sabitoUser, null, 2)
      });
      console.log('[SSO GET] Installation Object:', {
        exists: !!installation,
        id: installation?.id,
        apiKey: installation?.apiKey ? `${installation.apiKey.substring(0, 20)}...` : 'MISSING',
        fullInstallation: JSON.stringify(installation, null, 2)
      });
      console.log('[SSO GET] Business Object:', {
        exists: !!sabitoBusiness,
        type: typeof sabitoBusiness,
        isNull: sabitoBusiness === null,
        isUndefined: sabitoBusiness === undefined,
        keys: sabitoBusiness ? Object.keys(sabitoBusiness) : [],
        name: sabitoBusiness?.name,
        email: sabitoBusiness?.email,
        phone: sabitoBusiness?.phone,
        address: sabitoBusiness?.address,
        website: sabitoBusiness?.website,
        description: sabitoBusiness?.description,
        industry: sabitoBusiness?.industry,
        FULL_BUSINESS_OBJECT: JSON.stringify(sabitoBusiness, null, 2)
      });
      console.log('='.repeat(100));

      if (!sabitoUser || !sabitoUser.id) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=invalid_token`);
      }

      // Find or create user in ABS
      let user = await User.findOne({
        where: {
          [Op.or]: [
            { sabitoUserId: sabitoUser.id },
            { email: sabitoUser.email }
          ]
        }
      });

      if (user) {
        // Update existing user with Sabito ID if not set
        if (!user.sabitoUserId) {
          user.sabitoUserId = sabitoUser.id;
          await user.save();
        }

        // Update user info if changed
        if (sabitoUser.name && sabitoUser.name !== user.name) {
          user.name = sabitoUser.name;
          await user.save();
        }

        // Store API key if provided (in metadata or separate field)
        if (apiKey) {
          // Store API key - you can add a sabitoApiKey field to User model or use metadata
          // For now, we'll store it in a way that can be retrieved later
          // If User model has a metadata JSON field, use that, otherwise skip
          try {
            if (user.metadata) {
              user.metadata = {
                ...(typeof user.metadata === 'object' ? user.metadata : {}),
                sabitoApiKey: apiKey,
                sabitoInstallationId: installation?.id
              };
              await user.save();
            }
          } catch (metadataError) {
            console.error('[SSO GET] Error storing API key:', metadataError.message);
            // Continue even if storing API key fails
          }
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();
      } else {
        // Create new user
        const crypto = require('crypto');
        const randomPassword = crypto.randomBytes(32).toString('hex');
        
        const userData = {
          name: sabitoUser.name || sabitoUser.email,
          email: sabitoUser.email,
          password: randomPassword,
          sabitoUserId: sabitoUser.id,
          role: 'staff',
          isFirstLogin: true
        };

        // Add metadata if User model supports it
        if (apiKey) {
          try {
            userData.metadata = {
              sabitoApiKey: apiKey,
              sabitoInstallationId: installation?.id
            };
          } catch (e) {
            // Metadata not supported, skip
          }
        }

        user = await User.create(userData);
      }

      if (!user.isActive) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=account_inactive`);
      }

      // Generate ABS JWT token
      const nexproToken = generateToken(user.id);

      // Get user memberships
      const memberships = await UserTenant.findAll({
        where: { userId: user.id, status: 'active' },
        include: [
          {
            model: Tenant,
            as: 'tenant'
          }
        ],
        order: [
          ['isDefault', 'DESC'],
          ['createdAt', 'ASC']
        ]
      });

      // Auto-populate organization settings from Sabito business info
      if (memberships.length > 0) {
        const defaultTenant = memberships[0].tenant;
        const nexproTenantId = defaultTenant?.id;
        
        if (nexproTenantId) {
            try {
            // Check if organization settings are incomplete
            // Import settings utility functions (they're defined in settingsController but we need them here)
            const Setting = require('../models').Setting;
            
            const getSettingValue = async (tenantId, key, fallback = {}) => {
              const setting = await Setting.findOne({ where: { tenantId, key } });
              return setting ? setting.value : fallback;
            };
            
            const upsertSettingValue = async (tenantId, key, value, description = null) => {
              const [setting] = await Setting.findOrCreate({
                where: { tenantId, key },
                defaults: {
                  tenantId,
                  key,
                  value,
                  description
                }
              });
              await setting.update({ value, description });
              return setting.value;
            };
            const existingOrgSettings = await getSettingValue(nexproTenantId, 'organization', {});
            
            const isIncomplete = !existingOrgSettings?.name || 
                                !existingOrgSettings?.email || 
                                !existingOrgSettings?.phone ||
                                existingOrgSettings?.name === 'My Workspace';
            
            // Get business info from Sabito business object (new structure)
            console.log('[SSO GET] 🔍 Processing business object for tenant:', nexproTenantId, {
              hasBusiness: !!sabitoBusiness,
              existingOrgSettings: {
                name: existingOrgSettings?.name,
                email: existingOrgSettings?.email,
                phone: existingOrgSettings?.phone,
                isIncomplete
              },
              businessObject: sabitoBusiness ? JSON.stringify(sabitoBusiness, null, 2) : 'null'
            });
            
            if (sabitoBusiness) {
            console.log('='.repeat(100));
            console.log('[SSO GET] 📋 EXTRACTING BUSINESS FIELDS FROM SABITO');
            console.log('='.repeat(100));
            console.log('[SSO GET] Business Object Type:', typeof sabitoBusiness);
            console.log('[SSO GET] Business Object Value:', sabitoBusiness);
            console.log('[SSO GET] Business Object Stringified:', JSON.stringify(sabitoBusiness, null, 2));
            
            const businessName = sabitoBusiness?.name;
            const businessEmail = sabitoBusiness?.email;
            const businessPhone = sabitoBusiness?.phone;
            const businessAddress = sabitoBusiness?.address;
            const businessWebsite = sabitoBusiness?.website;
            const businessDescription = sabitoBusiness?.description;
            const businessIndustry = sabitoBusiness?.industry;
            
            console.log('[SSO GET] Extracted Values:');
            console.log('  - businessName:', businessName, `(${typeof businessName})`);
            console.log('  - businessEmail:', businessEmail, `(${typeof businessEmail})`);
            console.log('  - businessPhone:', businessPhone, `(${typeof businessPhone})`);
            console.log('  - businessAddress:', businessAddress, `(${typeof businessAddress})`);
            console.log('  - businessWebsite:', businessWebsite, `(${typeof businessWebsite})`);
            console.log('  - businessDescription:', businessDescription, `(${typeof businessDescription})`);
            console.log('  - businessIndustry:', businessIndustry, `(${typeof businessIndustry})`);
            console.log('='.repeat(100));
            
            console.log('[SSO GET] 📋 Extracted business fields (summary):', {
              businessName: businessName || 'MISSING',
              businessEmail: businessEmail || 'MISSING',
              businessPhone: businessPhone || 'MISSING',
              businessAddress: businessAddress || 'MISSING',
              businessWebsite: businessWebsite || 'MISSING',
              businessDescription: businessDescription || 'MISSING',
              businessIndustry: businessIndustry || 'MISSING'
            });
              
              // Check if we should auto-populate (if incomplete or if business has any fields)
              const hasAnyBusinessData = businessName || businessEmail || businessPhone;
              const shouldAutoPopulate = isIncomplete || (hasAnyBusinessData && !existingOrgSettings?.name);
              
              console.log('[SSO GET] 🤔 Auto-populate decision:', {
                hasAnyBusinessData,
                isIncomplete,
                existingName: existingOrgSettings?.name,
                shouldAutoPopulate
              });
              
              // Populate with whatever business data is available
              if (shouldAutoPopulate && hasAnyBusinessData) {
                // Parse address if it's a string, otherwise use as object
                let addressObj = existingOrgSettings?.address || {};
                if (businessAddress) {
                  if (typeof businessAddress === 'string') {
                    // If address is a string, try to parse it or use as line1
                    addressObj = {
                      ...addressObj,
                      line1: businessAddress
                    };
                  } else if (typeof businessAddress === 'object') {
                    // If address is an object, merge it
                    addressObj = {
                      ...addressObj,
                      ...businessAddress
                    };
                  }
                }
                
                const orgUpdate = {
                  ...existingOrgSettings,
                  name: existingOrgSettings?.name || businessName || defaultTenant.name,
                  email: existingOrgSettings?.email || businessEmail || '',
                  phone: existingOrgSettings?.phone || businessPhone || '',
                  legalName: existingOrgSettings?.legalName || businessName || '',
                  website: existingOrgSettings?.website || businessWebsite || '',
                  address: addressObj,
                  tax: existingOrgSettings?.tax || {}
                };
                
                console.log('[SSO GET] 💾 Saving organization settings:', {
                  tenantId: nexproTenantId,
                  orgUpdate: JSON.stringify(orgUpdate, null, 2),
                  name: orgUpdate.name,
                  email: orgUpdate.email,
                  phone: orgUpdate.phone
                });
                
                const savedSettings = await upsertSettingValue(nexproTenantId, 'organization', orgUpdate);
                
                console.log('[SSO GET] ✅ Organization settings saved:', {
                  tenantId: nexproTenantId,
                  savedSettings: JSON.stringify(savedSettings, null, 2),
                  savedName: savedSettings?.name,
                  savedEmail: savedSettings?.email,
                  savedPhone: savedSettings?.phone
                });
                
                // Also update tenant name if we have business name
                if (businessName && (defaultTenant.name === 'My Workspace' || !defaultTenant.name)) {
                  defaultTenant.name = businessName;
                  await defaultTenant.save();
                }
                
                // Update tenant metadata with additional business info
                const tenantMetadata = defaultTenant.metadata || {};
                if (businessWebsite) tenantMetadata.website = businessWebsite;
                if (businessDescription) tenantMetadata.description = businessDescription;
                if (businessIndustry) tenantMetadata.industry = businessIndustry;
                if (Object.keys(tenantMetadata).length > 0) {
                  defaultTenant.metadata = tenantMetadata;
                  await defaultTenant.save();
                }
                
                console.log('[SSO GET] ✅ Auto-populated organization settings from Sabito business object:', {
                  tenantId: nexproTenantId,
                  name: orgUpdate.name,
                  email: orgUpdate.email,
                  phone: orgUpdate.phone,
                  website: orgUpdate.website,
                  hasAddress: !!businessAddress,
                  businessName,
                  businessEmail,
                  businessPhone
                });
              } else {
                console.log('[SSO GET] ⚠️ Sabito business object present but no data to populate:', {
                  hasBusinessName: !!businessName,
                  hasBusinessEmail: !!businessEmail,
                  hasBusinessPhone: !!businessPhone,
                  isIncomplete,
                  shouldAutoPopulate
                });
              }
            } else {
              // Fallback to old structure if business object doesn't exist
              const businessName = sabitoUser.businessName || installation?.businessName;
              const businessEmail = sabitoUser.businessEmail || installation?.businessEmail || sabitoUser.email;
              const businessPhone = sabitoUser.businessPhone || installation?.businessPhone;
              
              if (isIncomplete && (businessName || businessEmail || businessPhone)) {
                const orgUpdate = {
                  ...existingOrgSettings,
                  name: existingOrgSettings?.name || businessName || defaultTenant.name,
                  email: existingOrgSettings?.email || businessEmail || '',
                  phone: existingOrgSettings?.phone || businessPhone || '',
                  legalName: existingOrgSettings?.legalName || businessName || '',
                  address: existingOrgSettings?.address || {},
                  tax: existingOrgSettings?.tax || {}
                };
                
                await upsertSettingValue(nexproTenantId, 'organization', orgUpdate);
                
                if (businessName && defaultTenant.name === 'My Workspace') {
                  defaultTenant.name = businessName;
                  await defaultTenant.save();
                }
                
                console.log('[SSO GET] ✅ Auto-populated organization settings from Sabito (fallback):', {
                  tenantId: nexproTenantId,
                  name: orgUpdate.name,
                  email: orgUpdate.email,
                  phone: orgUpdate.phone
                });
              }
            }
          } catch (orgError) {
            console.error('[SSO GET] Error auto-populating organization settings:', orgError.message);
            // Don't fail SSO if this fails
          }
        }
      }

      // Auto-create tenant mapping and store tenant ID in Sabito installation settings
      if (sabitoUser.businessId && memberships.length > 0) {
        const defaultTenant = memberships[0].tenant;
        const nexproTenantId = defaultTenant?.id;
        
        if (nexproTenantId && installation?.id) {
          // Store tenant ID in Sabito installation settings
          try {
            await axios.put(
              `${sabitoApiUrl}/api/apps/installations/${installation.id}/settings`,
              {
                settings: {
                  nexproTenantId: nexproTenantId,
                  ...(installation.settings || {})
                },
                fromSettings: false,
                fallbackToBusinessId: true
              },
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'X-API-Key': sabitoApiKey,
                  'Content-Type': 'application/json'
                },
                timeout: 10000
              }
            );
            
            console.log('[SSO GET] ✅ Stored ABS tenant ID in Sabito installation:', {
              installationId: installation.id,
              nexproTenantId,
              businessId: sabitoUser.businessId
            });
          } catch (settingsError) {
            console.error('[SSO GET] Error storing tenant ID in Sabito installation:', {
              message: settingsError.message,
              response: settingsError.response?.data
            });
          }
          
          // Auto-create tenant mapping in ABS database
          try {
            const { SabitoTenantMapping } = require('../models');
            
            if (defaultTenant) {
              const existingMapping = await SabitoTenantMapping.findOne({
                where: { sabitoBusinessId: sabitoUser.businessId }
              });

              if (!existingMapping) {
                await SabitoTenantMapping.create({
                  sabitoBusinessId: sabitoUser.businessId,
                  nexproTenantId: defaultTenant.id,
                  businessName: sabitoUser.businessName || defaultTenant.name
                });
                console.log('[SSO GET] Auto-created tenant mapping for business:', sabitoUser.businessId);
              }
            }
          } catch (mappingError) {
            console.error('[SSO GET] Error auto-creating tenant mapping:', mappingError.message);
          }
        }
      }

      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/sso-callback?token=${nexproToken}&success=true`);

    } catch (sabitoError) {
      console.error('='.repeat(100));
      console.error('[SSO GET] ❌ SABITO TOKEN VERIFICATION ERROR');
      console.error('='.repeat(100));
      console.error('[SSO GET] Error Type:', sabitoError.name);
      console.error('[SSO GET] Error Message:', sabitoError.message);
      console.error('[SSO GET] Error Status:', sabitoError.response?.status);
      console.error('[SSO GET] Error Status Text:', sabitoError.response?.statusText);
      console.error('[SSO GET] Error Response Data:', JSON.stringify(sabitoError.response?.data, null, 2));
      console.error('[SSO GET] Full Error:', sabitoError);
      console.error('='.repeat(100));
      
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      if (sabitoError.response?.status === 401 || sabitoError.response?.status === 403) {
        console.log('[SSO GET] 🔄 Redirecting to login (invalid_token)');
        return res.redirect(`${frontendUrl}/login?error=invalid_token`);
      }

      console.log('[SSO GET] 🔄 Redirecting to login (verification_failed)');
      return res.redirect(`${frontendUrl}/login?error=verification_failed`);
    }

  } catch (error) {
    console.error('='.repeat(100));
    console.error('[SSO GET] ❌ UNEXPECTED ERROR');
    console.error('='.repeat(100));
    console.error('[SSO GET] Error Type:', error.name);
    console.error('[SSO GET] Error Message:', error.message);
    console.error('[SSO GET] Error Stack:', error.stack);
    console.error('='.repeat(100));
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    console.log('[SSO GET] 🔄 Redirecting to login (server_error)');
    return res.redirect(`${frontendUrl}/login?error=server_error`);
  }
};


