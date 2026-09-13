import { SUPPORT_EMAIL } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions - Sabito",
  description:
    "Terms governing use of Sabito — the marketer referral platform connected to African Business Suite.",
};

export default function TermsAndConditionsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900">Terms and Conditions</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: August 2, 2026</p>

      <div className="prose-sabito mt-10 space-y-10 text-slate-600">
        <section>
          <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
          <p className="mt-3 leading-relaxed">
            By accessing and using Sabito (&quot;the Platform&quot;), you accept and agree to be
            bound by these Terms. If you do not agree, do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">2. Platform Overview</h2>
          <p className="mt-3 leading-relaxed">
            Sabito is a performance-based referral platform that connects marketers with businesses
            running on African Business Suite (ABS). Marketers join on Sabito; businesses enable
            Sabito Partners in ABS. Marketers refer clients by email and/or phone and earn
            commission when payment is collected.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">3. User Accounts</h2>
          <h3 className="mt-4 font-semibold text-slate-800">3.1 Account types</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Marketer accounts:</strong> Created on Sabito for individuals or agencies who
              refer clients to partner businesses.
            </li>
            <li>
              <strong>Business accounts:</strong> Created on ABS. Businesses enable Sabito Partners
              in Settings; they do not sign up as businesses on Sabito.
            </li>
          </ul>
          <h3 className="mt-4 font-semibold text-slate-800">3.2 Registration</h3>
          <p className="mt-2 leading-relaxed">
            You must provide accurate, current, and complete information. You are responsible for
            maintaining the confidentiality of your credentials and for all activity under your
            account.
          </p>
          <h3 className="mt-4 font-semibold text-slate-800">3.3 Security</h3>
          <p className="mt-2 leading-relaxed">
            Notify us immediately of any unauthorized use. We are not liable for loss arising from
            your failure to secure your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">4. Business Terms</h2>
          <h3 className="mt-4 font-semibold text-slate-800">4.1 Profile &amp; rates</h3>
          <p className="mt-2 leading-relaxed">
            Businesses must keep accurate information about services and commission rates in ABS
            Sabito Partners settings.
          </p>
          <h3 className="mt-4 font-semibold text-slate-800">4.2 Commission obligations</h3>
          <p className="mt-2 leading-relaxed">
            Businesses agree to honor stated commission rates for successful referrals when payment
            is collected. Businesses remit commissions to ABS. Once collected, marketers may request
            cashout of their share; ABS processes and records the payout.
          </p>
          <h3 className="mt-4 font-semibold text-slate-800">4.3 ABS billing</h3>
          <p className="mt-2 leading-relaxed">
            Business software access and billing are governed by African Business Suite terms and
            plans, separate from marketer commissions.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">5. Marketer Terms</h2>
          <h3 className="mt-4 font-semibold text-slate-800">5.1 Referral quality</h3>
          <p className="mt-2 leading-relaxed">
            Marketers must provide genuine referrals. Spam, fraud, or low-quality leads may result
            in suspension or termination.
          </p>
          <h3 className="mt-4 font-semibold text-slate-800">5.2 Commission earnings</h3>
          <p className="mt-2 leading-relaxed">
            Commissions accrue when referred customers&apos; payments are collected and matched
            (first-touch on email/phone). Cashouts are subject to business verification and payment.
          </p>
          <h3 className="mt-4 font-semibold text-slate-800">5.3 Conduct</h3>
          <p className="mt-2 leading-relaxed">
            Represent partner businesses accurately. Misrepresentation or false claims is
            prohibited.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">6. Payments</h2>
          <p className="mt-3 leading-relaxed">
            Sabito facilitates tracking of referrals, earnings, and cashout requests. Commission
            payments are made by businesses to marketers outside the Platform (e.g. MoMo or bank).
            Sabito does not guarantee payment. Disputes should be resolved between the parties;
            contact support if you need assistance navigating a dispute.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">7. Prohibited Activities</h2>
          <p className="mt-3">Users must not:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Violate any laws or regulations</li>
            <li>Infringe intellectual property rights</li>
            <li>Post false, misleading, or fraudulent content</li>
            <li>Manipulate attribution, ratings, or referrals</li>
            <li>Engage in spam or harassment</li>
            <li>Interfere with or disrupt Platform operation</li>
            <li>Use the Platform for unauthorized commercial purposes</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">8. Content and Intellectual Property</h2>
          <p className="mt-3 leading-relaxed">
            You retain ownership of content you submit. You grant Sabito a worldwide, non-exclusive,
            royalty-free license to use and display that content for Platform operations. Platform
            features and branding are owned by Sabito and protected by applicable IP laws.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">9. Termination</h2>
          <p className="mt-3 leading-relaxed">
            You may stop using Sabito and request account closure via support. We may suspend or
            terminate accounts that violate these Terms, engage in fraud, or for other legitimate
            reasons. Outstanding obligations remain after termination.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">10. Disclaimers and Liability</h2>
          <p className="mt-3 leading-relaxed">
            The Platform is provided &quot;as is&quot; without warranties of any kind. Sabito is not
            a party to agreements between businesses and marketers and is not responsible for
            non-payment or disputes arising from those relationships. To the fullest extent
            permitted by law, Sabito is not liable for indirect, incidental, or consequential
            damages.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">11. Modifications</h2>
          <p className="mt-3 leading-relaxed">
            We may modify these Terms at any time. Significant changes may be communicated via email
            or Platform notice. Continued use after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">12. Governing Law</h2>
          <p className="mt-3 leading-relaxed">
            These Terms are governed by the laws of Ghana. Disputes are subject to the exclusive
            jurisdiction of the courts of Ghana.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">13. Contact</h2>
          <p className="mt-3 leading-relaxed">
            Questions about these Terms:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[var(--sabito-green)]">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
