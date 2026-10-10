'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ShoppingBag,
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
  FileText,
  Pill,
  Bell,
  Printer,
  DollarSign,
  Clock,
  Calculator,
  Brain,
  PieChart,
  LineChart,
  Target,
  Sparkles,
  Layers,
  Building2,
  Banknote,
  PackageCheck,
  Store,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { APP_URL } from '@/lib/constants'

type FeatureItem = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

// Aligned with docs/APP_FEATURES_MARKETING.md
const FEATURE_GROUPS: {
  id: string
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  features: FeatureItem[]
}[] = [
  {
    id: 'sales-pos',
    title: 'Sales & POS',
    subtitle: 'Sell from your phone or laptop; accept cash, card, and mobile money; send receipts by SMS or WhatsApp.',
    icon: ShoppingBag,
    features: [
      { icon: ShoppingBag, title: 'Digital POS', description: 'A digital point-of-sale that runs in the browser on phone, tablet, or laptop. Search or browse products, add to cart, attach a customer, then pay. Barcode and QR scanning (camera or external scanner) add items to the cart.' },
      { icon: Receipt, title: 'Sales list & Orders', description: 'See all sales and, for restaurants, manage kitchen orders with status updates (e.g. received, preparing, ready, completed).' },
      { icon: QrCode, title: 'Barcode & QR scanning', description: 'Scan barcodes or product QR codes with your phone or external scanner. Scan Mode gives a full-screen, mobile-first flow: scan multiple items, review cart, add customer, pay, and optionally auto-send receipt by SMS.' },
      { icon: WifiOff, title: 'Works offline', description: 'Sales can be queued when offline and synced when back online. Sell anywhere, even without internet.' },
      { icon: Store, title: 'Shops (locations)', description: 'Manage multiple shop locations. Link sales and POS to the right branch so you know which location each sale came from.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & integrations',
    subtitle: 'Accept card and mobile money, and send receipts and reminders via WhatsApp, SMS, or email.',
    icon: CreditCard,
    features: [
      { icon: Smartphone, title: 'Card & mobile money', description: 'Paystack for card and mobile money (MTN MoMo, AirtelTigo, Telecel) in POS and for invoice payment links. Customers pay via link or in-person.' },
      { icon: MessageSquare, title: 'WhatsApp', description: 'Send quotes, invoices, order confirmations, payment reminders, and low-stock alerts. Template-based WhatsApp Business API.' },
      { icon: CreditCard, title: 'SMS & email', description: 'When configured, used for receipts and other notifications (e.g. invoice sent, receipt after sale).' },
    ],
  },
  {
    id: 'invoices-quotes',
    title: 'Invoices & Quotes',
    subtitle: 'Create and send invoices; get paid via link or record payments. Send professional quotes and turn them into jobs or sales.',
    icon: FileText,
    features: [
      { icon: FileText, title: 'Quotes', description: 'Send professional quotes and turn them into jobs or sales. Create and send quotes; generate PDF; convert to job (studio-like) or sale (shop/pharmacy when enabled).' },
      { icon: Calculator, title: 'Pricing', description: 'Set reusable prices for services and packages. Use when creating quotes and jobs so pricing is consistent and quick to apply.' },
      { icon: Receipt, title: 'Invoices', description: 'Create and send invoices; get paid via link or record payments. Invoices from jobs, sales (POS), or prescriptions. Send via WhatsApp or other channels; mark paid or record partial payments; export PDF. Customers can pay via public pay link without logging in.' },
    ],
  },
  {
    id: 'jobs-projects',
    title: 'Jobs and project management',
    subtitle: 'Track jobs from quote to delivery with status updates and invoices.',
    icon: Printer,
    features: [
      { icon: Printer, title: 'Job tracking', description: 'Job status workflow: New → In progress → Ready → Delivered. Create from quote; link to customer; generate invoice when completed. Timeline view and status-triggered notifications (e.g. WhatsApp to customer).' },
      { icon: Clock, title: 'Quote to job to invoice', description: 'Convert quote to job so items and customer move into job tracking. When the job is completed, generate an invoice from it.' },
    ],
  },
  {
    id: 'inventory',
    title: 'Products and inventory',
    subtitle: 'Manage your product catalog, stock levels, and barcodes.',
    icon: Package,
    features: [
      { icon: Package, title: 'Product catalog', description: 'Create, edit, delete products: name, SKU, barcode(s), image, selling price, cost, stock settings. Variants (e.g. size, color) and multiple barcodes. Categories; track stock on/off; low-stock alerts. Generate product QR codes for items without a barcode.' },
      { icon: Bell, title: 'Low-stock & expiry', description: 'Real-time stock levels; reorder levels; alerts (e.g. via WhatsApp when configured). For pharmacies: expiring drugs query (30, 60, 90 days).' },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    subtitle: 'Keep customer details, credit limits, and payment history in one place.',
    icon: Users,
    features: [
      { icon: Users, title: 'Customer list (CRM)', description: 'Name, phone, email, address, credit limit, notes. Track balance and outstanding amounts. Select or create from POS and scan mode (find-or-create by phone/name). Linked to sales, jobs, quotes, and invoices.' },
    ],
  },
  {
    id: 'vendors',
    title: 'Vendors',
    subtitle: 'Manage your suppliers and vendors.',
    icon: Building2,
    features: [
      { icon: Building2, title: 'Vendor list', description: 'Supplier/vendor list with contact and basic info. Used when recording expenses or materials (e.g. purchased from Vendor X).' },
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses',
    subtitle: 'Track business expenses by category and time.',
    icon: Banknote,
    features: [
      { icon: Banknote, title: 'Expense tracking', description: 'Record expenses with amount, category, date, optional vendor, and notes. List and filter by date range and category. Feeds into reports and profit & loss.' },
    ],
  },
  {
    id: 'materials-equipment',
    title: 'Materials and equipment',
    subtitle: 'Track materials and equipment your business uses.',
    icon: PackageCheck,
    features: [
      { icon: PackageCheck, title: 'Company assets', description: 'Materials and equipment: inventory-style records for things the business uses (e.g. ink, paper, tools, vehicles), not products for sale. Track quantity, reorder, and link to vendors where relevant.' },
    ],
  },
  {
    id: 'pharmacy-compliance',
    title: 'Pharmacy & compliance',
    subtitle: 'Manage multiple pharmacy branches; drug catalog with stock and expiry; prescriptions from receipt to dispensing and invoicing.',
    icon: Pill,
    features: [
      { icon: Pill, title: 'Pharmacies (locations)', description: 'Manage multiple pharmacy branches. Used for context on prescriptions and dispensing.' },
      { icon: Pill, title: 'Drugs', description: 'Drug catalog with name, quantity in stock, reorder level, and expiry. Expiring drugs query (30, 60, 90 days). Used when creating and filling prescriptions.' },
      { icon: FileText, title: 'Prescriptions', description: 'Manage prescriptions from receipt to dispensing and invoicing. Create prescription, add drugs (quantity), optionally check interactions, fill (dispense) to deduct stock, generate invoice for patient. Label data for printing.' },
    ],
  },
  {
    id: 'reports-analytics',
    title: 'Reports',
    subtitle: 'Reports and AI-powered insights on revenue, expenses, and performance.',
    icon: BarChart3,
    features: [
      { icon: BarChart3, title: 'Overview', description: 'Revenue, expenses, profit, product or service performance, expense breakdown, and pipeline (e.g. active jobs, open leads, pending invoices). Date range and filters; content adapts to business type.' },
      { icon: PieChart, title: 'Expense breakdown', description: 'Visualize where your money goes; expense data feeds into P&L and reports.' },
      { icon: LineChart, title: 'Compliance', description: 'Reports formatted for submission to tax or revenue authorities.' },
    ],
  },
  {
    id: 'smart-report',
    title: 'Smart Report (AI)',
    subtitle: 'AI-powered analysis: key findings, performance analysis, recommendations, risks, and growth opportunities.',
    icon: Brain,
    features: [
      { icon: Brain, title: 'AI-powered analysis', description: 'Claude-powered analysis on your report data: key findings, performance analysis, recommendations, risks, and growth opportunities. Backend sends aggregated data to the AI and returns structured insights.' },
      { icon: MessageSquare, title: 'Natural language', description: 'Ask questions in plain English and get instant, intelligent answers from your business data.' },
      { icon: Target, title: 'Recommendations & trends', description: 'Actionable suggestions and trend detection to improve profitability and grow your business.' },
    ],
  },
]

const ASK_EXAMPLES = [
  '"How much did I sell this month?"',
  '"Show me customers who haven\'t ordered in 30 days"',
  '"What are my top products?"',
  '"Compare this quarter to last quarter"',
  '"What are my top expense categories?"',
  '"Why are sales down?"',
]

const SMART_REPORT_STEPS = [
  { step: '1', title: 'Connect Your Data', description: 'Your business data is automatically synced and organized in real-time.' },
  { step: '2', title: 'Ask a Question', description: 'Type your question in plain English or choose from suggested insights.' },
  { step: '3', title: 'Get Insights', description: 'Receive instant analysis with charts, recommendations, and actionable next steps.' },
]

function FeatureCard({
  feature,
  index,
}: {
  feature: FeatureItem
  index: number
}) {
  const Icon = feature.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
    >
      <Card className="h-full border hover:border-[#166534]/50 transition-colors">
        <CardHeader>
          <div className="inline-flex p-3 rounded-lg bg-[#166534]/10 text-[#166534] mb-4 w-fit">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>{feature.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">{feature.description}</CardDescription>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 bg-[#166534]">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-[#a3e635] text-sm font-medium mb-6"
          >
            <Layers className="h-4 w-4" />
            Grouped by function
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
          >
            All Features by Function
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-green-100"
          >
            Payments, invoices & quotes, jobs, sales & POS, inventory, customers, pharmacy, and AI reports—all in one place.
          </motion.p>
        </div>
      </section>

      {/* Feature groups */}
      {FEATURE_GROUPS.map((group, groupIndex) => {
        const GroupIcon = group.icon
        const isAlt = groupIndex % 2 === 1
        return (
          <section
            key={group.id}
            id={group.id}
            className={`py-10 sm:py-20 px-4 sm:px-6 lg:px-8 scroll-mt-24 ${isAlt ? 'bg-gray-50' : 'bg-white'}`}
          >
            <div className="mx-auto max-w-7xl">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-10">
                <div className="inline-flex p-3 rounded-xl bg-[#166534]/10 text-[#166534] w-fit">
                  <GroupIcon className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{group.title}</h2>
                  <p className="text-gray-600 mt-1">{group.subtitle}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {group.features.map((feature, index) => (
                  <FeatureCard key={feature.title} feature={feature} index={index} />
                ))}
              </div>
            </div>
          </section>
        )
      })}

      {/* Smart Report: Just Ask + How it works */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-[#166534]">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full text-[#a3e635] text-sm font-medium mb-4"
            >
              <Sparkles className="h-4 w-4" />
              Powered by AI
            </motion.div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Just Ask</h2>
            <p className="text-green-100">No dashboards or SQL—ask what you want to know.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto mb-12">
            {ASK_EXAMPLES.map((example, index) => (
              <motion.div
                key={example}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20"
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-[#a3e635] mt-0.5 flex-shrink-0" />
                  <p className="text-green-50 text-sm italic">{example}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white mb-6 text-center">How Smart Report Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {SMART_REPORT_STEPS.map((item, index) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#a3e635] text-[#14532d] text-2xl font-bold mb-6">{item.step}</div>
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-green-100">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Ready to Get Started?</h2>
          <p className="text-xl text-gray-600 mb-8">
            Join businesses across Africa using ABS. Start your free trial today—no credit card required.
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
