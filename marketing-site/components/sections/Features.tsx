'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KEY_FEATURES } from '@/lib/constants'
import { Users, Package, Receipt, BarChart3, Shield, Smartphone } from 'lucide-react'
import { motion } from 'framer-motion'

const iconMap = {
  Users,
  Package,
  Receipt,
  BarChart3,
  Shield,
  Smartphone
}

export function Features() {
  return (
    <section id="features" className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="mx-auto max-w-7xl">
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
            Powerful Features for Modern Businesses
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto px-4"
          >
            Everything you need to manage your business operations efficiently and scale with confidence.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {KEY_FEATURES.map((feature, index) => {
            const Icon = iconMap[feature.icon as keyof typeof iconMap] || Package

            return (
              <motion.div
                key={feature.name}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ 
                  duration: 0.5, 
                  delay: index * 0.1,
                  type: 'spring',
                  stiffness: 100,
                  damping: 15
                }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="h-full"
              >
                <Card className="h-full transition-all duration-300 border border-gray-200 hover:border-[#166534] group relative overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-[#166534]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    initial={false}
                  />
                  <CardHeader className="relative z-10">
                    <motion.div
                      whileHover={{ 
                        rotate: [0, -10, 10, -10, 0],
                        scale: 1.15
                      }}
                      transition={{ duration: 0.5 }}
                      className="inline-flex p-3 rounded-lg bg-[#166534] border border-[#166534] mb-4 w-fit" 
                      style={{ borderColor: '#166534' }}
                    >
                      <motion.div
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                      >
                        <Icon className="h-6 w-6 text-white" />
                      </motion.div>
                    </motion.div>
                    <motion.div
                      whileHover={{ x: 5 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    >
                      <CardTitle className="text-lg sm:text-xl">{feature.name}</CardTitle>
                    </motion.div>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <CardDescription className="text-sm sm:text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
