const { plans: configPlans, lastUpdated: configLastUpdated } = require('../config/plans');
const { SubscriptionPlan } = require('../models');
const { pickKnownFeatureFlags } = require('../config/features');
const {
  expandPlansWithPaystackVariants,
  getEnterprisePublicPricing,
} = require('../services/subscriptionPlanCatalogService');

const configPlanById = new Map(configPlans.map((plan) => [plan.id, plan]));

const sortPlans = (collection = []) =>
  [...collection].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

const normalizeEnterprisePricingCopy = (plan) => {
  const id = String(plan?.id || plan?.planId || '').toLowerCase();
  if (id !== 'enterprise') return plan;

  const canonical = configPlanById.get('enterprise');
  if (!canonical) return plan;

  const previousMarketing =
    plan.marketing && typeof plan.marketing === 'object' ? plan.marketing : {};
  const canonicalMarketing = canonical.marketing || {};

  return {
    ...plan,
    highlights: canonical.highlights || plan.highlights || [],
    marketing: {
      ...previousMarketing,
      ...canonicalMarketing,
      enabled: previousMarketing.enabled ?? canonicalMarketing.enabled,
      popular: previousMarketing.popular ?? canonicalMarketing.popular,
      badgeLabel: previousMarketing.badgeLabel ?? canonicalMarketing.badgeLabel,
      cta: previousMarketing.cta ?? canonicalMarketing.cta,
      featureFlags: {
        ...(canonicalMarketing.featureFlags || {}),
        ...(previousMarketing.featureFlags || {}),
      },
      perks: canonicalMarketing.perks || previousMarketing.perks || [],
    },
  };
};

const mapPlanForOnboarding = (plan) => ({
  id: plan.id,
  value: plan.id,
  title: plan.name,
  subtitle: plan.onboarding?.subtitle || plan.price?.billingPeriodLabel || null,
  price: plan.price?.display || null,
  badge: plan.onboarding?.badge || (plan.marketing?.badgeLabel || null),
  description: plan.description,
  features: plan.highlights || [],
  perks: plan.marketing?.perks || [],
  cta: plan.onboarding?.ctaLabel || 'Select plan',
  isDefault: Boolean(plan.onboarding?.isDefault),
  billingDescription: plan.price?.billingDescription || null,
  priceMeta: plan.price || null,
});

const mapPlanForMarketing = (plan, opts = {}) => {
  const { interval = null, priceOverride = null } = opts;
  const price = priceOverride ?? plan.price;
  const displayPrice =
    priceOverride?.display || plan.marketing?.priceDisplay || price?.display || null;
  const cta = plan.marketing?.cta;
  const ctaLabel = typeof cta === 'object' && cta?.label ? cta.label : (cta || 'Start trial');

  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: displayPrice,
    priceMeta: {
      amount: price?.amount ?? null,
      currency: price?.currency ?? 'GHS',
      display: price?.display ?? displayPrice,
      billingDescription: price?.billingDescription || null,
    },
    billing: priceOverride?.billingDescription || plan.marketing?.billing || price?.billingDescription || null,
    perks: plan.marketing?.perks || [],
    highlights: plan.highlights || [],
    features: pickKnownFeatureFlags(plan.marketing?.featureFlags),
    popular: Boolean(plan.marketing?.popular),
    badge: plan.marketing?.badgeLabel || null,
    cta: typeof cta === 'object' ? { ...cta, label: cta.label || ctaLabel } : { label: ctaLabel },
    interval,
  };
};

exports.getPublicPlans = async (req, res) => {
  try {
    const channel = (req.query.channel || 'all').toLowerCase();

    let plans = [];
    let lastUpdated = new Date();
    let source = 'config';

    try {
      const dbPlans = await SubscriptionPlan.findAll({
        where: { isActive: true },
        order: [['order', 'ASC']],
      });

      if (dbPlans && dbPlans.length > 0) {
        plans = dbPlans.map((record) => ({
          id: record.planId,
          order: record.order,
          name: record.name,
          description: record.description,
          price: record.price,
          highlights: record.highlights,
          marketing: record.marketing,
          onboarding: record.onboarding,
          metadata: record.metadata,
        })).map(normalizeEnterprisePricingCopy);
        lastUpdated = Math.max(...dbPlans.map((p) => new Date(p.updatedAt)));
        source = 'database';
      }
    } catch (dbError) {
      console.warn('Failed to fetch plans from database, falling back to config:', dbError.message);
    }

    if (plans.length === 0) {
      plans = configPlans.map(normalizeEnterprisePricingCopy);
      lastUpdated = configLastUpdated;
      source = 'config';
    }

    let dataset;
    switch (channel) {
      case 'marketing': {
        const marketingPlans = sortPlans(
          plans.filter((plan) => plan.marketing?.enabled !== false)
        );
        dataset = expandPlansWithPaystackVariants(marketingPlans, mapPlanForMarketing);
        break;
      }
      case 'onboarding':
        dataset = sortPlans(
          plans.filter((plan) => plan.onboarding?.enabled !== false)
        ).map(mapPlanForOnboarding);
        break;
      default:
        dataset = sortPlans(plans);
    }

    const enterprise = getEnterprisePublicPricing();

    res.status(200).json({
      success: true,
      channel,
      count: dataset.length,
      data: dataset,
      enterprise,
      lastUpdated,
      source,
    });
  } catch (error) {
    console.error('Error fetching public plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pricing plans',
      error: error.message,
    });
  }
};
