import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ABS_BUSINESS_SIGNUP_URL } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commission Guide - Sabito | Set Competitive Partner Rates",
  description:
    "Learn how to set first-client and returning-client commission rates in ABS Sabito Partners so marketers earn on collected payment.",
};

const NEW_CLIENT_TIERS = [
  { label: "Conservative", value: "5–10%", note: "May attract fewer marketers", recommended: false },
  { label: "Recommended", value: "10–25%", note: "Best balance of cost and quality", recommended: true },
  { label: "Aggressive", value: "25–40%", note: "Attracts many marketers, higher cost", recommended: false },
];

const RETURNING_TIERS = [
  { label: "Recommended", value: "5–10%", note: "Standard for relationship maintenance", recommended: true },
  { label: "Higher", value: "10–15%", note: "Rewards quality referrals that return", recommended: false },
];

const PRACTICES = [
  {
    title: "Research your industry",
    body: "Check what rates similar ABS businesses offer. Competitive rates attract stronger marketers.",
  },
  {
    title: "Consider your margins",
    body: "Set rates you can afford after costs. Commission is due only when payment is collected.",
  },
  {
    title: "Start competitive, adjust later",
    body: "You can update rates in Settings → Sabito Partners. New partnerships use your current rates.",
  },
  {
    title: "Reward quality",
    body: "Higher first-client rates attract marketers. Lower returning rates keep repeat work sustainable.",
  },
  {
    title: "Be transparent",
    body: "Clear rates on your partner listing build trust. Marketers promote businesses they understand.",
  },
];

export default function CommissionGuidePage() {
  return (
    <div>
      <section className="border-b border-brand-200 bg-[var(--sabito-mint)]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h1 className="text-4xl font-bold tracking-tight text-brand-900 md:text-5xl">
            Commission guide
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-600">
            Set competitive rates in ABS that attract quality marketers and drive results — you only
            pay when payment is collected.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl space-y-12 px-4 py-14">
        <div>
          <h2 className="text-2xl font-bold text-brand-900">Understanding commission rates</h2>
          <p className="mt-3 text-brand-600 leading-relaxed">
            Commission rates are the percentage of a customer&apos;s collected payment that you pay
            marketers for successful referrals. Configure them when you enable Sabito Partners in
            African Business Suite Settings.
          </p>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-white p-6">
          <h2 className="text-xl font-bold text-brand-900">Commission for new clients</h2>
          <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
            What is it?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-600">
            The percentage of the customer&apos;s payment you pay when a <strong>new client</strong>{" "}
            referred by a marketer completes their first paid work with you.
          </p>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
            Example
          </h3>
          <p className="mt-2 text-sm text-brand-600">
            If a new client pays ₵1,000 and your rate is 15%, you pay ₵150 to the marketer.
          </p>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
            Recommendation
          </h3>
          <p className="mt-2 text-sm text-brand-600">
            <strong>Higher rates (10–25%)</strong> attract more marketers and increase quality
            referrals.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {NEW_CLIENT_TIERS.map((tier) => (
              <div
                key={tier.label}
                className={`rounded-xl border p-4 ${
                  tier.recommended
                    ? "border-[var(--sabito-green)] bg-[var(--sabito-mint)]"
                    : "border-brand-200 bg-brand-50"
                }`}
              >
                <p className="text-xs font-semibold uppercase text-brand-500">{tier.label}</p>
                <p className="mt-1 text-lg font-bold text-brand-900">{tier.value}</p>
                <p className="mt-1 text-xs text-brand-500">{tier.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-white p-6">
          <h2 className="text-xl font-bold text-brand-900">Commission for returning clients</h2>
          <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
            What is it?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-600">
            The percentage paid when an <strong>existing client</strong> brought by a marketer comes
            back for more work.
          </p>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
            Example
          </h3>
          <p className="mt-2 text-sm text-brand-600">
            If a returning client pays ₵1,000 and your rate is 10%, you pay ₵100 to the marketer.
          </p>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
            Recommendation
          </h3>
          <p className="mt-2 text-sm text-brand-600">
            <strong>Lower rates (5–10%)</strong> for relationship maintenance are standard — the
            marketer already did the initial work.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {RETURNING_TIERS.map((tier) => (
              <div
                key={tier.label}
                className={`rounded-xl border p-4 ${
                  tier.recommended
                    ? "border-[var(--sabito-green)] bg-[var(--sabito-mint)]"
                    : "border-brand-200 bg-brand-50"
                }`}
              >
                <p className="text-xs font-semibold uppercase text-brand-500">{tier.label}</p>
                <p className="mt-1 text-lg font-bold text-brand-900">{tier.value}</p>
                <p className="mt-1 text-xs text-brand-500">{tier.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-brand-900">Best practices</h2>
          <div className="mt-6 space-y-4">
            {PRACTICES.map((item, i) => (
              <div key={item.title} className="rounded-xl border border-brand-200 bg-white p-5">
                <h3 className="font-semibold text-brand-900">
                  {i + 1}. {item.title}
                </h3>
                <p className="mt-2 text-sm text-brand-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-brand-900">FAQ</h2>
          <div className="mt-6 space-y-3">
            {[
              [
                "Can I change my commission rates later?",
                "Yes. Update rates anytime in ABS Settings → Sabito Partners. Existing referrals already earned keep their original rates.",
              ],
              [
                "When do I pay commissions?",
                "Customer payments generate commissions. The business remits these to ABS. After remittance, marketers request cashout of their share and ABS records the payout.",
              ],
              [
                "What's the difference between new and returning rates?",
                "New-client rates apply to the first paid work from a referred customer. Returning rates apply when that customer comes back — rewarding marketers for quality that sticks.",
              ],
              [
                "Are there Sabito platform fees on commissions?",
                "You pay marketers the rates you set. Business software billing is through your ABS plan — not a separate Sabito SaaS fee on this marketing site.",
              ],
            ].map(([q, a]) => (
              <details key={q} className="rounded-xl border border-brand-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold text-brand-900">{q}</summary>
                <p className="mt-2 text-sm text-brand-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-brand-200 bg-brand-50">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="text-2xl font-bold text-brand-900">Ready to set your rates?</h2>
          <p className="mt-2 text-brand-600">
            Sign up on ABS, enable Sabito Partners, and start attracting marketers.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/pricing">
              <Button variant="outline">View pricing</Button>
            </Link>
            <a href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
              <Button>Get started on ABS</Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
