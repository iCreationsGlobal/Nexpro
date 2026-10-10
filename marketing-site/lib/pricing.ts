import { API_URL, APP_URL } from './constants';

/** API plan item (channel=marketing) */
export interface ApiPlan {
  id: string;
  name: string;
  description: string;
  price: string | null;
  priceMeta: {
    amount: number | null;
    currency: string;
    display: string;
    billingDescription?: string | null;
  };
  billing: string | null;
  perks: string[];
  highlights: string[];
  popular: boolean;
  cta: { label: string; href?: string };
  interval?: string | null;
}

/** Normalized plan for Pricing UI (matches previous PLANS shape + optional yearly) */
export interface MarketingPlan {
  id: string;
  name: string;
  description: string;
  price: {
    amount: number | null;
    currency: string;
    display: string;
    billingDescription?: string;
  };
  priceYearly?: {
    amount: number | null;
    display: string;
    billingDescription?: string;
  };
  perks: string[];
  highlights: string[];
  popular: boolean;
  cta: { label: string; href?: string };
}

/**
 * Derive base plan id for grouping (e.g. starter_monthly + starter_yearly -> starter)
 */
function basePlanId(id: string, interval?: string | null): string {
  const lower = id.toLowerCase();
  if (lower.endsWith('_monthly') || lower.endsWith('_yearly') || lower.endsWith('_annually')) {
    return lower.replace(/_monthly|_yearly|_annually$/, '');
  }
  return lower.replace(/_+/g, '_');
}

/**
 * Fetch plans from backend (Paystack-synced DB). Returns normalized plans for marketing UI.
 * Falls back to empty array on failure (caller can use static PLANS).
 */
export async function fetchMarketingPlans(): Promise<MarketingPlan[]> {
  const url = `${API_URL}/api/public/pricing?channel=marketing`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return [];
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];

    const apiPlans = json.data as ApiPlan[];
    const isYearly = (i?: string | null) =>
      i === 'yearly' || i === 'annually';

    // Group by base id so we can merge monthly/yearly into one card
    const byBase = new Map<string, ApiPlan[]>();
    for (const p of apiPlans) {
      const base = basePlanId(p.id, p.interval);
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base)!.push(p);
    }

    const out: MarketingPlan[] = [];
    for (const [, group] of byBase) {
      const monthly = group.find((p) => !isYearly(p.interval));
      const yearly = group.find((p) => isYearly(p.interval));
      const plan = monthly || yearly || group[0];
      const name = (monthly?.name || yearly?.name || plan.name)
        .replace(/\s*\((?:monthly|yearly|annually)\)/gi, '')
        .trim();

      const contactSales =
        plan.priceMeta?.amount == null ||
        plan.id.toLowerCase().includes('enterprise');

      const ctaLabel =
        typeof plan.cta === 'object' && plan.cta?.label
          ? plan.cta.label
          : 'Start trial';

      const ctaHref = contactSales
        ? '/contact?interest=enterprise'
        : undefined; // Frontend will build signup URL with plan id and billing period

      const priceDisplay =
        plan.priceMeta?.display ?? plan.price ?? '—';
      const billingDesc =
        plan.priceMeta?.billingDescription ?? plan.billing ?? '';

      const baseId = basePlanId(plan.id, plan.interval);

      const buildPrice = (p: ApiPlan) => ({
        amount: p.priceMeta?.amount ?? null,
        currency: p.priceMeta?.currency ?? 'GHS',
        display: p.priceMeta?.display ?? p.price ?? '—',
        billingDescription: p.priceMeta?.billingDescription ?? p.billing ?? '',
      });

      if (monthly && yearly) {
        out.push({
          id: baseId,
          name,
          description: plan.description ?? '',
          price: buildPrice(monthly),
          priceYearly: buildPrice(yearly),
          perks: plan.perks ?? [],
          highlights: plan.highlights ?? [],
          popular: plan.popular ?? false,
          cta: { label: ctaLabel, href: ctaHref },
        });
      } else {
        out.push({
          id: baseId,
          name,
          description: plan.description ?? '',
          price: {
            amount: plan.priceMeta?.amount ?? null,
            currency: plan.priceMeta?.currency ?? 'GHS',
            display: priceDisplay,
            billingDescription: billingDesc,
          },
          perks: plan.perks ?? [],
          highlights: plan.highlights ?? [],
          popular: plan.popular ?? false,
          cta: { label: ctaLabel, href: ctaHref },
        });
      }
    }

    // Sort by order of first occurrence (API already returns sorted)
    return out.sort((a, b) => {
      const ai = apiPlans.findIndex((p) => basePlanId(p.id, p.interval) === a.id);
      const bi = apiPlans.findIndex((p) => basePlanId(p.id, p.interval) === b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  } catch {
    return [];
  }
}
