import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Privacy Policy for ${SITE_NAME}.`,
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: `Privacy Policy | ${SITE_NAME}`,
    description: `How ${SITE_NAME} collects and uses personal data.`,
    url: `${SITE_URL}/privacy`,
    type: 'article',
  },
}

const EFFECTIVE_DATE = 'March 26, 2026'

export default function PrivacyPage() {
  return (
    <main className="bg-white">
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-sm text-gray-600 mb-8">Effective date: {EFFECTIVE_DATE}</p>

          <div className="space-y-8 text-gray-700">
            <p>
              This Privacy Policy explains how {SITE_NAME} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects, uses,
              discloses, and protects personal information when you use our website and services.
            </p>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">1. Information We Collect</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Account and business profile information (such as name, email, phone number, and business details).
                </li>
                <li>
                  Customer and operational data you submit through the platform (such as invoices, quotes, products, and contacts).
                </li>
                <li>
                  Technical information (such as IP address, browser type, device information, and usage logs).
                </li>
                <li>
                  Communication data for notifications and messaging channels you configure (such as email, SMS, and WhatsApp settings).
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">2. How We Use Information</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide, maintain, and improve the platform.</li>
                <li>Process transactions and deliver core product features.</li>
                <li>Send product, operational, and support communications.</li>
                <li>Secure accounts, prevent abuse, and detect fraud.</li>
                <li>Comply with legal and regulatory obligations.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">3. Legal Bases (Where Applicable)</h2>
              <p>
                Depending on your location, we process personal information under one or more lawful bases, including
                contract performance, legitimate interests, legal obligations, and consent.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">4. Sharing of Information</h2>
              <p>
                We may share information with trusted service providers (for hosting, analytics, payments, email, SMS,
                and messaging integrations) only as needed to provide our services. We do not sell personal data.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">5. Data Retention</h2>
              <p>
                We retain personal information for as long as necessary to provide services, meet legal obligations,
                resolve disputes, and enforce our agreements.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">6. Security</h2>
              <p>
                We use reasonable administrative, technical, and organizational safeguards to protect personal
                information. No system is completely secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">7. Your Rights</h2>
              <p>
                Depending on your location, you may have rights to access, correct, delete, or restrict use of your
                personal information, and to object to certain processing.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">8. Data Deletion Requests</h2>
              <p>
                To request deletion of your data, contact us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#166534] underline">
                  {CONTACT_EMAIL}
                </a>{' '}
                with the subject line &quot;Data Deletion Request&quot; and include your account details.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">9. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Updated versions will be posted on this page with
                a revised effective date.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">10. Contact</h2>
              <p>
                If you have questions about this Privacy Policy, contact us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#166534] underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
              <p className="text-sm text-gray-600">
                You can also review our{' '}
                <Link href="/terms" className="text-[#166534] underline">
                  Terms of Service
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}
