'use client'

import { Card, CardContent } from '@/components/ui/card'
import { TESTIMONIALS } from '@/lib/constants'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

export function Testimonials() {
  return (
    <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            Loved by Businesses Everywhere
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            See what our customers have to say about ABS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {TESTIMONIALS.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full shadow-none">
                <CardContent className="p-6">
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-5 w-5 text-yellow-400 fill-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-6 italic">
                    &ldquo;{testimonial.content}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    {testimonial.image ? (
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-gray-200 bg-white">
                        <img
                          src={testimonial.image}
                          alt={`${testimonial.name} logo`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : null}
                    <div>
                      <p className="font-semibold text-gray-900">
                        {testimonial.name}
                      </p>
                      {(testimonial.role || testimonial.company) && (
                        <p className="text-sm text-gray-600">
                          {testimonial.company
                            ? `${testimonial.role} at ${testimonial.company}`
                            : testimonial.role}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
