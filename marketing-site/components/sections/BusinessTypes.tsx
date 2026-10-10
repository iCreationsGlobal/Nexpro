'use client'

import { useState, useEffect, useCallback } from 'react'
import { BUSINESS_CAROUSEL, APP_URL } from '@/lib/constants'
import { usePublicConfig } from '@/context/PublicConfigContext'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListTodo,
  Tag,
  Users,
  Kanban,
  Receipt,
  Calendar,
  ClipboardList,
  CreditCard,
  History,
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Pill,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react'
import Link from 'next/link'

const FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  ListTodo,
  Tag,
  Users,
  Kanban,
  Receipt,
  Calendar,
  ClipboardList,
  CreditCard,
  History,
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Pill,
  AlertTriangle,
  ShieldCheck
}

const SLIDE_INTERVAL_MS = 5000

export function BusinessTypes() {
  const [index, setIndex] = useState(0)
  const total = BUSINESS_CAROUSEL.length
  const { selfSignupEnabled } = usePublicConfig()

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % total)
  }, [total])

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + total) % total)
  }, [total])

  useEffect(() => {
    const timer = setInterval(goNext, SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [goNext])

  const business = BUSINESS_CAROUSEL[index]

  return (
    <section id="business-types" className="relative w-full min-h-[480px] sm:min-h-[520px] lg:min-h-[580px] border-t border-gray-200 overflow-hidden">
      {/* Full-bleed image slides with dark overlay and overlaid content */}
      {BUSINESS_CAROUSEL.map((item, i) => (
        <div
          key={item.id}
          className="absolute inset-0 transition-opacity duration-500 ease-in-out flex"
          style={{
            opacity: i === index ? 1 : 0,
            pointerEvents: i === index ? 'auto' : 'none'
          }}
        >
          {/* Left 40%: deep green (no image) */}
          <div className="absolute inset-0 left-0 w-[40%] bg-[#0a2d12]" aria-hidden />
          {/* Right 60%: image only */}
          <div className="absolute inset-y-0 right-0 w-[60%] overflow-hidden">
            <img
              src={item.image}
              alt={item.name}
              className="h-full w-full object-cover object-center"
            />
          </div>
          {/* Full-width gradient: solid left, fades over the join so no visible line */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to right, #0a2d12 0%, #0a2d12 40%,rgba(10, 45, 18, 0.96) 58%,rgba(10, 45, 18, 0.69)68%, transparent 80%)'
            }}
            aria-hidden
          />
          <div className="relative z-10 flex flex-col justify-center min-h-[480px] sm:min-h-[520px] lg:min-h-[580px] px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <div className="mx-auto max-w-7xl w-full">
              <div className="max-w-xl text-left">
              <p className="text-sm font-medium text-[#86efac] uppercase tracking-wide mb-2">
                Built for your industry
              </p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">
                {item.name}
              </h2>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-100 mb-6">
                {item.description}
              </p>
              <ul className="space-y-3 mb-8">
                {item.features.map((feature, fi) => {
                  const Icon = typeof feature === 'object' && feature.icon && FEATURE_ICONS[feature.icon]
                    ? FEATURE_ICONS[feature.icon]
                    : null
                  const label = typeof feature === 'object' && feature.label ? feature.label : String(feature)
                  return (
                    <li key={fi} className="flex items-center gap-3 text-gray-100">
                      {Icon ? (
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 text-[#86efac] flex-shrink-0">
                          <Icon className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#86efac] flex-shrink-0" />
                      )}
                      {label}
                    </li>
                  )
                })}
              </ul>
              {selfSignupEnabled ? (
                <Link
                  href={`${APP_URL}/signup?mode=${item.signupMode}`}
                  className="inline-flex items-center gap-2 text-[#86efac] font-semibold hover:text-white transition-colors"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 text-[#86efac] font-semibold hover:text-white transition-colors"
                >
                  Contact Sales
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
        <button
          type="button"
          onClick={goPrev}
          className="p-2 rounded-full border border-gray-300 bg-white/90 hover:bg-white text-gray-600 hover:text-gray-900 transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {BUSINESS_CAROUSEL.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className="rounded-full transition-all duration-300"
              aria-label={`Go to slide ${i + 1}`}
            >
              <span
                className={cn(
                  'block rounded-full transition-all duration-300',
                  i === index
                    ? 'w-8 h-2 bg-[#166534]'
                    : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                )}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={goNext}
          className="p-2 rounded-full border border-gray-300 bg-white/90 hover:bg-white text-gray-600 hover:text-gray-900 transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  )
}
