'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { FAQ_ITEMS, FAQ_CATEGORIES } from '@/lib/constants'
import { SHOW_PRICING } from '@/lib/featureFlags'
import { HelpCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FaqSection() {
  const categories = useMemo(
    () =>
      SHOW_PRICING
        ? [...FAQ_CATEGORIES]
        : FAQ_CATEGORIES.filter((cat) => cat !== 'Plans & pricing'),
    []
  )
  const [activeCategory, setActiveCategory] = useState<string>(categories[0])

  const filteredItems = useMemo(
    () => FAQ_ITEMS.filter((item) => item.category === activeCategory),
    [activeCategory]
  )

  return (
    <section id="faq" className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-100">
      <div className="mx-auto max-w-3xl">
        {/* Top icon */}
        <div className="flex justify-center mb-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#166534] text-[#166534]">
            <HelpCircle className="h-6 w-6" />
          </span>
        </div>

        {/* Title */}
        <div className="text-center mb-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Frequently Asked Questions
          </h2>
        </div>

        {/* Subtitle */}
        <p className="text-center text-base text-gray-500 mb-8 max-w-xl mx-auto">
          Got questions? We&apos;ve got answers. Here&apos;s everything you need to know before getting started with <strong className="font-semibold text-gray-900">ABS</strong>.
        </p>

        {/* Category tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Accordion list */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {filteredItems.map((item, index) => (
            <details
              key={`${item.category}-${index}`}
              className={cn('group', index > 0 && 'border-t border-gray-200')}
            >
              <summary className="flex items-center justify-between gap-4 list-none cursor-pointer py-4 px-5 sm:px-6 text-left font-medium text-gray-900 hover:bg-gray-50/80 transition-colors [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
              </summary>
              <div className="pb-4 px-5 sm:px-6 pt-0 text-gray-600 leading-relaxed text-sm sm:text-base">
                {item.answer}
              </div>
            </details>
          ))}
        </div>

        {/* Bottom CTA */}
        <p className="text-center mt-10 text-gray-600">
          Still curious?{' '}
          <span className="text-[#166534]">💬</span>{' '}
          <Link href="/contact" className="font-semibold text-[#166534] hover:underline">
            Let&apos;s talk
          </Link>
          {' '}— we&apos;re ready when you are.
        </p>
      </div>
    </section>
  )
}
