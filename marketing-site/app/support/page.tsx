import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, MapPin, Phone } from 'lucide-react'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'
import {
  APP_URL,
  BRAND_SHORT,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_E164,
  OFFICE_ADDRESS,
  SITE_NAME,
  SITE_URL,
  SUPPORT_HOURS,
  WHATSAPP_SUPPORT_URL,
} from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Support',
  description: `Get help with ${SITE_NAME} (${BRAND_SHORT}) on the web, iPhone and Android.`,
  alternates: {
    canonical: '/support',
  },
  openGraph: {
    title: `Support | ${SITE_NAME}`,
    description: `Contact ${BRAND_SHORT} support by WhatsApp, email or phone.`,
    url: `${SITE_URL}/support`,
    type: 'website',
  },
}

const channels = [
  {
    title: 'WhatsApp',
    description: 'The quickest way to reach us',
    value: 'Chat with support',
    href: WHATSAPP_SUPPORT_URL,
    external: true,
    icon: <WhatsAppIcon size={22} />,
  },
  {
    title: 'Email',
    description: 'Account, billing and data questions',
    value: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${BRAND_SHORT} support`)}`,
    external: false,
    icon: <Mail className="h-[22px] w-[22px]" />,
  },
  {
    title: 'Phone',
    description: SUPPORT_HOURS,
    value: CONTACT_PHONE,
    href: `tel:${CONTACT_PHONE_E164}`,
    external: false,
    icon: <Phone className="h-[22px] w-[22px]" />,
  },
]

export default function SupportPage() {
  return (
    <main className="bg-white">
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Support</h1>
          <p className="text-gray-700 mb-8">
            Help with {SITE_NAME} ({BRAND_SHORT}) — the web app and the {BRAND_SHORT} app for iPhone and Android.
          </p>

          <div className="grid gap-4 sm:grid-cols-3 mb-10">
            {channels.map((channel) => (
              <a
                key={channel.title}
                href={channel.href}
                {...(channel.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="block rounded-lg border border-gray-200 p-5 transition-colors hover:border-[#166534]"
              >
                <span className="mb-3 inline-flex text-[#166534]">{channel.icon}</span>
                <span className="block text-lg font-semibold text-gray-900">{channel.title}</span>
                <span className="mb-2 block text-sm text-gray-600">{channel.description}</span>
                <span className="block break-words font-medium text-[#166534]">{channel.value}</span>
              </a>
            ))}
          </div>

          <div className="space-y-8 text-gray-700">
            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">Help us help you faster</h2>
              <p>When you contact us, please include:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>The email address you sign in with and your business name.</li>
                <li>Where it happened: the web app, iPhone or Android (and the app version, if you can).</li>
                <li>What you were trying to do, what happened instead, and a screenshot if possible.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">Common questions</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900">I can&apos;t sign in</h3>
                  <p>
                    Use <span className="font-medium">Forgot password</span> on the sign-in screen to reset your password
                    by email. If you still can&apos;t get in, message us on WhatsApp.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Where do I sign in on a computer?</h3>
                  <p>
                    Go to{' '}
                    <a href={APP_URL} className="text-[#166534] underline">
                      {APP_URL.replace(/^https?:\/\//, '')}
                    </a>{' '}
                    and use the same account as the mobile app.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">How do I delete my account or data?</h3>
                  <p>
                    Follow the steps on our{' '}
                    <Link href="/data-deletion" className="text-[#166534] underline">
                      Data Deletion
                    </Link>{' '}
                    page.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Questions about your plan or a payment</h3>
                  <p>
                    Email{' '}
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#166534] underline">
                      {CONTACT_EMAIL}
                    </a>{' '}
                    with your business name and we&apos;ll look into it.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">Office</h2>
              <p className="inline-flex items-start gap-2">
                <MapPin className="mt-0.5 h-5 w-5 flex-none text-[#166534]" aria-hidden />
                <span>{OFFICE_ADDRESS}, Ghana</span>
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
