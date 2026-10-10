'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { APP_URL, WHATSAPP_CONTACT_URL } from '@/lib/constants'
import { usePublicConfig } from '@/context/PublicConfigContext'
import { Play } from 'lucide-react'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'

export function CTASection() {
  const { selfSignupEnabled } = usePublicConfig()

  return (
    <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses already using ABS to streamline their operations and grow faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {selfSignupEnabled ? (
              <>
                <Link href={`${APP_URL}/onboarding`}>
                  <Button size="lg" className="text-base px-8 py-6 bg-[#166534] hover:bg-[#14532d] text-white">
                    Start Your Free Trial
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base px-8 py-6 bg-transparent border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
                  >
                    Contact Sales
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="text-base px-8 py-6 bg-[#166534] hover:bg-[#14532d] text-white">
                    <WhatsAppIcon size={20} className="mr-2" />
                    Contact Sales
                  </Button>
                </a>
                <Link href="/contact?intent=demo">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base px-8 py-6 bg-transparent border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    Watch demo
                  </Button>
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
