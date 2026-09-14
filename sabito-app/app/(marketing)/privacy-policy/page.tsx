import { SUPPORT_EMAIL } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Sabito",
  description:
    "How Sabito collects, uses, and protects information for marketers and partners connected to African Business Suite.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-4xl font-bold tracking-tight text-brand-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-brand-500">Last updated: August 2, 2026</p>

      <div className="mt-10 space-y-10 text-brand-600">
        <section>
          <h2 className="text-xl font-bold text-brand-900">1. Introduction</h2>
          <p className="mt-3 leading-relaxed">
            Sabito (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your
            privacy. This Policy explains how we collect, use, disclose, and safeguard information
            when you use Sabito — the marketer app connected to African Business Suite (ABS)
            businesses that enable Sabito Partners.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">2. Information We Collect</h2>
          <h3 className="mt-4 font-semibold text-brand-800">2.1 Information you provide</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Account information:</strong> Name, email, phone, password
            </li>
            <li>
              <strong>Payout details:</strong> MoMo number or bank details you add for cashouts
            </li>
            <li>
              <strong>Referrals:</strong> Client email and/or phone you submit for matching
            </li>
            <li>
              <strong>Communications:</strong> Support inquiries and in-app messages
            </li>
          </ul>
          <h3 className="mt-4 font-semibold text-brand-800">2.2 Automatically collected</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Usage data:</strong> Pages visited, features used, approximate time spent
            </li>
            <li>
              <strong>Device information:</strong> IP address, browser, device type, OS
            </li>
            <li>
              <strong>Cookies / session:</strong> Preferences and session tokens for signed-in use
            </li>
          </ul>
          <h3 className="mt-4 font-semibold text-brand-800">2.3 From ABS partners</h3>
          <p className="mt-2 leading-relaxed">
            When you partner with a business, referral match status, earnings, and cashout status may
            be shared between Sabito and that business&apos;s ABS workspace as needed to operate the
            program.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">3. How We Use Information</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Provide and maintain Sabito services</li>
            <li>Create and manage marketer accounts</li>
            <li>Match referrals to ABS customer records (first-touch email/phone)</li>
            <li>Track commissions and cashout requests</li>
            <li>Send activity and security notifications</li>
            <li>Respond to support requests</li>
            <li>Improve the product and prevent fraud or abuse</li>
            <li>Comply with legal obligations</li>
            <li>Send marketing communications (with your consent, where required)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">4. Sharing and Disclosure</h2>
          <h3 className="mt-4 font-semibold text-brand-800">4.1 With partner businesses</h3>
          <p className="mt-2 leading-relaxed">
            When you apply to or partner with a business, relevant profile and referral information
            is visible to that business in ABS so they can approve partners and pay commissions.
          </p>
          <h3 className="mt-4 font-semibold text-brand-800">4.2 Service providers</h3>
          <p className="mt-2 leading-relaxed">
            We may share information with providers who help operate the Platform (hosting, email,
            analytics). Business software billing for ABS may involve ABS payment processors under
            ABS policies.
          </p>
          <h3 className="mt-4 font-semibold text-brand-800">4.3 Legal &amp; transfers</h3>
          <p className="mt-2 leading-relaxed">
            We may disclose information if required by law or to protect rights and safety. In a
            merger or acquisition, information may transfer to the acquiring entity.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">5. Data Security</h2>
          <p className="mt-3 leading-relaxed">
            We use appropriate technical and organizational measures such as HTTPS, password
            hashing, access controls, and secure hosting. No internet transmission is 100% secure;
            we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">6. Your Rights and Choices</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Access and update account details in Sabito settings</li>
            <li>
              Request account deletion via{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[var(--sabito-green)]">
                {SUPPORT_EMAIL}
              </a>
              ; some records may be retained for legal or integrity purposes
            </li>
            <li>Opt out of marketing emails via unsubscribe links</li>
            <li>Control cookies through your browser (may affect functionality)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">7. Data Retention</h2>
          <p className="mt-3 leading-relaxed">
            We retain information while your account is active and as needed to provide services,
            resolve disputes, and meet legal requirements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">8. Children&apos;s Privacy</h2>
          <p className="mt-3 leading-relaxed">
            Sabito is not intended for users under 18. We do not knowingly collect information from
            children under 18.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">9. International Transfers</h2>
          <p className="mt-3 leading-relaxed">
            Information may be processed in countries other than your own. We take steps to ensure
            appropriate safeguards where required.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">10. Third-Party Links</h2>
          <p className="mt-3 leading-relaxed">
            Sabito may link to ABS and other sites. We are not responsible for their privacy
            practices — review their policies separately.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">11. Changes</h2>
          <p className="mt-3 leading-relaxed">
            We may update this Policy from time to time. Significant changes may be communicated via
            email or Platform notice. Continued use after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">12. Contact</h2>
          <p className="mt-3 leading-relaxed">
            Privacy questions:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[var(--sabito-green)]">
              {SUPPORT_EMAIL}
            </a>
            <br />
            Address: Sabito Platform, Ghana
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-brand-900">13. Consent</h2>
          <p className="mt-3 leading-relaxed">
            By using Sabito, you consent to the collection and use of information as described in
            this Privacy Policy.
          </p>
        </section>
      </div>
    </div>
  );
}
