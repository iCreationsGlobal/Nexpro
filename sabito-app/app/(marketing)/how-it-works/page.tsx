import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ABS_BUSINESS_SIGNUP_URL } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works - Sabito | Performance-Based Referral Marketing",
  description:
    "Learn how Sabito connects ABS businesses with marketers. Refer by email or phone, earn on collected payment, cash out when ready.",
};

const BUSINESS_STEPS = [
  {
    n: 1,
    title: "Sign up on ABS & enable Sabito Partners",
    description:
      "Create your business on African Business Suite, then turn on Sabito Partners in Settings with your commission rates.",
    image: "/brand/marketing/business_step1.png",
  },
  {
    n: 2,
    title: "Approve marketer applications",
    description:
      "Marketers apply to promote your business. Review and approve partners that fit your brand.",
    image: "/brand/marketing/business_step2.png",
  },
  {
    n: 3,
    title: "Track referrals & pay on results",
    description:
      "When a referred customer pays, commission becomes due. Remit it to ABS so the marketer can request cashout of their share.",
    image: "/brand/marketing/business_step3.png",
  },
];

const MARKETER_STEPS = [
  {
    n: 1,
    title: "Join as a marketer",
    description: "Create your Sabito marketer account with email and password — free to start.",
    image: "/brand/marketing/marketer_step1.png",
  },
  {
    n: 2,
    title: "Apply to partner businesses",
    description:
      "Browse ABS businesses that enabled Sabito Partners and apply to the ones you want to promote.",
    image: "/brand/marketing/marketer_step2.png",
  },
  {
    n: 3,
    title: "Refer, earn, cash out",
    description:
      "Submit client email and/or phone. Earn when payment is collected, then request cashout.",
    image: "/brand/marketing/marketer_step3.png",
  },
];

export default function HowItWorksPage() {
  return (
    <div>
      <section className="relative overflow-hidden text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/brand/marketing/how-it-works-hero.webp)" }}
        />
        <div className="absolute inset-0 bg-[#00351f]/80" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center md:py-28">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Get performance-based referrals — only pay when you win
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/85">
            We connect ABS businesses with trusted marketers for real results through strategic
            partnerships.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="onBrandOutline" className="px-7 py-3 text-base">
                Join as business
              </Button>
            </a>
            <Link href="/signup">
              <Button variant="onBrand" className="px-7 py-3 text-base">
                Become a marketer
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16" id="for-businesses">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
          For businesses
        </h2>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {BUSINESS_STEPS.map((step) => (
            <div key={step.n} className="rounded-2xl border border-brand-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sabito-green)] text-sm font-bold text-white">
                  {step.n}
                </span>
                <h3 className="text-lg font-semibold text-brand-900">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-brand-600">{step.description}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={step.image}
                alt=""
                className="mt-5 w-full rounded-xl border border-brand-100 object-cover"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-brand-200 bg-brand-50" id="for-marketers">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--sabito-green)]">
            For marketers
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {MARKETER_STEPS.map((step) => (
              <div key={step.n} className="rounded-2xl border border-brand-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sabito-green)] text-sm font-bold text-white">
                    {step.n}
                  </span>
                  <h3 className="text-lg font-semibold text-brand-900">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-brand-600">{step.description}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={step.image}
                  alt=""
                  className="mt-5 w-full rounded-xl border border-brand-100 object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold text-brand-900">See Sabito in action</h2>
        <div className="mt-6 max-w-3xl space-y-4 text-brand-600">
          <h3 className="text-xl font-semibold text-brand-900">
            Track referrals · Manage partnerships · Earn commissions
          </h3>
          <p>
            Connect with trusted partners, submit referrals by email or phone, and manage cashouts
            in one place — on web and mobile.
          </p>
          <p>
            Monitor matches and earnings in real time. Businesses only owe commission when payment
            is collected. Marketers request cashout when they&apos;re ready.
          </p>
        </div>
      </section>

      <section
        className="relative overflow-hidden text-white"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(20,27,52,0.92), rgba(30,38,66,0.9)), url(/brand/marketing/smiling-woman.jpeg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">Ready to grow smarter with Sabito?</h2>
          <p className="mt-2 text-lg text-white/90">Connect. Refer. Earn. Repeat.</p>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Whether you&apos;re a business looking for performance-based growth or a marketer ready
            to monetize your network — Sabito makes it seamless.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="onBrandOutline">Sign up as business</Button>
            </a>
            <Link href="/signup">
              <Button variant="onBrand">Get started as marketer</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-brand-900">Got questions?</h2>
        <div className="mt-8 space-y-3">
          {[
            [
              "How do referrals match?",
              "You submit the client’s email and/or phone. ABS matches that to the business’s customer record (first touch wins).",
            ],
            [
              "When do marketers earn?",
              "When the customer’s payment is collected — not just when a quote is created.",
            ],
            [
              "How do cashouts work?",
              "Businesses remit commissions to ABS. Once collected, marketers request cashout in Sabito and ABS pays their share by MoMo or bank.",
            ],
          ].map(([q, a]) => (
            <details key={q} className="rounded-xl border border-brand-200 bg-white p-4">
              <summary className="cursor-pointer font-semibold text-brand-900">{q}</summary>
              <p className="mt-2 text-sm text-brand-600">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
