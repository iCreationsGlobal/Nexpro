const { Setting, SubscriptionPlan } = require('../models');
const {
  FEATURE_CATALOG,
  FEATURE_CATEGORIES,
  DEFAULT_PLAN_SEAT_LIMITS,
  DEFAULT_PLAN_BRANCH_LIMITS,
  PLAN_SEAT_PRICING,
  DEFAULT_STORAGE_LIMITS,
  STORAGE_PRICING,
  getFeatureFlagsForPlan,
  getFeaturesByCategory,
} = require('../config/features');

/** Canonical billing tiers; feature matrix UI always shows these columns even if a row was never seeded. */
const CANONICAL_PLAN_IDS = ['trial', 'starter', 'professional', 'enterprise'];
const CANONICAL_PLAN_LABELS = {
  trial: 'Trial',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};
const { MODULES, ALL_FEATURES } = require('../config/modules');
const { getStorageUsageSummary } = require('../utils/storageLimitHelper');
const paystackService = require('../services/paystackService');
const { syncCanonicalPlansToDatabase } = require('../services/subscriptionPlanCatalogService');
const {
  PROVIDERS: PLATFORM_EMAIL_PROVIDERS,
  getPlatformEmailSettingsSummary,
  savePlatformEmailSettings,
  testPlatformEmailConnection,
} = require('../services/platformEmailSettingsService');
const {
  getPlatformSmsSettingsSummary,
  savePlatformSmsSettings,
  testPlatformSmsConnection,
  migrateLegacySmsSender,
} = require('../services/platformSmsSettingsService');
const PLATFORM_EMAIL_ACCEPTED_PROVIDERS = [...PLATFORM_EMAIL_PROVIDERS, 'gmail'];
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

const CORE_SETTINGS_KEYS = [
  'platform:branding',
  'platform:featureFlags',
  'platform:communications',
  'platform:email',
  'platform:sms',
];

exports.getPlatformSettings = async (req, res, next) => {
  try {
    const settings = await Setting.findAll({
      where: {
        tenantId: null,
        key: CORE_SETTINGS_KEYS
      }
    });

    const payload = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value || {};
      return acc;
    }, {});

    CORE_SETTINGS_KEYS.forEach((key) => {
      if (!payload[key]) {
        payload[key] = {};
      }
    });

    payload['platform:email'] = await getPlatformEmailSettingsSummary();
    payload['platform:sms'] = await getPlatformSmsSettingsSummary();
    await migrateLegacySmsSender();

    res.status(200).json({
      success: true,
      data: payload
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePlatformSettings = async (req, res, next) => {
  try {
    const { branding, featureFlags, communications, platformEmail, platformSms } = req.body || {};
    if (platformEmail?.provider && !PLATFORM_EMAIL_ACCEPTED_PROVIDERS.includes(String(platformEmail.provider).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported platform email provider. Choose SendGrid or SMTP.'
      });
    }

    const upserts = [
      {
        key: 'platform:branding',
        value: branding
      },
      {
        key: 'platform:featureFlags',
        value: featureFlags
      },
      {
        key: 'platform:communications',
        value: communications
      }
    ];

    if (platformEmail !== undefined) {
      await savePlatformEmailSettings({
        payload: platformEmail,
        userId: req.user?.id,
      });
    }

    if (platformSms !== undefined) {
      await savePlatformSmsSettings({
        payload: platformSms,
        userId: req.user?.id,
      });
    }

    await Promise.all(
      upserts.map(async ({ key, value }) => {
        await Setting.upsert({
          tenantId: null,
          key,
          value: value || {}
        });
      })
    );

    res.status(200).json({
      success: true,
      message: 'Platform settings updated'
    });
  } catch (error) {
    next(error);
  }
};

exports.testPlatformEmailSettings = async (req, res, next) => {
  try {
    const { platformEmail } = req.body || {};
    if (!platformEmail || typeof platformEmail !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Platform email settings are required',
      });
    }
    if (platformEmail.provider && !PLATFORM_EMAIL_ACCEPTED_PROVIDERS.includes(String(platformEmail.provider).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported platform email provider. Choose SendGrid or SMTP.',
      });
    }

    const result = await testPlatformEmailConnection({
      payload: platformEmail,
      userId: req.user?.id,
      requestId: req.id || req.headers?.['x-request-id'],
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        provider: result.provider,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.testPlatformSmsSettings = async (req, res, next) => {
  try {
    const { platformSms } = req.body || {};
    if (!platformSms || typeof platformSms !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Platform SMS settings are required',
      });
    }

    const result = await testPlatformSmsConnection({
      payload: platformSms,
      userId: req.user?.id,
      requestId: req.id || req.headers?.['x-request-id'],
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        provider: result.provider,
        ...(result.data ? { balance: result.data } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// Subscription Plan Management (CMS)
// =====================================================

/**
 * @desc    Get all subscription plans (admin view)
 * @route   GET /api/platform/plans
 * @access  Platform Admin Only
 */
exports.getSubscriptionPlans = async (req, res, next) => {
  try {
    console.log('[platformSettingsController] getSubscriptionPlans: Fetching plans from database...');
    console.log('[platformSettingsController] getSubscriptionPlans: SubscriptionPlan model:', SubscriptionPlan ? 'found' : 'not found');
    
    // First check count
    const count = await SubscriptionPlan.count();
    console.log('[platformSettingsController] getSubscriptionPlans: Total plans in database:', count);
    
    // Get all plans without filtering by isActive
    const plans = await SubscriptionPlan.findAll({
      order: [['order', 'ASC'], ['createdAt', 'ASC']]
    });
    
    // Log active/inactive breakdown
    const activeCount = plans.filter(p => p.isActive).length;
    const inactiveCount = plans.filter(p => !p.isActive).length;
    console.log('[platformSettingsController] getSubscriptionPlans: Active plans:', activeCount);
    console.log('[platformSettingsController] getSubscriptionPlans: Inactive plans:', inactiveCount);

    console.log('[platformSettingsController] getSubscriptionPlans: Found plans:', plans.length);
    console.log('[platformSettingsController] getSubscriptionPlans: Plans raw:', plans);
    
    if (plans.length > 0) {
      console.log('[platformSettingsController] getSubscriptionPlans: First plan:', JSON.stringify(plans[0].toJSON(), null, 2));
    } else {
      console.log('[platformSettingsController] getSubscriptionPlans: No plans found in database!');
      console.log('[platformSettingsController] getSubscriptionPlans: Check if plans table exists and has data');
    }

    const response = {
      success: true,
      count: plans.length,
      data: plans.map(plan => plan.toJSON ? plan.toJSON() : plan)
    };

    console.log('[platformSettingsController] getSubscriptionPlans: Response count:', response.count);
    console.log('[platformSettingsController] getSubscriptionPlans: Response data length:', response.data.length);
    console.log('[platformSettingsController] getSubscriptionPlans: Response JSON size:', JSON.stringify(response).length, 'bytes');
    
    res.status(200).json(response);
  } catch (error) {
    console.error('[platformSettingsController] getSubscriptionPlans: Error:', error);
    console.error('[platformSettingsController] getSubscriptionPlans: Error stack:', error.stack);
    next(error);
  }
};

/**
 * @desc    Get single subscription plan
 * @route   GET /api/platform/plans/:id
 * @access  Platform Admin Only
 */
exports.getSubscriptionPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByPk(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    res.status(200).json({
      success: true,
      data: plan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create new subscription plan
 * @route   POST /api/platform/plans
 * @access  Platform Admin Only
 */
exports.createSubscriptionPlan = async (req, res, next) => {
  try {
    const {
      planId,
      order,
      name,
      description,
      price,
      highlights,
      marketing,
      onboarding,
      isActive,
      metadata,
      seatLimit,
      seatPricePerAdditional,
      branchLimit,
      storageLimitMB,
      storagePrice100GB,
    } = req.body;

    // Check if planId already exists
    const existingPlan = await SubscriptionPlan.findOne({ where: { planId } });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: `A plan with ID "${planId}" already exists`
      });
    }

    const plan = await SubscriptionPlan.create({
      planId,
      order: order || 0,
      name,
      description,
      price: price || {},
      highlights: highlights || [],
      marketing: marketing || {},
      onboarding: onboarding || {},
      isActive: isActive !== undefined ? isActive : true,
      metadata: metadata || {},
      seatLimit: seatLimit !== undefined && seatLimit !== '' ? Number(seatLimit) : null,
      seatPricePerAdditional:
        seatPricePerAdditional !== undefined && seatPricePerAdditional !== ''
          ? Number(seatPricePerAdditional)
          : null,
      branchLimit: branchLimit !== undefined && branchLimit !== '' ? Number(branchLimit) : null,
      storageLimitMB:
        storageLimitMB !== undefined && storageLimitMB !== '' ? Number(storageLimitMB) : null,
      storagePrice100GB:
        storagePrice100GB !== undefined && storagePrice100GB !== ''
          ? Number(storagePrice100GB)
          : null,
    });

    res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully',
      data: plan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update subscription plan
 * @route   PUT /api/platform/plans/:id
 * @access  Platform Admin Only
 */
exports.updateSubscriptionPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByPk(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    const {
      planId,
      order,
      name,
      description,
      price,
      highlights,
      marketing,
      onboarding,
      isActive,
      metadata,
      seatLimit,
      seatPricePerAdditional,
      branchLimit,
      storageLimitMB,
      storagePrice100GB,
    } = req.body;

    // If planId is being changed, check for duplicates
    if (planId && planId !== plan.planId) {
      const existingPlan = await SubscriptionPlan.findOne({ where: { planId } });
      if (existingPlan) {
        return res.status(400).json({
          success: false,
          message: `A plan with ID "${planId}" already exists`
        });
      }
    }

    await plan.update({
      planId: planId || plan.planId,
      order: order !== undefined ? order : plan.order,
      name: name || plan.name,
      description: description !== undefined ? description : plan.description,
      price: price || plan.price,
      highlights: highlights !== undefined ? highlights : plan.highlights,
      marketing: marketing || plan.marketing,
      onboarding: onboarding || plan.onboarding,
      isActive: isActive !== undefined ? isActive : plan.isActive,
      metadata: metadata !== undefined ? metadata : plan.metadata,
      seatLimit:
        seatLimit !== undefined
          ? seatLimit === '' || seatLimit === null
            ? null
            : Number(seatLimit)
          : plan.seatLimit,
      seatPricePerAdditional:
        seatPricePerAdditional !== undefined
          ? seatPricePerAdditional === '' || seatPricePerAdditional === null
            ? null
            : Number(seatPricePerAdditional)
          : plan.seatPricePerAdditional,
      branchLimit:
        branchLimit !== undefined
          ? branchLimit === '' || branchLimit === null
            ? null
            : Number(branchLimit)
          : plan.branchLimit,
      storageLimitMB:
        storageLimitMB !== undefined
          ? storageLimitMB === '' || storageLimitMB === null
            ? null
            : Number(storageLimitMB)
          : plan.storageLimitMB,
      storagePrice100GB:
        storagePrice100GB !== undefined
          ? storagePrice100GB === '' || storagePrice100GB === null
            ? null
            : Number(storagePrice100GB)
          : plan.storagePrice100GB,
    });

    res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully',
      data: plan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete subscription plan
 * @route   DELETE /api/platform/plans/:id
 * @access  Platform Admin Only
 */
exports.deleteSubscriptionPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByPk(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    await plan.destroy();

    res.status(200).json({
      success: true,
      message: 'Subscription plan deleted successfully',
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Bulk update plan order
 * @route   PUT /api/platform/plans/bulk/reorder
 * @access  Platform Admin Only
 */
exports.reorderSubscriptionPlans = async (req, res, next) => {
  try {
    const { planOrders } = req.body; // Expected format: [{ id: 'uuid', order: 1 }, ...]

    if (!Array.isArray(planOrders)) {
      return res.status(400).json({
        success: false,
        message: 'planOrders must be an array'
      });
    }

    await Promise.all(
      planOrders.map(({ id, order }) =>
        SubscriptionPlan.update({ order }, { where: { id } })
      )
    );

    res.status(200).json({
      success: true,
      message: 'Plan order updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get feature catalog (legacy - returns flat features)
 * @route   GET /api/platform-settings/features
 * @access  Platform Admin Only
 */
exports.getFeatureCatalog = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        features: FEATURE_CATALOG,
        categories: FEATURE_CATEGORIES,
        seatLimits: DEFAULT_PLAN_SEAT_LIMITS,
        branchLimits: DEFAULT_PLAN_BRANCH_LIMITS,
        featuresByCategory: getFeaturesByCategory()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Sync plans from Paystack to database
 * @route   POST /api/platform-settings/plans/sync-paystack
 * @access  Platform Admin Only
 */
exports.syncPaystackPlans = async (req, res, next) => {
  try {
    if (!paystackService.secretKey) {
      return res.status(400).json({
        success: false,
        message: 'Paystack secret key not configured',
      });
    }

    const result = await syncCanonicalPlansToDatabase();

    res.status(200).json({
      success: true,
      message: `Synced ${result.synced.length} canonical public plans from Paystack`,
      synced: result.synced.length,
      paystackPlanCount: result.paystackPlanCount,
      plans: result.synced,
      ignored: result.ignored,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error('[platformSettingsController] syncPaystackPlans: Error:', error);
    next(error);
  }
};

/**
 * @desc    Get modules (organized features for pricing)
 * @route   GET /api/platform-settings/modules
 * @access  Platform Admin Only
 */
exports.getModules = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        modules: MODULES,
        allFeatures: ALL_FEATURES,
        totalModules: MODULES.length,
        totalFeatures: ALL_FEATURES.length
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get feature-plan matrix (feature rows x plan columns)
 * @route   GET /api/platform-settings/feature-matrix
 * @access  Platform Admin Only
 */
exports.getFeaturePlanMatrix = async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.findAll({
      order: [['order', 'ASC'], ['createdAt', 'ASC']],
      attributes: ['id', 'planId', 'name', 'order', 'marketing']
    });
    const featureKeys = FEATURE_CATALOG.map((f) => f.key);
    const matrix = {};
    for (const plan of plans) {
      const pid = String(plan.planId || '').toLowerCase();
      const canonicalFlags = getFeatureFlagsForPlan(pid);
      const flags = plan?.marketing?.featureFlags && typeof plan.marketing.featureFlags === 'object'
        ? { ...canonicalFlags, ...plan.marketing.featureFlags }
        : canonicalFlags;
      matrix[pid] = featureKeys.reduce((acc, key) => {
        acc[key] = flags[key] === true;
        return acc;
      }, {});
    }

    for (const canonicalId of CANONICAL_PLAN_IDS) {
      if (!matrix[canonicalId]) {
        const flags = getFeatureFlagsForPlan(canonicalId);
        matrix[canonicalId] = featureKeys.reduce((acc, key) => {
          acc[key] = flags[key] === true;
          return acc;
        }, {});
      }
    }

    res.status(200).json({
      success: true,
      data: {
        plans: plans.map((p) => ({
          id: p.id,
          planId: p.planId,
          name: p.name,
          order: p.order
        })),
        features: FEATURE_CATALOG,
        matrix
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update feature-plan matrix
 * @route   PUT /api/platform-settings/feature-matrix
 * @access  Platform Admin Only
 */
exports.updateFeaturePlanMatrix = async (req, res, next) => {
  const tx = await sequelize.transaction();
  try {
    const rawMatrix = req.body?.matrix;
    if (!rawMatrix || typeof rawMatrix !== 'object') {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'matrix object is required' });
    }

    const matrix = Object.fromEntries(
      Object.entries(rawMatrix).map(([k, v]) => [String(k || '').toLowerCase(), v])
    );

    const validFeatureKeys = new Set(FEATURE_CATALOG.map((f) => f.key));
    const canonicalSet = new Set(CANONICAL_PLAN_IDS);
    const planIds = Object.keys(matrix);

    for (const planId of planIds) {
      if (!canonicalSet.has(planId)) continue;
      await SubscriptionPlan.findOrCreate({
        where: { planId },
        defaults: {
          planId,
          name: CANONICAL_PLAN_LABELS[planId] || planId,
          order: Math.max(0, CANONICAL_PLAN_IDS.indexOf(planId)),
          description: null,
          price: {},
          highlights: [],
          marketing: {},
          onboarding: {},
          seatLimit: DEFAULT_PLAN_SEAT_LIMITS[planId] ?? null,
          seatPricePerAdditional: PLAN_SEAT_PRICING[planId] ?? null,
          branchLimit: DEFAULT_PLAN_BRANCH_LIMITS[planId] ?? null,
          storageLimitMB: DEFAULT_STORAGE_LIMITS[planId] ?? null,
          storagePrice100GB: STORAGE_PRICING[planId] ?? null,
          isActive: true,
          metadata: { autoCreatedFrom: 'feature-matrix' },
        },
        transaction: tx,
      });
    }

    const plans = await SubscriptionPlan.findAll({
      where: { planId: { [Op.in]: planIds } },
      transaction: tx
    });
    const foundPlanIds = new Set(plans.map((p) => String(p.planId || '').toLowerCase()));
    const unknownPlanIds = planIds.filter((p) => !foundPlanIds.has(p));

    for (const plan of plans) {
      const pid = String(plan.planId || '').toLowerCase();
      const row = matrix[pid] || {};
      const nextFlags = {};
      for (const [featureKey, value] of Object.entries(row)) {
        if (!validFeatureKeys.has(featureKey)) {
          await tx.rollback();
          return res.status(400).json({ success: false, message: `Unknown feature key: ${featureKey}` });
        }
        nextFlags[featureKey] = value === true;
      }
      for (const key of validFeatureKeys) {
        if (!Object.prototype.hasOwnProperty.call(nextFlags, key)) {
          nextFlags[key] = false;
        }
      }
      const marketing = { ...(plan.marketing || {}) };
      marketing.featureFlags = nextFlags;
      await plan.update({ marketing }, { transaction: tx });
    }

    await tx.commit();
    // The Feature Table matrix isn't scoped to one tenant, so drop every tenant's cached
    // entitlements rather than waiting out the TTL — otherwise a flag flip here can look
    // like it "isn't working" for up to a minute after saving.
    require('../middleware/cache').invalidateAllEntitlementsCache();
    res.status(200).json({
      success: true,
      message: unknownPlanIds.length > 0
        ? `Feature matrix updated (ignored unknown plans: ${unknownPlanIds.join(', ')})`
        : 'Feature matrix updated',
      ignoredPlans: unknownPlanIds
    });
  } catch (error) {
    await tx.rollback();
    next(error);
  }
};

/**
 * @desc    Get storage usage for a tenant
 * @route   GET /api/platform-settings/storage-usage/:tenantId
 * @access  Platform Admin Only
 */
exports.getTenantStorageUsage = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const storageUsage = await getStorageUsageSummary(tenantId);

    res.status(200).json({
      success: true,
      data: storageUsage
    });
  } catch (error) {
    next(error);
  }
};


