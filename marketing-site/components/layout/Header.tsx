'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_URL, BRAND_ALTERNATE } from '@/lib/constants'
import { SHOW_PRICING } from '@/lib/featureFlags'
import { usePublicConfig } from '@/context/PublicConfigContext'

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const { selfSignupEnabled } = usePublicConfig()

  return (
    <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Top">
        <div className="flex w-full items-center justify-between py-4">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/abs-logo-icon.png"
                alt={`${BRAND_ALTERNATE} logo`}
                width={36}
                height={36}
                className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
                priority
              />
              <span className="text-xl sm:text-2xl font-bold text-gray-900">{BRAND_ALTERNATE}</span>
            </Link>
          </div>
          
          {/* Desktop navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link
              href="/"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/features"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Features
            </Link>
            <Link
              href="/sales-agent"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Become an Agent
            </Link>
            {SHOW_PRICING && (
              <Link
                href="/pricing"
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Pricing
              </Link>
            )}
            {!selfSignupEnabled && (
              <Link
                href="/contact?intent=demo"
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Watch demo
              </Link>
            )}

            <Link href={`${APP_URL}/login`}>
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            {selfSignupEnabled ? (
              <Link href={`${APP_URL}/onboarding`}>
                <Button size="sm" className="bg-[#166534] hover:bg-[#14532d]">Start Free Trial</Button>
              </Link>
            ) : (
              <Link href="/contact">
                <Button size="sm" className="bg-[#166534] hover:bg-[#14532d]">
                  Contact Sales
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu - full screen, white background (mobile only) */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-[60] md:hidden flex flex-col bg-white h-screen"
            style={{ minHeight: '100dvh' }}
          >
            <button
              type="button"
              className="absolute top-4 right-4 p-2 rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="flex flex-col space-y-6 flex-1 pt-24 px-6 pb-8 overflow-y-auto">
              <Link
                href="/"
                className="text-lg font-medium text-gray-700 hover:text-gray-900 py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/features"
                className="text-lg font-medium text-gray-700 hover:text-gray-900 py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Features
              </Link>
              <Link
                href="/sales-agent"
                className="text-lg font-medium text-gray-700 hover:text-gray-900 py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Become an Agent
              </Link>
              {SHOW_PRICING && (
                <Link
                  href="/pricing"
                  className="text-lg font-medium text-gray-700 hover:text-gray-900 py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Pricing
                </Link>
              )}
              {!selfSignupEnabled && (
                <Link
                  href="/contact?intent=demo"
                  className="text-lg font-medium text-gray-700 hover:text-gray-900 py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Watch demo
                </Link>
              )}
              <div className="border-t border-gray-200 pt-6 mt-4">
                <Link href={`${APP_URL}/login`} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant="outline"
                    className="w-full h-12 text-base mb-4"
                  >
                    Login
                  </Button>
                </Link>
                {selfSignupEnabled ? (
                  <Link href={`${APP_URL}/onboarding`} onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full h-12 text-base bg-[#166534] hover:bg-[#14532d]">
                      Start Free Trial
                    </Button>
                  </Link>
                ) : (
                  <Link href="/contact" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full h-12 text-base bg-[#166534] hover:bg-[#14532d]">
                      Contact Sales
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
