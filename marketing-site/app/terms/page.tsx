import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `Terms of Service for ${SITE_NAME}.`,
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: `Terms of Service | ${SITE_NAME}`,
    description: `Terms and conditions for using ${SITE_NAME}.`,
    url: `${SITE_URL}/terms`,
    type: 'article',
  },
}

const EFFECTIVE_DATE = 'March 26, 2026'

export default function TermsPage() {
  return (
    <main className="bg-white">
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Terms of Service</h1>
          <p className="text-sm text-gray-600 mb-8">Effective date: {EFFECTIVE_DATE}</p>

          <div className="space-y-8 text-gray-700">
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of {SITE_NAME} (&quot;Service&quot;). By using
              our Service, you agree to these Terms.
            </p>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">1. Use of Service</h2>
              <p>
                You may use the Service only in compliance with applicable laws and these Terms. You are responsible
                for all activity that occurs under your account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">2. Account Responsibilities</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide accurate account and business information.</li>
                <li>Keep credentials secure and do not share unauthorized access.</li>
                <li>Promptly notify us of suspected security incidents.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">3. Acceptable Use</h2>
              <p>
                You must not misuse the Service, attempt unauthorized access, transmit harmful content, or use the
                platform for unlawful, fraudulent, or abusive activities.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">4. Fees and Billing</h2>
              <p>
                Paid features are billed according to your selected plan. You are responsible for applicable taxes and
                charges from third-party integrations you configure.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">5. Third-Party Services</h2>
              <p>
                The Service may integrate with third parties (for example payments, messaging, and email providers).
                Use of those services is subject to their terms and policies.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">6. Intellectual Property</h2>
              <p>
                We retain all rights, title, and interest in the Service and its content, excluding content you submit.
                You grant us the rights needed to operate and improve the Service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">7. Disclaimer</h2>
              <p>
                The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of
                any kind, to the extent permitted by law.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">8. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, we are not liable for indirect, incidental, special,
                consequential, or punitive damages arising from your use of the Service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">9. Termination</h2>
              <p>
                We may suspend or terminate access if these Terms are violated. You may stop using the Service at any
                time.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">10. Changes to Terms</h2>
              <p>
                We may update these Terms from time to time. Continued use of the Service after updates means you
                accept the revised Terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">11. Contact</h2>
              <p>
                For questions about these Terms, contact us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#166534] underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
              <p className="text-sm text-gray-600">
                Also see our{' '}
                <Link href="/privacy" className="text-[#166534] underline">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link href="/data-deletion" className="text-[#166534] underline">
                  Data Deletion Instructions
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
