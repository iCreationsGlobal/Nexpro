'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ShoppingBag,
  Check,
  BarChart3,
  Package,
  Receipt,
  Users,
  WifiOff,
  Smartphone,
  QrCode,
  MessageSquare,
  CreditCard,
  ArrowRight,
  TrendingUp,
  Leaf,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { APP_URL } from '@/lib/constants'

export default function ShopsPage() {
  const features = [
    {
      icon: ShoppingBag,
      title: 'Modern Point of Sale',
      description: 'Digital POS that runs on your phone, tablet, or laptop. Quick product search, barcode and QR scanning, and instant checkout—no extra hardware required.'
    },
    {
      icon: QrCode,
      title: 'Barcode Scanning',
      description: 'Scan barcodes using your phone camera or external scanner. Add products to cart instantly without typing.'
    },
    {
      icon: Package,
      title: 'Smart Inventory',
      description: 'Real-time stock tracking with low stock alerts. Know exactly what you have and when to reorder.'
    },
    {
      icon: BarChart3,
      title: 'Sales Analytics',
      description: 'Understand your business with daily, weekly, and monthly sales reports. Track top products and peak hours.'
    },
    {
      icon: Receipt,
      title: 'Multi-Channel Receipts',
      description: 'Send receipts via print, SMS, WhatsApp, or email. Let customers choose how they want their receipt.'
    },
    {
      icon: Users,
      title: 'Customer Profiles',
      description: 'Build customer relationships with purchase history, credit limits, and personalized service.'
    }
  ]

  const africanFeatures = [
    {
      icon: WifiOff,
      title: 'Works Offline',
      description: 'Continue selling even when internet is down. Sales sync automatically when you reconnect.',
    },
    {
      icon: Smartphone,
      title: 'Mobile Money Ready',
      description: 'Accept MTN Mobile Money and Airtel Money payments directly from your POS system.',
    },
    {
      icon: CreditCard,
      title: 'Multiple Payment Methods',
      description: 'Cash, card, mobile money, or credit accounts. Handle any way your customers want to pay.',
    },
    {
      icon: MessageSquare,
      title: 'WhatsApp Receipts',
      description: 'Send receipts directly to customers via WhatsApp - the most popular messaging app in Africa.',
    },
  ]

  const benefits = [
    'No expensive hardware required - works on any device',
    'Automatic inventory updates with each sale',
    'Supports multiple currencies (GHS, NGN, KES, and more)',
    'Staff can use the system with minimal training',
    'Generate end-of-day reports in one click',
    'Track credit sales and outstanding balances'
  ]

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section: text left, dashboard mockup right, light cream + subtle grid */}
      <section
        className="pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 lg:px-8"
        style={{
          backgroundColor: '#faf9f6',
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            {/* Left: copy */}
            <div className="order-2 lg:order-1">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 bg-[#166534]/10 text-[#166534] px-4 py-2 rounded-full text-sm font-medium mb-6"
              >
                <WifiOff className="h-4 w-4" />
                Works Offline
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4"
              >
                ABS for Shops
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg text-gray-600 mb-8"
              >
                Modern retail management built for Africa. Offline-first POS, mobile money payments,
                and smart inventory tracking—everything you need to run your shop efficiently.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Link href={`${APP_URL}/onboarding`}>
                  <Button size="lg" className="text-base px-8 py-6 bg-[#166534] hover:bg-[#14532d] text-white font-semibold">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </motion.div>
            </div>

            {/* Right: dashboard mockup (overlapping cards, no container) */}
            <div className="order-1 lg:order-2 relative flex justify-center lg:justify-end min-h-[320px] sm:min-h-[380px]">
              <div className="relative w-full max-w-md aspect-[4/3] p-6">
                {/* Invoice card (back, slightly rotated) */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="absolute right-0 top-4 w-[72%] rounded-xl bg-white p-3 sm:p-4 transform rotate-[4deg] shadow-lg"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs sm:text-sm font-bold text-gray-900">INVOICE</span>
                    <Leaf className="h-4 w-4 text-[#166534]" />
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500 mb-2">Issue date: 1st Mar, 2026 · Due: 8th Mar</div>
                  <div className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1">BILL TO</div>
                  <div className="text-[10px] sm:text-xs text-gray-600 mb-2">Daniel Okyere · daniel@gmail.com</div>
                  <div className="border-t border-gray-100 pt-2 mt-2">
                    <div className="flex justify-between text-[10px] text-[#166534] font-medium mb-1">
                      <span>Unit Price</span><span>Qty</span>
                    </div>
                    {[
                      { name: 'Package, no frames', price: 'GH₵1,200', qty: '1' },
                      { name: 'Frames 12"', price: 'GH₵400', qty: '2' },
                      { name: 'Editing per photo', price: 'GH₵160', qty: '5' },
                    ].map((row, i) => (
                      <div key={i} className="flex justify-between text-[10px] text-gray-600 py-0.5">
                        <span className="truncate pr-2">{row.name}</span>
                        <span>{row.price} × {row.qty}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-100">
                    Subtotal · Discount 5% · Tax 3% · <strong className="text-gray-900">Total</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-[9px] text-gray-500">
                    <div>Bank: Acc 0003328923742</div>
                    <div>MTN MoMo 0401234567</div>
                  </div>
                </motion.div>

                {/* Monthly Revenue card (front left) */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.35 }}
                  className="absolute left-2 bottom-4 w-[52%] sm:w-[55%] rounded-xl bg-white p-3 z-10 shadow-lg"
                >
                  <div className="text-[10px] sm:text-xs font-semibold text-gray-900 mb-1">Monthly Revenue</div>
                  <div className="text-lg sm:text-xl font-bold text-gray-900">GH₵100,127</div>
                  <div className="flex items-center gap-1 text-[10px] text-[#166534] font-medium">
                    <TrendingUp className="h-3.5 w-3.5" /> ↑ 9%
                  </div>
                  <div className="flex gap-1 mt-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-gray-900 text-white">6M</span>
                    <span className="px-2 py-0.5 rounded text-[9px] text-gray-500 border border-gray-200">1Y</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-10 mt-2">
                    {[40, 55, 45, 70, 65, 85].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t bg-[#166534]/80" style={{ height: `${h}%`, minHeight: 4 }} />
                    ))}
                  </div>
                  <div className="text-[9px] text-gray-400 mt-1">Jul → Dec</div>
                </motion.div>

                {/* Top Services / Insights card (front right) */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.45 }}
                  className="absolute right-2 bottom-4 w-[44%] sm:w-[42%] rounded-xl bg-white p-3 z-10 shadow-lg"
                >
                  <div className="text-[10px] font-semibold text-gray-900">Top Services</div>
                  <div className="inline-block px-1.5 py-0.5 rounded bg-[#166534]/10 text-[9px] text-[#166534] font-medium mb-1.5">This Month</div>
                  <div className="space-y-1.5 text-[9px]">
                    <div className="flex justify-between"><span className="text-[#166534] font-semibold">1</span> Photography... <span className="text-gray-500">GH₵12k</span></div>
                    <div className="flex justify-between"><span className="text-[#166534] font-semibold">2</span> Frames <span className="text-gray-500">GH₵8.4k</span></div>
                    <div className="flex justify-between"><span className="text-[#166534] font-semibold">3</span> Editing <span className="text-gray-500">GH₵4.8k</span></div>
                  </div>
                  <div className="text-[9px] font-semibold text-gray-900 mt-2 pt-2 border-t border-gray-100">INSIGHTS</div>
                  <div className="space-y-1 mt-1 text-[9px] text-gray-600">
                    <div className="flex items-center gap-1"><BarChart3 className="h-3 w-3 text-[#166534]" /> +32% frame sales</div>
                    <div className="flex items-center gap-1"><Package className="h-3 w-3 text-[#166534]" /> Bundle: frames + packages</div>
                    <div className="flex items-center gap-1"><Users className="h-3 w-3 text-[#166534]" /> Daniel O. repeat client</div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Built for Africa Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-[#166534]">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Built for African Businesses
            </h2>
            <p className="text-xl text-green-100 max-w-2xl mx-auto">
              We understand the challenges of running a shop in Africa. That's why we built features that actually work for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {africanFeatures.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card className="h-full border-0 bg-white">
                    <CardHeader className="flex flex-row items-start gap-4">
                      <div className="p-3 rounded-lg bg-[#166534]/10 shrink-0">
                        <Icon className="h-6 w-6 text-[#166534]" />
                      </div>
                      <div>
                        <CardTitle className="text-gray-900">{feature.title}</CardTitle>
                        <CardDescription className="text-base mt-2 text-gray-600">
                          {feature.description}
                        </CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Run Your Shop
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful features designed specifically for retail operations.
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
                      <div className="inline-flex p-3 rounded-lg bg-[#a3e635]/20 text-[#166534] mb-4 w-fit">
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
                Why Shop Owners Love ABS
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
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#a3e635] flex items-center justify-center">
                      <Check className="h-4 w-4 text-[#166534]" />
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
                <div className="text-center">
                  <div className="text-6xl font-bold mb-2">500+</div>
                  <div className="text-green-100 text-lg">Shops using ABS</div>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-8 text-center">
                  <div>
                    <div className="text-3xl font-bold">99.9%</div>
                    <div className="text-green-100 text-sm">Uptime</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">24/7</div>
                    <div className="text-green-100 text-sm">Support</div>
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
            Ready to Transform Your Shop?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join hundreds of shop owners already using ABS. Start your free trial today - no credit card required.
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
