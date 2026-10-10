'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { APP_URL, CUSTOMER_LOGOS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { usePublicConfig } from '@/context/PublicConfigContext'

function CustomerLogoMark({
  logo,
  size = 'md'
}: {
  logo: (typeof CUSTOMER_LOGOS)[number]
  size?: 'sm' | 'md'
}) {
  const sizeClass =
    size === 'sm'
      ? 'w-10 h-10 text-xs'
      : 'w-14 h-14 sm:w-16 sm:h-16 text-sm sm:text-base'

  if (logo.imageSrc) {
    return (
      <div
        className={cn(
          sizeClass,
          'rounded-full overflow-hidden flex-shrink-0 bg-white border border-gray-200'
        )}
      >
        <img
          src={logo.imageSrc}
          alt={`${logo.name} logo`}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        sizeClass,
        'rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0',
        logo.bg
      )}
    >
      {logo.text}
    </div>
  )
}

export function TheyStartedHere() {
  const { selfSignupEnabled } = usePublicConfig()

  return (
    <section className="py-10 sm:py-14 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-xl sm:text-2xl font-medium text-gray-600 mb-8">
          They started exactly where you are.
          <br />
          <span className="text-gray-700 font-bold">
            Now they run their business from one place—smart and easy.
          </span>
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
          {CUSTOMER_LOGOS.map((logo) => (
            <div
              key={logo.name}
              className="relative group flex flex-col items-center"
            >
              {/* Tooltip above logo */}
              <div
                className={cn(
                  'absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-4 py-3 rounded-xl',
                  'bg-white border border-gray-200',
                  'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
                  'transition-all duration-200 ease-out',
                  'z-10 whitespace-nowrap'
                )}
              >
                <div className="flex items-center gap-3">
                  <CustomerLogoMark logo={logo} size="sm" />
                  <div className="text-left">
                    <div className="font-bold text-gray-900 text-sm">
                      {logo.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {logo.service}
                    </div>
                  </div>
                </div>
                {/* Tooltip tail: gray border triangle + white fill so it clearly points down */}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] flex justify-center">
                  <div
                    className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[8px] border-t-gray-200"
                    aria-hidden
                  />
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[7px] border-t-white"
                    aria-hidden
                  />
                </div>
              </div>
              {/* Logo circle with green outline on hover */}
              <div
                className={cn(
                  'ring-2 ring-transparent group-hover:ring-[#166534] transition-all duration-200 rounded-full',
                  !logo.imageSrc && logo.bg
                )}
              >
                <CustomerLogoMark logo={logo} size="md" />
              </div>
            </div>
          ))}
          <Link
            href={selfSignupEnabled ? `${APP_URL}/signup` : '/contact'}
            className="group/you relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-dashed border-[#9caF88] bg-[#e8f0e0] hover:border-[#166534] hover:bg-[#dce8d4] transition-colors text-[#166534]"
            aria-label={selfSignupEnabled ? 'You? Join them — sign up' : 'You? Get in touch'}
          >
            <Plus className="h-6 w-6 sm:h-7 sm:w-7 transition-opacity group-hover/you:opacity-0" />
            <span className="absolute text-gray-800 font-medium text-sm sm:text-base opacity-0 group-hover/you:opacity-100 transition-opacity">
              You?
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
