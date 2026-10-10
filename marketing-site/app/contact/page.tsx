'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Headphones,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Rocket,
  ShieldCheck,
  UserRound,
  Users,
  Zap,
} from 'lucide-react'
import { WHATSAPP_CONTACT_URL, OFFICE_ADDRESS, CONTACT_PHONE, CONTACT_PHONE_E164, CONTACT_EMAIL } from '@/lib/constants'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'
import { BookDemoModal } from '@/components/BookDemoModal'

const quickBenefits = [
  { label: 'Fast response within 5 minutes', icon: Zap },
  { label: 'WhatsApp available', icon: MessageCircle },
  { label: 'Real humans, no bots', icon: Headphones },
]

const contactCards = [
  {
    title: 'Email Us',
    description: 'We reply within 5 minutes',
    value: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
    icon: Mail,
  },
  {
    title: 'Call or WhatsApp',
    description: 'Mon - Fri, 9:00 AM - 6:00 PM',
    value: CONTACT_PHONE,
    href: `tel:${CONTACT_PHONE_E164}`,
    icon: Phone,
  },
  {
    title: 'Our Office',
    description: 'Accra, Ghana',
    value: OFFICE_ADDRESS,
    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(OFFICE_ADDRESS)}`,
    icon: MapPin,
  },
]

const businessBenefits = [
  {
    title: 'Free product demo',
    description: 'See ABS in action before you decide.',
    icon: ShieldCheck,
  },
  {
    title: 'Setup assistance',
    description: 'We help you get started and onboarded.',
    icon: UserRound,
  },
  {
    title: 'Data migration',
    description: 'Move your data safely and easily.',
    icon: CloudUpload,
  },
  {
    title: 'WhatsApp integration',
    description: 'Connect and engage customers seamlessly.',
    icon: MessageCircle,
  },
  {
    title: 'Ongoing support',
    description: "We're with you as you grow.",
    icon: BarChart3,
  },
]

type DemoFormPrefill = {
  name?: string
  email?: string
  phone?: string
}

export default function ContactPage() {
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [demoFormPrefill, setDemoFormPrefill] = useState<DemoFormPrefill | undefined>()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('intent') === 'demo') {
      setBookingModalOpen(true)
    }
  }, [])

  const openBookingModal = (prefill?: DemoFormPrefill) => {
    setDemoFormPrefill(prefill)
    setBookingModalOpen(true)
  }

  return (
    <main className="bg-white">
      <section className="pt-24 sm:pt-32 pb-8 sm:pb-14 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="section-fade-in">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#dcfce7] bg-[#dcfce7] px-4 py-2 text-sm font-semibold text-[#166534]">
              <Zap className="h-4 w-4" />
              We&apos;re here to help
            </div>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
              Let&apos;s help your <span className="text-[#166534]">business grow.</span>
            </h1>
            <div className="mt-4 h-1.5 w-28 rounded-full bg-[#166534]" />
            <p className="mt-6 max-w-xl text-base leading-7 text-gray-600 sm:text-lg">
              Reach out to schedule a demo, ask questions, or chat with our team on WhatsApp.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {quickBenefits.map((benefit) => {
                const Icon = benefit.icon
                return (
                  <div key={benefit.label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium leading-snug text-gray-700">{benefit.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="section-fade-in relative" style={{ animationDelay: '0.1s' }}>
            <div className="absolute inset-0 -z-10 rounded-full bg-[#dcfce7] blur-3xl opacity-70" />
            <div className="rounded-[2rem] border border-gray-200 bg-white p-3">
              <Image
                src="/dashboard-hero.png"
                alt="ABS dashboard showing sales and business reports"
                width={1000}
                height={640}
                priority
                className="h-auto w-full rounded-[1.5rem] border border-gray-100 object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-14 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.95fr]">
            <Card className="rounded-2xl border-gray-200 shadow-none">
              <CardHeader className="pb-4">
                <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534]">
                  <Calendar className="h-7 w-7" />
                </div>
                <CardTitle className="text-2xl text-gray-900">Schedule a Demo</CardTitle>
                <CardDescription className="text-gray-600">
                  Fill out the form below and our team will get back to you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const formData = new FormData(event.currentTarget)
                    openBookingModal({
                      name: String(formData.get('fullName') || ''),
                      email: String(formData.get('email') || ''),
                      phone: String(formData.get('phone') || ''),
                    })
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="full-name" className="sr-only">Full Name</Label>
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input id="full-name" name="fullName" required placeholder="Full Name" className="h-12 border-gray-200 bg-white pl-10" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email-address" className="sr-only">Email Address</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input id="email-address" name="email" type="email" required placeholder="Email Address" className="h-12 border-gray-200 bg-white pl-10" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="phone-number" className="sr-only">Phone Number</Label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input id="phone-number" name="phone" type="tel" required placeholder="Phone Number" className="h-12 border-gray-200 bg-white pl-10" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="business-name" className="sr-only">Business Name</Label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input id="business-name" name="businessName" required placeholder="Business Name" className="h-12 border-gray-200 bg-white pl-10" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="user-count" className="sr-only">How many users will use ABS?</Label>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <select
                        id="user-count"
                        name="userCount"
                        required
                        defaultValue=""
                        className="flex h-12 w-full appearance-none rounded-md border border-gray-200 bg-white px-10 py-2 text-sm text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#166534]"
                      >
                        <option value="" disabled>How many users will use ABS?</option>
                        <option value="1">Just me</option>
                        <option value="2-5">2 - 5 users</option>
                        <option value="6-10">6 - 10 users</option>
                        <option value="11+">11+ users</option>
                      </select>
                      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message" className="sr-only">What would you like to learn about?</Label>
                    <Textarea
                      id="message"
                      name="message"
                      placeholder="What would you like to learn about? e.g. Inventory, Sales, Reports, etc."
                      className="min-h-28 resize-none border-gray-200 bg-white"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full bg-[#166534] text-base hover:bg-[#14532d]"
                  >
                    <Calendar className="h-5 w-5 mr-2" />
                    Schedule My Demo
                  </Button>
                  <p className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Your information is safe with us. We respect your privacy.
                  </p>
                </form>
              </CardContent>
            </Card>

            <BookDemoModal
              open={bookingModalOpen}
              onClose={() => setBookingModalOpen(false)}
              initialValues={demoFormPrefill}
            />

            <div className="space-y-4">
              <Card className="rounded-2xl border-gray-200 shadow-none">
                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl text-gray-900">Get in Touch</CardTitle>
                  <CardDescription>
                    Choose the best way to reach us.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {contactCards.map((card) => {
                    const Icon = card.icon
                    return (
                      <a
                        key={card.title}
                        href={card.href}
                        target={card.title === 'Our Office' ? '_blank' : undefined}
                        rel={card.title === 'Our Office' ? 'noopener noreferrer' : undefined}
                        className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:border-[#166534]"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534]">
                          <Icon className="h-6 w-6" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-gray-900">{card.title}</span>
                          <span className="block truncate text-sm font-medium text-gray-700">{card.value}</span>
                          <span className="block text-xs text-gray-500">{card.description}</span>
                        </span>
                        <ChevronRight className="h-5 w-5 text-[#166534]" />
                        </a>
                    )
                  })}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-gray-200 bg-gray-50 shadow-none">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534]">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">14+ New Businesses This Month</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Join growing businesses across Ghana using ABS to simplify operations.
                    </p>
                  </div>
                  <div className="hidden items-center -space-x-2 sm:flex">
                    {['SA', 'JM', 'DE', 'EE'].map((initials, index) => (
                      <span
                        key={initials}
                        className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#166534] text-xs font-semibold text-white"
                        style={{ opacity: 1 - index * 0.08 }}
                      >
                        {initials}
                      </span>
                    ))}
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#a3e635] text-xs font-semibold text-[#14532d]">
                      +10
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          <div className="mb-8 flex items-center justify-center gap-4 text-center">
            <span className="hidden h-px w-12 bg-[#166534] sm:block" />
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Why businesses choose ABS</h2>
            <span className="hidden h-px w-12 bg-[#166534] sm:block" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {businessBenefits.map((benefit) => {
              const Icon = benefit.icon
              return (
                <div key={benefit.title} className="text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{benefit.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl overflow-hidden rounded-2xl border border-gray-200 bg-white lg:grid-cols-[1fr_0.42fr]">
          <div className="relative min-h-72 bg-gray-100">
            <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(90deg,#e5e7eb_1px,transparent_1px),linear-gradient(#e5e7eb_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="absolute left-0 top-1/3 h-8 w-full -rotate-6 bg-white/80" />
            <div className="absolute left-12 top-0 h-full w-10 rotate-12 bg-white/80" />
            <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#166534] text-white">
              <MapPin className="h-8 w-8" />
            </div>
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <p className="text-sm font-semibold text-[#166534]">Our Location</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Visit our Accra office</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">{OFFICE_ADDRESS}, Ghana</p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(OFFICE_ADDRESS)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex"
            >
              <Button variant="outline" className="border-[#166534] text-[#166534] hover:bg-[#166534] hover:text-white">
                Get Directions
                <ChevronRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="pb-10 sm:pb-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl border border-[#14532d] bg-[#166534] p-6 text-white sm:p-8">
          <div className="grid items-center gap-6 lg:grid-cols-[auto_1fr_auto]">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#a3e635]/40 bg-[#a3e635]/10 text-[#a3e635]">
              <Rocket className="h-10 w-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Ready to grow your business with ABS?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-green-50">
                Book a demo or chat with our team on WhatsApp and take the next step today.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <a
                href={WHATSAPP_CONTACT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
              >
                <Button variant="outline" className="w-full border-white/40 bg-transparent text-white hover:bg-white hover:text-[#166534]">
                  <WhatsAppIcon size={20} />
                  Chat on WhatsApp
                </Button>
              </a>
              <Button onClick={() => openBookingModal()} className="w-full bg-[#a3e635] text-[#14532d] hover:bg-[#84cc16] sm:w-auto">
                <Calendar className="h-4 w-4" />
                Schedule a Demo
              </Button>
            </div>
          </div>
          <div className="mt-6 grid gap-3 border-t border-white/15 pt-6 sm:grid-cols-3">
            {['No card required', 'Guided setup', 'Local support'].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-green-50">
                <CheckCircle2 className="h-4 w-4 text-[#a3e635]" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
