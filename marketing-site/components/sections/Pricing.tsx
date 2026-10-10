'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PLANS, APP_URL } from '@/lib/constants'
import { SHOW_PRICING } from '@/lib/featureFlags'
import { fetchMarketingPlans, type MarketingPlan } from '@/lib/pricing'
import { usePublicConfig } from '@/context/PublicConfigContext'
import { motion } from 'framer-motion'
import { Check, ArrowRight } from 'lucide-react'

/** Fallback plans when API is unavailable */
const FALLBACK_PLANS = PLANS.filter((plan) => plan.id !== 'trial')

function normalizeFeatureList(plan: { id: string; perks?: string[]; highlights?: string[] }) {
  const source = plan.perks && plan.perks.length > 0 ? plan.perks : (plan.highlights ?? [])
  const seen = new Set<string>()

  return source.filter((feature) => {
    const normalized = String(feature || '').trim()
    if (!normalized) return false
    if (
      plan.id === 'enterprise' &&
      /unlimited\s+(?:seats?|users?|team members?)/i.test(normalized)
    ) {
      return false
    }

    const key = normalized.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function Pricing({ showTitle = true }) {
  const { selfSignupEnabled } = usePublicConfig()
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly')
  const [plans, setPlans] = useState<MarketingPlan[] | null>(null)

  useEffect(() => {
    if (!SHOW_PRICING) return
    fetchMarketingPlans().then((data) => {
      if (data.length > 0) setPlans(data)
    })
  }, [])

  if (!SHOW_PRICING) return null

  const allPlans = (plans && plans.length > 0 ? plans : FALLBACK_PLANS) as Array<{
    id: string
    name: string
    description: string
    price: { amount: number | null; display: string; billingDescription?: string; currency?: string }
    priceYearly?: { amount: number | null; display: string; billingDescription?: string }
    perks?: string[]
    highlights: string[]
    popular?: boolean
    cta: { label: string; href?: string }
  }>
  /** Show 3 plans only: exclude trial, take first 3 (Starter, Professional, Enterprise) */
  const marketingPlans = allPlans.filter((plan) => plan.id !== 'trial').slice(0, 3)

  return (
    <section id="pricing" className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="mx-auto max-w-7xl">
        {showTitle && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="text-center mb-8 sm:mb-12"
          >
            <motion.h2
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2"
            >
              Simple, Transparent Pricing
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto px-4"
            >
              Choose the plan that fits your business needs. Start with a free trial, no credit card required.
            </motion.p>
          </motion.div>
        )}

        {/* Billing period toggle - matches app Plans page and Paystack */}
        <div className="flex items-center justify-center gap-2 mb-6 sm:mb-10">
          <span
            className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}
          >
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingPeriod === 'yearly'}
            onClick={() => setBillingPeriod((p) => (p === 'monthly' ? 'yearly' : 'monthly'))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#166534] focus:ring-offset-2 ${
              billingPeriod === 'yearly' ? 'bg-[#166534]' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white ring-0 transition duration-200 ease-in-out ${
                billingPeriod === 'yearly' ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${billingPeriod === 'yearly' ? 'text-gray-900' : 'text-gray-500'}`}
          >
            Yearly
          </span>
          <span className="text-xs text-[#166534] font-medium ml-1">Save up to 23%</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto px-4">
          {marketingPlans.map((plan, index) => {
            const isPopular = plan.popular ?? false
            const contactSales = plan.id === 'enterprise' || plan.price?.amount == null
            const isYearly = billingPeriod === 'yearly'
            const effectivePrice =
              'priceYearly' in plan && plan.priceYearly && isYearly ? plan.priceYearly : plan.price
            const priceDisplay = contactSales
              ? (plan.price?.display ?? "Let's talk")
              : (effectivePrice?.display ?? '—')
            const currency = plan.price?.currency ?? 'GHS'
            const yearlyAmount = isYearly && effectivePrice?.amount != null && typeof effectivePrice.amount === 'number' && !contactSales
              ? Number(effectivePrice.amount)
              : null
            const billingDescription = contactSales
              ? (plan.price?.billingDescription ?? 'Custom contract, onboarding & integrations')
              : yearlyAmount != null
                ? `${currency} ${yearlyAmount.toLocaleString('en-US')} per year`
                : (effectivePrice?.billingDescription ?? (isYearly ? 'Billed annually' : 'Billed monthly'))
            const ctaHref = contactSales || !selfSignupEnabled
              ? (plan.cta?.href ?? '/contact?interest=enterprise')
              : `${APP_URL}/signup?plan=${plan.id}&billingPeriod=${billingPeriod}`
            const featureList = normalizeFeatureList(plan)

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ 
                  duration: 0.6, 
                  delay: index * 0.15,
                  type: 'spring',
                  stiffness: 100,
                  damping: 15
                }}
                whileHover={{ y: isPopular ? -8 : -12, scale: 1.02 }}
                className={`relative ${isPopular ? 'md:-mt-4' : ''}`}
              >
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <span className="inline-flex items-center bg-[#166534] text-white px-4 py-1 rounded-full text-sm font-semibold border border-[#14532d]">
                      Most Popular
                    </span>
                  </div>
                )}
                <Card className={`h-full transition-all duration-300 ${
                  isPopular 
                    ? 'border-[#166534] border' 
                    : 'border border-gray-200 hover:border-[#166534]'
                }`}>
                  <CardHeader>
                    <CardTitle className="text-xl sm:text-2xl mb-2">{plan.name}</CardTitle>
                    <CardDescription className="text-sm sm:text-base mb-4">
                      {plan.description}
                    </CardDescription>
                    <div className="mt-4">
                      <div className="text-3xl sm:text-4xl font-bold text-gray-900">
                        {priceDisplay}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600 mt-1">
                        {billingDescription}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 sm:space-y-3">
                      {featureList.map((feature, idx) => (
                        <li key={idx} className="flex items-start">
                          <div className="mr-2 sm:mr-3 mt-0.5 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#166534] flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" />
                          </div>
                          <span className="text-sm sm:text-base text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full"
                    >
                      <Link href={ctaHref} className="w-full">
                        <Button
                          className={`w-full transition-all duration-300 ${
                            isPopular 
                              ? 'bg-[#166534] hover:bg-[#14532d]' 
                              : ''
                          }`}
                          variant={isPopular ? 'default' : 'outline'}
                          size="lg"
                        >
                          {plan.cta.label}
                        </Button>
                      </Link>
                    </motion.div>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </div>

        {/* Free trial callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <p className="text-sm sm:text-base text-gray-600 mb-4 px-4">
            All plans include a <span className="font-semibold">1-month free trial</span> with full access to all features.
          </p>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className="px-4"
          >
            <Link
              href={selfSignupEnabled ? `${APP_URL}/signup` : '/contact?interest=enterprise'}
              className="block w-full sm:w-auto"
            >
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-sm sm:text-base px-6 sm:px-8 py-5 sm:py-6 transition-all duration-300 hover:border-[#166534] hover:text-[#166534]">
                Start Free Trial
                <motion.span
                  className="ml-2 inline-flex"
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
