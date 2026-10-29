import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Zap, Crown, Building2, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE_URL } from '../services/api';

const PLAN_ICONS = {
  starter: Zap,
  professional: Crown,
  enterprise: Building2,
};

const ENTERPRISE_LIMIT_FEATURES = [
  'Up to 10 seats',
  'Up to 10 branches/locations/shops',
];

const uniqueFeatureList = (features = []) => {
  const seen = new Set();
  return features.filter((feature) => {
    const normalized = String(feature || '').trim();
    if (!normalized) return false;
    const key = normalized.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizePlanFeatures = (planId, features = []) => {
  if (planId !== 'enterprise') return uniqueFeatureList(features);

  const filtered = features.filter(
    (feature) => !/unlimited\s+(?:seats?|users?|team members?)/i.test(String(feature || ''))
  );
  const hasSeatLimit = filtered.some((feature) =>
    /up to\s+10\s+(?:seats?|users?)/i.test(String(feature || ''))
  );
  const hasBranchLimit = filtered.some((feature) =>
    /up to\s+10\s+(?:branches?|locations?|shops?)/i.test(String(feature || ''))
  );

  return uniqueFeatureList([
    ...filtered,
    ...(hasSeatLimit ? [] : [ENTERPRISE_LIMIT_FEATURES[0]]),
    ...(hasBranchLimit ? [] : [ENTERPRISE_LIMIT_FEATURES[1]]),
  ]);
};

/** Minimal fallback when public pricing API is unavailable */
const FALLBACK_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for owner-led businesses getting started.',
    monthlyPrice: 129,
    yearlyTotal: 1188,
    features: [
      '1 user',
      '1 branch/location/shop',
      'Dashboard & analytics',
      'Customer & vendor management',
      'Invoices & payments',
      'Basic reporting',
      'Email support',
    ],
    popular: false,
    contactSales: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Complete business management for growing teams.',
    monthlyPrice: 250,
    yearlyTotal: 2388,
    features: [
      'Up to 3 users',
      'Up to 3 branches/locations/shops',
      'Everything in Starter',
      'Jobs & quotes management',
      'Inventory tracking',
      'Advanced reports & analytics',
      'Payroll & accounting',
      'Priority support',
    ],
    popular: true,
    contactSales: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Tailored for large-scale operations.',
    monthlyPrice: null,
    yearlyTotal: null,
    features: [
      'Up to 10 seats',
      'Up to 10 branches/locations/shops',
      'Dedicated success manager',
      'Custom workflow configuration',
      '24/7 priority support',
    ],
    popular: false,
    contactSales: true,
  },
];

/**
 * Normalize marketing API rows into plan cards grouped by id.
 * @param {Array} apiRows
 */
const normalizeMarketingPlans = (apiRows, enterprisePricing) => {
  if (!Array.isArray(apiRows) || apiRows.length === 0) return null;

  const byId = new Map();
  for (const row of apiRows) {
    const id = (row.id || '').toLowerCase();
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: row.name?.replace(/\s*\((?:monthly|yearly|annually)\)/gi, '').trim() || id,
        description: row.description || '',
        monthlyPrice: null,
        yearlyTotal: null,
        features: normalizePlanFeatures(id, row.perks?.length ? row.perks : row.highlights || []),
        popular: Boolean(row.popular),
        contactSales: id === 'enterprise' || row.priceMeta?.amount == null,
      });
    }
    const plan = byId.get(id);
    const amount = row.priceMeta?.amount;
    if (amount == null) continue;
    if (row.interval === 'monthly') plan.monthlyPrice = amount;
    if (row.interval === 'annually' || row.interval === 'yearly') plan.yearlyTotal = amount;
  }

  const order = ['starter', 'professional', 'enterprise'];
  if (enterprisePricing && !byId.has('enterprise')) {
    byId.set('enterprise', {
      id: 'enterprise',
      name: enterprisePricing.name || 'Enterprise',
      description: enterprisePricing.description || 'Tailored for large-scale operations.',
      monthlyPrice: null,
      yearlyTotal: null,
      features: Array.isArray(enterprisePricing.tiers)
        ? enterprisePricing.tiers.map(
            (tier) =>
              `${tier.name}: ${tier.seatLimit} users, ${tier.branchLimit} branches, GHS ${tier.licenseFeeGhs.toLocaleString()} license + GHS ${tier.cloudPlanAnnualGhs.toLocaleString()}/year cloud`
          )
        : ['Manual contract and billing', 'Cloud renewal due after year 1'],
      popular: false,
      contactSales: true,
    });
  }
  const plans = order.map((id) => byId.get(id)).filter(Boolean);
  return plans.length ? plans : null;
};

const calculateAnnualSavingsPercent = (plan) => {
  if (plan.monthlyPrice == null || plan.yearlyTotal == null) return 0;
  const monthlyAnnualTotal = plan.monthlyPrice * 12;
  const savings = monthlyAnnualTotal - plan.yearlyTotal;
  if (monthlyAnnualTotal <= 0 || savings <= 0) return 0;
  return Math.floor((savings / monthlyAnnualTotal) * 100);
};

const Plans = () => {
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('yearly');
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [trialMonths, setTrialMonths] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const base = API_BASE_URL ? `${API_BASE_URL}/api` : '/api';
    fetch(`${base}/public/pricing?channel=marketing`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json?.success) return;
        const normalized = normalizeMarketingPlans(json.data, json.enterprise);
        if (normalized?.length) setPlans(normalized);
        if (Number.isInteger(json.trialMonths) && json.trialMonths > 0) setTrialMonths(json.trialMonths);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearlyPerMonthByPlan = useMemo(() => {
    const map = {};
    plans.forEach((p) => {
      if (p.yearlyTotal != null) map[p.id] = Math.round((p.yearlyTotal / 12) * 100) / 100;
    });
    return map;
  }, [plans]);

  const maxAnnualSavingsPercent = useMemo(
    () => plans.reduce((max, plan) => Math.max(max, calculateAnnualSavingsPercent(plan)), 0),
    [plans]
  );

  const handleSelectPlan = useCallback(
    (plan) => {
      if (plan.contactSales) {
        window.open('mailto:contact@nexpro.com?subject=Enterprise%20Plan%20Inquiry', '_blank');
        return;
      }
      const isYearly = billingPeriod === 'yearly';
      const price = isYearly ? plan.yearlyTotal : plan.monthlyPrice;
      navigate('/checkout', {
        state: {
          plan: plan.id,
          billingPeriod,
          price,
        },
      });
    },
    [billingPeriod, navigate]
  );

  return (
    <div className="min-h-screen bg-muted/50">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Choose Your Plan</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Select the plan that best fits your business needs. All plans include a {trialMonths}-month free trial.
          </p>

          <div className="flex items-center justify-center gap-2 mt-6">
            <span
              className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              Monthly
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={billingPeriod === 'yearly'}
              onClick={() => setBillingPeriod((p) => (p === 'monthly' ? 'yearly' : 'monthly'))}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${
                billingPeriod === 'yearly' ? 'bg-brand' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white ring-0 transition duration-200 ease-in-out ${
                  billingPeriod === 'yearly' ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${billingPeriod === 'yearly' ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              Yearly
            </span>
            {maxAnnualSavingsPercent > 0 && (
              <span className="text-xs text-green-600 font-medium ml-1">
                Save up to {maxAnnualSavingsPercent}%
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const Icon = PLAN_ICONS[plan.id] || Zap;
              const isYearly = billingPeriod === 'yearly';
              const yearlyPerMonth = yearlyPerMonthByPlan[plan.id];
              const priceDisplay = plan.contactSales
                ? "Let's talk"
                : isYearly && yearlyPerMonth != null
                  ? `₵ ${yearlyPerMonth}/mo`
                  : plan.monthlyPrice != null
                    ? `₵ ${plan.monthlyPrice}/mo`
                    : "Let's talk";

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col ${
                    plan.popular ? 'border-brand border-2' : 'border-gray-200'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-brand text-white px-3 py-0.5 rounded-full text-xs font-semibold">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 rounded-lg bg-brand-10">
                        <Icon className="h-5 w-5 text-brand" />
                      </div>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="mb-6">
                      <span className="text-2xl font-bold">{priceDisplay}</span>
                      {!plan.contactSales && (
                        <span className="text-sm text-muted-foreground ml-1">
                          {isYearly ? 'billed annually' : 'billed monthly'}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-3">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-brand flex-shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="w-full"
                          variant={plan.popular ? 'default' : 'outline'}
                          onClick={() => handleSelectPlan(plan)}
                        >
                          {plan.contactSales ? 'Contact Sales' : `Choose ${plan.name}`}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {plan.contactSales
                          ? 'Contact sales for custom pricing'
                          : `Select ${plan.name} plan`}
                      </TooltipContent>
                    </Tooltip>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Plans;
