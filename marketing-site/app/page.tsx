'use client'

import dynamic from 'next/dynamic'
import { Hero } from '@/components/sections/Hero'
import { TheyStartedHere } from '@/components/sections/TheyStartedHere'
import { BusinessTypes } from '@/components/sections/BusinessTypes'
import { SHOW_PRICING } from '@/lib/featureFlags'

const Features = dynamic(
  () => import('@/components/sections/Features').then((m) => m.Features),
  { loading: () => <SectionSkeleton /> }
)
const Pricing = dynamic(
  () => import('@/components/sections/Pricing').then((m) => m.Pricing),
  { loading: () => <SectionSkeleton /> }
)
const Testimonials = dynamic(
  () => import('@/components/sections/Testimonials').then((m) => m.Testimonials),
  { loading: () => <SectionSkeleton /> }
)
const CTASection = dynamic(
  () => import('@/components/sections/CTASection').then((m) => m.CTASection),
  { loading: () => <SectionSkeleton /> }
)
const FaqSection = dynamic(
  () => import('@/components/sections/FaqSection').then((m) => m.FaqSection),
  { loading: () => <SectionSkeleton /> }
)

function SectionSkeleton() {
  return (
    <div
      className="min-h-[320px] w-full bg-gray-100/80 animate-pulse"
      aria-hidden
    />
  )
}

export default function Home() {
  return (
    <main className="bg-white">
      <Hero />
      <TheyStartedHere />
      <Features />
      <BusinessTypes />
      {SHOW_PRICING && <Pricing />}
      <FaqSection />
      <Testimonials />
      <CTASection />
    </main>
  )
}
