import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ABS_BUSINESS_SIGNUP_URL, ABS_SITE_URL } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing - Sabito | Transparent Plans for Marketers & Businesses",
  description:
    "Marketers join Sabito free. Businesses use African Business Suite and enable Sabito Partners — pay commission only on collected payments.",
};

const PLANS = [
  {
    name: "Marketer",
    price: "Free",
    period: "",
    blurb: "Join Sabito and earn on referrals",
    popular: false,
    cta: { label: "Join as marketer", href: "/signup", external: false },
    features: [
      "Free marketer account",
      "Apply to unlimited partner businesses",
      "Refer by email or phone",
      "Track earnings and cashouts",
      "Web + mobile marketer app",
    ],
  },
  {
    name: "Business (ABS)",
    price: "ABS plan",
    period: "",
    blurb: "Run your business on ABS, then enable Sabito Partners",
    popular: true,
    cta: { label: "Go to ABS", href: ABS_BUSINESS_SIGNUP_URL, external: true },
    features: [
      "Full African Business Suite workspace",
      "Enable Sabito Partners in Settings",
      "Set first-client & returning rates",
      "Approve marketers & track referrals",
      "Remit commissions to ABS for marketer payouts",
      "Commission only when payment is collected",
    ],
  },
  {
    name: "Commission model",
    price: "You set %",
    period: "",
    blurb: "Performance-based — no fee until results",
    popular: false,
    cta: { label: "Commission guide", href: "/commission-guide", external: false },
    features: [
      "Businesses set commission % per service",
      "First-touch attribution on email/phone",
      "Due when customer payment is collected",
      "Marketers request cashout on their schedule",
      "Payouts handled outside ABS (MoMo/bank)",
    ],
  },
];

export default function PricingPage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Find a plan to power your growth
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Marketers use Sabito free. Businesses run on{" "}
            <a
              href={ABS_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--sabito-green)]"
            >
              African Business Suite
            </a>
            , then enable Sabito Partners — commissions accrue when customers pay and become withdrawable after remittance to ABS.
          </p>
          <p className="mt-3 text-sm text-slate-500">Secure business billing on ABS · MoMo or card</p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                plan.popular
                  ? "border-[var(--sabito-green)] ring-1 ring-[var(--sabito-green)]"
                  : "border-slate-200"
              }`}
            >
              {plan.popular ? (
                <span className="absolute -top-3 left-6 rounded-full bg-[var(--sabito-green)] px-3 py-0.5 text-xs font-semibold text-white">
                  Most popular for businesses
                </span>
              ) : null}
              <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>
              <p className="mt-1 text-3xl font-bold text-slate-900">{plan.price}</p>
              {plan.period ? <p className="text-sm text-slate-500">{plan.period}</p> : null}
              <p className="mt-2 text-sm text-slate-600">{plan.blurb}</p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sabito-green)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {plan.cta.external ? (
                  <a href={plan.cta.href} target="_blank" rel="noopener noreferrer" className="block">
                    <Button className="w-full" variant={plan.popular ? "primary" : "outline"}>
                      {plan.cta.label}
                    </Button>
                  </a>
                ) : (
                  <Link href={plan.cta.href} className="block">
                    <Button className="w-full" variant={plan.popular ? "primary" : "outline"}>
                      {plan.cta.label}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="text-center text-2xl font-bold text-slate-900">Pricing FAQ</h2>
          <div className="mt-8 space-y-3">
            {[
              [
                "Is Sabito free for marketers?",
                "Yes. Creating a marketer account and applying to partners is free. You earn commission set by each business.",
              ],
              [
                "What do businesses pay?",
                "Businesses subscribe to African Business Suite for their workspace. Sabito Partners is enabled in Settings. You pay marketers the commission rates you configure — only after collected payment.",
              ],
              [
                "Are there Sabito platform fees on commissions?",
                "Commission goes to the marketer per your ABS Sabito Partners rates. Business software billing is through ABS, not a separate Sabito SaaS fee on this site.",
              ],
            ].map(([q, a]) => (
              <details key={q} className="rounded-xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold text-slate-900">{q}</summary>
                <p className="mt-2 text-sm text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
