'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Facebook, Twitter, Linkedin, Mail } from 'lucide-react'
import { usePublicConfig } from '@/context/PublicConfigContext'
import { WHATSAPP_CONTACT_URL, CONTACT_EMAIL, BRAND_ALTERNATE, BRAND_FULL } from '@/lib/constants'
import { SHOW_PRICING } from '@/lib/featureFlags'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'

export function Footer() {
  const { selfSignupEnabled } = usePublicConfig()

  return (
    <footer className="bg-black text-gray-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8">
          {/* Company */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image
                src="/abs-logo-icon.png"
                alt={`${BRAND_ALTERNATE} logo`}
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
              <h3 className="text-white text-lg font-semibold">{BRAND_ALTERNATE}</h3>
            </div>
            <p className="text-sm">
              {BRAND_FULL} ({BRAND_ALTERNATE}) helps printing presses, shops, and pharmacies streamline and grow.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-white text-sm font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/#features" className="hover:text-white transition-colors">
                  Features
                </Link>
              </li>
              {selfSignupEnabled ? (
                <>
                  {SHOW_PRICING && (
                    <li>
                      <Link href="/pricing" className="hover:text-white transition-colors">
                        Pricing
                      </Link>
                    </li>
                  )}
                  <li>
                    <Link href="/contact?intent=demo" className="hover:text-white transition-colors">
                      Watch demo
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors inline-flex items-center gap-1.5">
                      <WhatsAppIcon size={16} />
                      Contact Sales
                    </a>
                  </li>
                  <li>
                    <Link href="/contact?intent=demo" className="hover:text-white transition-colors">
                      Watch demo
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-white text-sm font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/support" className="hover:text-white transition-colors">
                  Support
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/sales-agent" className="hover:text-white transition-colors">
                  Become an Agent
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white text-sm font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/data-deletion" className="hover:text-white transition-colors">
                  Data Deletion
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Social links and copyright */}
        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-900 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm">
            &copy; {new Date().getFullYear()} {BRAND_FULL}. All rights reserved.
          </p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
              aria-label="Facebook"
            >
              <Facebook className="h-5 w-5" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
              aria-label="Twitter"
            >
              <Twitter className="h-5 w-5" />
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-5 w-5" />
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-white transition-colors"
              aria-label="Email"
            >
              <Mail className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
