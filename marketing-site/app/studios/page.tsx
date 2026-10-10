'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Printer, 
  Check, 
  FileText, 
  DollarSign, 
  Users, 
  TrendingUp,
  Clock,
  Package,
  Calculator,
  ArrowRight,
  Zap,
  BarChart3
} from 'lucide-react'
import { motion } from 'framer-motion'

export default function StudiosPage() {
  const features = [
    {
      icon: FileText,
      title: 'Smart Quoting',
      description: 'Generate professional quotes in seconds with pricing templates. Include your services, options, and quantities automatically.'
    },
    {
      icon: Printer,
      title: 'Job Tracking',
      description: 'Track every job from quote to delivery. See real-time status: New, In Progress, Ready, and Delivered.'
    },
    {
      icon: Calculator,
      title: 'Pricing Templates',
      description: 'Create reusable pricing for your services, packages, and add-ons. Update once, apply everywhere.'
    },
    {
      icon: Clock,
      title: 'Deadline Management',
      description: 'Set due dates and get alerts for approaching deadlines. Never miss a delivery date again.'
    },
    {
      icon: DollarSign,
      title: 'Auto Invoicing',
      description: 'Completed jobs automatically convert to invoices. Track payments and outstanding balances effortlessly.'
    },
    {
      icon: Package,
      title: 'Materials Tracking',
      description: 'Monitor stock, supplies, and materials. Know when to reorder before you run out.'
    }
  ]

  const workflow = [
    {
      step: '1',
      title: 'Customer Inquiry',
      description: 'Customer requests a quote for your services.'
    },
    {
      step: '2',
      title: 'Quick Quote',
      description: 'Generate quote using pricing templates in seconds.'
    },
    {
      step: '3',
      title: 'Job Created',
      description: 'Approved quote converts to job with all details.'
    },
    {
      step: '4',
      title: 'Track Progress',
      description: 'Update job status as work progresses.'
    },
    {
      step: '5',
      title: 'Invoice & Pay',
      description: 'Generate invoice and collect payment.'
    }
  ]

  const benefits = [
    'Quote jobs in under 60 seconds',
    'Never lose track of a job again',
    'Professional quotes impress customers',
    'Automatic payment reminders',
    'See profit margins on every job',
    'Works on phone, tablet, or computer'
  ]

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section: left copy, right dashboard image */}
      <section className="relative pt-24 sm:pt-32 pb-8 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden bg-white">
        <div className="relative mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left: copy */}
            <div className="text-center lg:text-left order-1">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 bg-[#166534]/10 px-4 py-2 rounded-full text-[#166534] text-sm font-medium mb-6"
              >
                <Zap className="h-4 w-4" />
                Quote in 60 Seconds
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6"
              >
                ABS for Studios
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-xl text-gray-600 mb-10 max-w-xl lg:max-w-none"
              >
                One system for studios: automate quotes, track jobs, get paid faster. Built for printing presses, mechanics, barbers, salons, and more.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center lg:items-start"
              >
                <Link href="https://app.nexpro.com/onboarding">
                  <Button size="lg" className="text-base px-8 py-6 bg-[#166534] hover:bg-[#14532d] text-white font-semibold">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </motion.div>
            </div>
            {/* Right: dashboard image */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative w-full aspect-video lg:aspect-auto lg:min-h-[320px] rounded-xl border border-gray-200 bg-white overflow-hidden order-2"
            >
              <Image
                src="/superchargewoman-Bz8j-m5O.png"
                alt="ABS Dashboard for studios and service businesses"
                fill
                className="object-contain object-center"
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-[#166534]">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              From Quote to Payment in Minutes
            </h2>
            <p className="text-xl text-green-100 max-w-2xl mx-auto">
              A streamlined workflow that saves you hours every day.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {workflow.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative"
              >
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 h-full text-center">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#a3e635] text-[#14532d] font-bold text-lg mb-3">
                    {item.step}
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-green-100 text-sm">{item.description}</p>
                </div>
                {index < workflow.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                    <ArrowRight className="h-5 w-5 text-[#a3e635]" />
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
              Everything You Need to Run Your Studio
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful features designed for studio and service businesses.
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
                Why Studios Love ABS
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
                    <BarChart3 className="h-8 w-8 text-[#a3e635]" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">Job Dashboard</div>
                    <div className="text-green-100">See all jobs at a glance</div>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between bg-white/10 rounded-lg px-4 py-3">
                    <span>New Jobs</span>
                    <span className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-semibold">12</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/10 rounded-lg px-4 py-3">
                    <span>In Progress</span>
                    <span className="bg-yellow-500 text-white px-2 py-1 rounded text-xs font-semibold">8</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/10 rounded-lg px-4 py-3">
                    <span>Ready for Pickup</span>
                    <span className="bg-green-500 text-white px-2 py-1 rounded text-xs font-semibold">5</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/10 rounded-lg px-4 py-3">
                    <span>Due Today</span>
                    <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-semibold">3</span>
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
            Ready to Grow Your Studio?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join hundreds of studios already using ABS. Start your free trial today - no credit card required.
          </p>
          <Link href="https://app.nexpro.com/onboarding">
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
