"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, UserRound, ClipboardList, Send, ChartNoAxesColumnIncreasing } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listPartners, type MarketplaceBusiness } from "@/lib/api";
import { BusinessCard } from "@/components/businesses/BusinessCard";
import { Button } from "@/components/ui/button";
import { ABS_BUSINESS_SIGNUP_URL } from "@/lib/constants";
import { SABITO_CATEGORY_CHIPS, sabitoCategoryQuery, type SabitoCategoryChipId } from "@/lib/partnerCategories";

const STEPS = [
  { n: "01", icon: UserRound, title: "Create your account", body: "Sign up free with your email and phone number." },
  { n: "02", icon: ClipboardList, title: "Choose a business", body: "Browse businesses on the platform and send an application." },
  { n: "03", icon: Send, title: "Refer a client", body: "Submit the client's email or phone number." },
  { n: "04", icon: ChartNoAxesColumnIncreasing, title: "Earn and cash out", body: "Earn when the client pays, then withdraw your commission." },
];

export default function HomePage() {
  const [businesses, setBusinesses] = useState<MarketplaceBusiness[]>([]);
  const [category, setCategory] = useState<SabitoCategoryChipId>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setBusinesses([]);
        setLoading(false);
      }
    }, 8000);

    (async () => {
      setLoading(true);
      try {
        const data = await listPartners({ category: sabitoCategoryQuery(category) });
        if (!cancelled) setBusinesses(data);
      } catch {
        if (!cancelled) setBusinesses([]);
      } finally {
        window.clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [category]);

  const preview = useMemo(() => businesses.slice(0, 4), [businesses]);

  return (
    <div>
      <section className="sabito-hero" aria-labelledby="hero-heading">
        <div className="sabito-hero-inner">
          <div className="sabito-hero-copy">
            <div className="sabito-hero-brand">
              <Image src="/brand/sabito-icon.png" alt="" width={48} height={48} />
              <span>Sabito</span>
            </div>
            <h1 id="hero-heading">Make money with<br /><span>your phone</span></h1>
            <p className="sabito-hero-description">
              Connect clients to trusted businesses and earn<br className="hidden xl:block" /> a commission when deals are completed.
            </p>
            <div className="sabito-hero-actions">
              <a className="sabito-hero-button sabito-hero-button-primary" href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
                Sign up as business <ArrowRight aria-hidden="true" />
              </a>
              <Link className="sabito-hero-button sabito-hero-button-secondary" href="/signup">
                Join as marketer <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <p className="sabito-hero-note">
              Businesses sign up on ABS (absghana.com), then enable Sabito Partners in Settings.
            </p>
          </div>
          <div className="sabito-hero-visual">
            <Image
              src="/brand/marketing/hero-man-phone.png"
              alt="A smiling man celebrating while looking at his phone"
              fill
              priority
              sizes="(max-width: 767px) 100vw, 58vw"
              className="sabito-hero-portrait"
            />
            <div className="sabito-hero-commission">
              <span className="sabito-hero-check"><Check aria-hidden="true" strokeWidth={4} /></span>
              <div><p>Commission received</p><strong>GHS 800</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="sabito-how" aria-labelledby="how-heading">
        <div className="sabito-how-inner">
          <header className="sabito-how-heading">
            <div><h2 id="how-heading">How it works</h2><p>Start earning in four simple steps.</p></div>
            <Link href="/how-it-works">Full guide <ArrowRight aria-hidden="true" size={20} /></Link>
          </header>
          <ol className="sabito-how-steps">
            {STEPS.map((step) => (
              <li key={step.n}>
                <div className="sabito-how-track"><span><step.icon aria-hidden="true" size={25} strokeWidth={1.8} /></span></div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="sabito-audience-background">
      <section className="sabito-audience" aria-labelledby="audience-heading">
        <header className="sabito-audience-heading">
          <h2 id="audience-heading">Who is Sabito for?</h2>
          <p>For people who connect clients and businesses ready to grow.</p>
        </header>
        <div className="sabito-audience-grid">
          <article className="sabito-audience-card sabito-audience-marketer">
            <div className="sabito-audience-copy">
              <p className="sabito-audience-label">For marketers</p>
              <h3>Earn by making connections</h3>
              <ul>
                {["Find businesses to partner with", "Refer interested clients", "Earn when a client pays"].map((text) => (
                  <li key={text}><span><Check aria-hidden="true" strokeWidth={3.5} /></span>{text}</li>
                ))}
              </ul>
              <Link href="/signup" className="sabito-audience-cta">Join as a marketer</Link>
            </div>
            <div className="sabito-audience-photo">
              <Image src="/brand/marketing/audience-marketer.png" alt="A smiling marketer using his phone" fill sizes="(max-width: 600px) 90vw, (max-width: 1100px) 40vw, 22vw" />
            </div>
          </article>
          <article className="sabito-audience-card sabito-audience-business">
            <div className="sabito-audience-copy">
              <p className="sabito-audience-label">For businesses</p>
              <h3>Reach more customers</h3>
              <ul>
                {["Connect with trusted marketers", "Receive qualified referrals", "Pay commission on successful sales"].map((text) => (
                  <li key={text}><span><Check aria-hidden="true" strokeWidth={3.5} /></span>{text}</li>
                ))}
              </ul>
              <a href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="sabito-audience-cta">Join as a business</a>
            </div>
            <div className="sabito-audience-photo">
              <Image src="/brand/marketing/audience-business.png" alt="A smiling business owner in her shop" fill sizes="(max-width: 600px) 90vw, (max-width: 1100px) 40vw, 22vw" />
            </div>
          </article>
        </div>
      </section>
      </div>

      {/* Marketplace */}
      <section className="sabito-partners" aria-labelledby="partners-heading">
        <div className="sabito-partners-heading">
          <div>
            <h2 id="partners-heading">Partner businesses</h2>
            <p className="sabito-partners-description">
              Discover businesses you can partner with and earn from successful referrals.
            </p>
          </div>
          <Link href="/businesses" className="sabito-partners-see-all">
            See all <ArrowRight aria-hidden="true" size={20} />
          </Link>
        </div>

        <div className="sabito-partner-filters" aria-label="Business categories">
          {SABITO_CATEGORY_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCategory(chip.id)}
              aria-pressed={category === chip.id}
              className={`sabito-partner-filter ${category === chip.id ? "is-active" : ""}`}
            >
              {chip.id === "all" ? "All" : chip.id === "print_photo" ? "Print & Branding" : chip.label}
            </button>
          ))}
        </div>

        <div className="sabito-partner-grid" aria-live="polite">
          {loading ? (
            <p className="col-span-full text-sm text-brand-500">Loading partners…</p>
          ) : preview.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-brand-300 bg-[var(--sabito-mint)] px-6 py-14 text-center">
              <p className="text-xl font-semibold text-brand-900">Marketplace is warming up</p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-brand-600">
                No partner businesses are listed yet. Create your marketer account now — when
                businesses enable Sabito Partners in ABS, you&apos;ll be ready to apply.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">I&apos;m a business — go to ABS</Button>
                </a>
                <Link href="/signup">
                  <Button>I&apos;m a marketer — join Sabito</Button>
                </Link>
              </div>
            </div>
          ) : (
            preview.map((b) => <BusinessCard key={b.id} business={b} featured />)
          )}
        </div>
      </section>

      <section className="sabito-benefits" aria-labelledby="benefits-heading">
        <div className="sabito-benefits-inner">
          <h2 id="benefits-heading">Why marketers choose Sabito</h2>
          <p className="sabito-benefits-description">Simple referrals, clear earnings and flexible payouts.</p>
          <div className="sabito-benefits-grid">
            {[
              { title: "Refer in seconds", body: "Submit a client's email or phone number. We handle the matching." },
              { title: "Earn on real sales", body: "Your commission is confirmed when the client completes payment." },
              { title: "Cash out when ready", body: "Request your payout whenever your available balance is ready." },
            ].map(({ title, body }) => (
              <div key={title} className="sabito-benefit">
                <div><h3>{title}</h3><p>{body}</p></div>
              </div>
            ))}
          </div>
          <Link href="/signup" className="sabito-benefits-cta">Start earning today</Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-brand-900">Got questions?</h2>
        <div className="mt-8 space-y-3">
          {[
            [
              "What is Sabito?",
              "A marketer app where you partner with ABS businesses, refer customers by email or phone, and earn commission when payment is collected.",
            ],
            [
              "How do referrals match?",
              "You submit the client’s email and/or phone. ABS matches that to the business’s customer record (first touch wins).",
            ],
            [
              "When do I earn?",
              "When the customer’s payment is collected — not just when a quote is created.",
            ],
            [
              "How do I get paid?",
              "After the business remits your commission to ABS, your available balance is ready for cashout. Request a payout in Sabito; ABS pays your marketer share by MoMo or bank.",
            ],
            [
              "How do businesses join?",
              "Sign up on African Business Suite at absghana.com, then enable Sabito Partners in ABS Settings to list on this marketplace.",
            ],
          ].map(([q, a], i) => (
            <details key={q} className="rounded-xl border border-brand-200 bg-white p-4">
              <summary className="cursor-pointer font-semibold text-brand-900">
                {String(i + 1).padStart(2, "0")} · {q}
              </summary>
              <p className="mt-2 text-sm text-brand-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Bottom CTA band */}
      <section className="sabito-bottom-cta relative overflow-hidden">
        <div className="relative mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold">Ready to earn with Sabito?</h2>
            <p className="sabito-bottom-description mt-2 max-w-xl">
              Marketers join here. Businesses start on ABS, then turn on Sabito Partners.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="sabito-bottom-button sabito-bottom-button-outline">
              Sign up as business
            </a>
            <Link href="/signup" className="sabito-bottom-button sabito-bottom-button-primary">
              Join as marketer
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
