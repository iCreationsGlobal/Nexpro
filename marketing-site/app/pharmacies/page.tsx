'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Pill,
  Check,
  FileText,
  Package,
  AlertTriangle,
  Shield,
  Clock,
  Users,
  BarChart3,
  Bell,
  Scan,
  ArrowRight,
  Heart,
  TrendingUp,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { APP_URL } from '@/lib/constants'

export default function PharmaciesPage() {
  const features = [
    {
      icon: FileText,
      title: 'Prescription Management',
      description: 'Track prescriptions from receipt to fulfillment. Manage patient history, dosages, and refill schedules all in one place.'
    },
    {
      icon: Package,
      title: 'Drug Inventory Tracking',
      description: 'Real-time stock levels with batch tracking. Know exactly what you have, where it is, and when it expires.'
    },
    {
      icon: Bell,
      title: 'Smart Expiry Alerts',
      description: 'Automated alerts for expiring drugs 30, 60, and 90 days in advance. Reduce waste and protect patient safety.'
    },
    {
      icon: Pill,
      title: 'Drug Database',
      description: 'Comprehensive drug information including dosage, interactions, and contraindications at your fingertips.'
    },
    {
      icon: Shield,
      title: 'Regulatory Compliance',
      description: 'Maintain complete audit trails and documentation required by pharmacy regulatory authorities.'
    },
    {
      icon: Scan,
      title: 'Barcode Scanning',
      description: 'Scan drug barcodes for quick dispensing and accurate inventory management.'
    }
  ]

  const workflowSteps = [
    {
      step: '1',
      title: 'Receive Prescription',
      description: 'Enter prescription details or scan from paper prescription.'
    },
    {
      step: '2',
      title: 'Verify & Check',
      description: 'System checks for interactions, allergies, and stock availability.'
    },
    {
      step: '3',
      title: 'Dispense',
      description: 'Scan and dispense drugs with automatic inventory deduction.'
    },
    {
      step: '4',
      title: 'Complete Sale',
      description: 'Process payment and send receipt via print, SMS, or WhatsApp.'
    }
  ]

  const benefits = [
    'Reduce dispensing errors with verification checks',
    'Never run out of essential medications',
    'Track controlled substances with detailed logs',
    'Manage multiple pharmacy branches',
    'Patient profiles with medication history',
    'Generate sales and inventory reports instantly'
  ]

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section: text left, sales & revenue panel right (80% height, bottom), green background */}
      <section className="relative min-h-[85vh] pt-24 sm:pt-32 pb-8 px-4 sm:px-6 lg:px-8 overflow-hidden flex flex-col">
        <div className="absolute inset-0 bg-[#166534]" />
        <motion.div
          className="absolute top-1/4 right-20 text-white/10"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          <Pill className="h-32 w-32" />
        </motion.div>

        <div className="relative mx-auto max-w-7xl w-full flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start pt-4">
          {/* Left: copy */}
          <div className="order-2 lg:order-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-[#a3e635] text-sm font-medium mb-6"
            >
              <Heart className="h-4 w-4" />
              Patient Safety First
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
            >
              ABS for Pharmacies
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-green-100 mb-8"
            >
              Complete pharmacy management system with prescription tracking, intelligent expiry alerts,
              and regulatory compliance. Dispense with confidence, serve patients better.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Link href={`${APP_URL}/onboarding`}>
                <Button size="lg" className="text-base px-8 py-6 bg-[#a3e635] hover:bg-[#84cc16] text-[#14532d] font-semibold">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          </div>

          {/* Right: Sales & revenues panel - 80% hero height, at bottom */}
          <div className="order-1 lg:order-2 flex flex-col justify-end min-h-[55vh] lg:min-h-[68vh]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="w-full max-w-xl lg:ml-auto rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col h-full min-h-[420px]"
            >
              <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#166534]" />
                  <span className="text-base sm:text-lg font-bold text-gray-900">Sales & revenue</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-500">Today</span>
              </div>
              <div className="flex-1 min-h-0 p-5 sm:p-6 flex flex-col">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-xl bg-[#166534]/10 p-4">
                    <div className="text-xs sm:text-sm text-gray-500 mb-0.5">Revenue</div>
                    <div className="text-xl sm:text-2xl font-bold text-gray-900">GH₵2,840</div>
                    <div className="flex items-center gap-1 text-xs text-[#166534] font-medium mt-1">
                      <TrendingUp className="h-3.5 w-3.5" /> +12%
                    </div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <div className="text-xs sm:text-sm text-gray-500 mb-0.5">Sales</div>
                    <div className="text-xl sm:text-2xl font-bold text-gray-900">28</div>
                    <div className="text-xs text-gray-500 mt-1">transactions</div>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <div className="text-sm font-semibold text-gray-900 mb-3">Today&apos;s sales</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-sm font-medium text-gray-900">A. Mensah</span>
                      <span className="text-sm text-[#166534] font-semibold">GH₵420</span>
                      <span className="text-xs text-[#166534] font-medium">Dispensed</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 px-3 rounded-lg border border-gray-100">
                      <span className="text-sm font-medium text-gray-900">K. Asante</span>
                      <span className="text-sm text-gray-700">GH₵185</span>
                      <span className="text-xs text-amber-600 font-medium">Pending</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 px-3 rounded-lg border border-gray-100">
                      <span className="text-sm font-medium text-gray-900">E. Boateng</span>
                      <span className="text-sm text-gray-700">GH₵310</span>
                      <span className="text-xs text-gray-500">In progress</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                    3 of 12 completed
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-200">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Streamlined Dispensing Workflow
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From prescription to patient - manage the entire dispensing process efficiently.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {workflowSteps.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative"
              >
                <div className="bg-white border border-gray-200 rounded-xl p-6 h-full">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#166534] text-white font-bold text-lg mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.description}</p>
                </div>
                {index < workflowSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                    <ArrowRight className="h-6 w-6 text-[#166534]" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Run Your Pharmacy
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Purpose-built features for modern pharmacy operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card className="h-full border hover:border-[#166534]/50 transition-colors">
                    <CardHeader>
                      <div className="inline-flex p-3 rounded-lg bg-[#166534]/10 text-[#166534] mb-4 w-fit">
                        <Icon className="h-6 w-6" />
                      </div>
                      <CardTitle>{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base">
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

      {/* Benefits Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Why Pharmacists Choose ABS
              </h2>
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#166534] flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="relative">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="bg-[#166534] rounded-2xl p-8 text-white"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-white/10 rounded-lg">
                    <AlertTriangle className="h-8 w-8 text-[#a3e635]" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">Expiry Alerts</div>
                    <div className="text-green-100">Never miss an expiring drug</div>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 bg-red-500/20 rounded-lg px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-red-400"></div>
                    <span className="text-red-100">5 drugs expiring in 30 days</span>
                  </div>
                  <div className="flex items-center gap-2 bg-yellow-500/20 rounded-lg px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                    <span className="text-yellow-100">12 drugs expiring in 60 days</span>
                  </div>
                  <div className="flex items-center gap-2 bg-green-500/20 rounded-lg px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span className="text-green-100">23 drugs expiring in 90 days</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Ready to Modernize Your Pharmacy?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join pharmacies across Africa using ABS. Start your free trial today - no credit card required.
          </p>
          <Link href={`${APP_URL}/onboarding`}>
            <Button size="lg" className="text-base px-8 py-6 bg-[#166534] hover:bg-[#14532d] text-white">
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </main>
  )
}
