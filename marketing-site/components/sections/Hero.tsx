'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Play } from 'lucide-react'
import { TRUST_INDICATORS, APP_URL, WHATSAPP_CONTACT_URL, BRAND_ALTERNATE, BRAND_FULL } from '@/lib/constants'
import { usePublicConfig } from '@/context/PublicConfigContext'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'

export function Hero() {
  const { selfSignupEnabled } = usePublicConfig()
  return (
    <section className="relative pt-24 sm:pt-32 pb-8 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden" style={{ backgroundColor: '#166534' }}>
      {/* Green pattern background */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{ height: '100%', minHeight: '600px' }}
      >
        <Image
          src="/sabito-hero-background.png"
          alt=""
          fill
          className="object-cover opacity-40"
          priority
        />
      </div>
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          {/* ABS dashboard on left — same framing as the contact page */}
          <div className="section-fade-in w-full lg:w-1/2" style={{ animationDelay: '0.2s' }}>
            <div className="rounded-[1.5rem] sm:rounded-[2rem] border border-white/30 bg-white p-2 sm:p-3 shadow-2xl shadow-black/30">
              <Image
                src="/dashboard-hero.png"
                alt={`${BRAND_ALTERNATE} dashboard showing sales, expenses, profit and recent sales`}
                width={1536}
                height={1024}
                sizes="(min-width: 1024px) 600px, 100vw"
                className="h-auto w-full rounded-[1rem] sm:rounded-[1.5rem] border border-gray-100"
                priority
              />
            </div>
          </div>
          
          {/* Text content on right */}
          <div className="w-full lg:w-1/2 text-center lg:text-left">
            {/* Trust indicators - hidden on mobile to reduce clutter */}
            <div className="section-fade-in hidden md:flex flex-wrap justify-center lg:justify-start items-center gap-3 mb-8" style={{ animationDelay: '0.1s' }}>
              <div className="px-4 py-2 rounded-full bg-[#a3e635]/20 backdrop-blur-sm border" style={{ borderColor: '#a3e635' }}>
                <span className="font-semibold text-[#a3e635] text-sm">{TRUST_INDICATORS.users}</span>
                <span className="text-[#a3e635] text-sm ml-1">Active Users</span>
              </div>
              <div className="px-4 py-2 rounded-full bg-[#a3e635]/20 backdrop-blur-sm border" style={{ borderColor: '#a3e635' }}>
                <span className="font-semibold text-[#a3e635] text-sm">{TRUST_INDICATORS.businesses}+</span>
                <span className="text-[#a3e635] text-sm ml-1">Businesses</span>
              </div>
              <div className="px-4 py-2 rounded-full bg-[#a3e635]/20 backdrop-blur-sm border" style={{ borderColor: '#a3e635' }}>
                <span className="font-semibold text-[#a3e635] text-sm">{TRUST_INDICATORS.industries}</span>
                <span className="text-[#a3e635] text-sm ml-1">Industries</span>
              </div>
            </div>

            {/* Main headline */}
            <h1
              className="section-fade-in text-3xl sm:text-5xl md:text-6xl font-bold text-white mb-4 sm:mb-6"
              style={{ animationDelay: '0.2s' }}
            >
              Manage Your Business,
              <br />
              <span className="text-[#a3e635]">Your Way</span>
            </h1>

            {/* Subheadline */}
            <p
              className="section-fade-in text-xl text-green-100 mb-6 sm:mb-10 max-w-3xl mx-auto lg:mx-0"
              style={{ animationDelay: '0.3s' }}
            >
              {BRAND_FULL} ({BRAND_ALTERNATE}) helps printing presses, shops, and pharmacies streamline operations and grow.
            </p>

            {/* CTAs */}
            <div
              className="section-fade-in flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center mb-8 sm:mb-12"
              style={{ animationDelay: '0.4s' }}
            >
              {selfSignupEnabled ? (
                <>
                  <Link href={`${APP_URL}/onboarding`} className="w-full sm:w-auto">
                    <Button size="lg" className="w-full sm:w-auto text-base px-8 py-6 bg-[#a3e635] hover:bg-[#84cc16] text-[#14532d] font-semibold">
                      Start Free Trial
                    </Button>
                  </Link>
                  <Link href="/contact?intent=demo" className="w-full sm:w-auto hidden sm:inline-block">
                    <Button variant="outline" size="lg" className="text-base px-8 py-6 border-2 !border-[#a3e635] bg-transparent !text-[#a3e635] hover:bg-white hover:!border-white hover:!text-[#166534]">
                      <Play className="mr-2 h-5 w-5" />
                      Watch Demo
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                    <Button size="lg" className="w-full sm:w-auto text-base px-8 py-6 bg-[#a3e635] hover:bg-[#84cc16] text-[#14532d] font-semibold">
                      <WhatsAppIcon size={20} className="mr-2" />
                      Contact Sales
                    </Button>
                  </a>
                  <Link href="/contact?intent=demo" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8 py-6 border-2 !border-[#a3e635] bg-transparent !text-[#a3e635] hover:bg-white hover:!border-white hover:!text-[#166534]">
                      <Play className="mr-2 h-5 w-5" />
                      Watch demo
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
