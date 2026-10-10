import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Data Deletion Instructions',
  description: `How to request data deletion for ${SITE_NAME}.`,
  alternates: {
    canonical: '/data-deletion',
  },
  openGraph: {
    title: `Data Deletion Instructions | ${SITE_NAME}`,
    description: `Instructions for requesting deletion of personal data in ${SITE_NAME}.`,
    url: `${SITE_URL}/data-deletion`,
    type: 'article',
  },
}

export default function DataDeletionPage() {
  return (
    <main className="bg-white">
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Data Deletion Instructions</h1>
          <p className="text-gray-700 mb-8">
            This page explains how users can request deletion of personal data associated with {SITE_NAME}.
          </p>

          <div className="space-y-8 text-gray-700">
            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">How to Request Deletion</h2>
              <ol className="list-decimal pl-6 space-y-2">
                <li>
                  Send an email to{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#166534] underline">
                    {CONTACT_EMAIL}
                  </a>
                  .
                </li>
                <li>Use the subject line: &quot;Data Deletion Request&quot;.</li>
                <li>
                  Include your account email, business/workspace name, and details needed for identity verification.
                </li>
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">What We Delete</h2>
              <p>
                After successful verification, we will process deletion of personal data associated with your account,
                subject to legal, tax, fraud-prevention, and compliance obligations.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">Timeline</h2>
              <p>
                We aim to acknowledge requests promptly and complete deletion within a reasonable timeframe based on the
                nature and volume of data.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">Questions</h2>
              <p>
                If you have questions about data deletion, contact{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#166534] underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
              <p className="text-sm text-gray-600">
                Related pages:{' '}
                <Link href="/privacy" className="text-[#166534] underline">
                  Privacy Policy
                </Link>{' '}
                and{' '}
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
