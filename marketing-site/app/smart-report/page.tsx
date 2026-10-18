'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  BarChart3, 
  TrendingUp, 
  FileText, 
  PieChart,
  LineChart,
  ArrowRight,
  Package,
  Wallet,
  CalendarRange
} from 'lucide-react'
import { motion } from 'framer-motion'

export default function SmartReportPage() {
  const features = [
    {
      icon: BarChart3,
      title: 'Executive Summary',
      description: 'Your key numbers for the period on one page: sales, expenses, profit, and how they moved.'
    },
    {
      icon: CalendarRange,
      title: 'Any Period',
      description: 'Choose the dates you want to see and compare them with the period before.'
    },
    {
      icon: TrendingUp,
      title: 'Sales & Customers',
      description: 'See your top products, services, and customers, and how sales changed over time.'
    },
    {
      icon: Wallet,
      title: 'Expenses & Cash Flow',
      description: 'Expense categories, money in and money out, so you know where your cash goes.'
    },
    {
      icon: Package,
      title: 'Inventory',
      description: 'Stock levels, low-stock items, and stock movement for shops and pharmacies.'
    },
    {
      icon: FileText,
      title: 'Download & Share',
      description: 'Save the report as a PDF to share with partners, your accountant, or your bank.'
    }
  ]

  const reportTypes = [
    {
      icon: BarChart3,
      title: 'Revenue Analysis',
      description: 'Understand your revenue streams, compare periods, and identify growth opportunities.',
      color: 'bg-blue-100 text-blue-600'
    },
    {
      icon: PieChart,
      title: 'Expense Breakdown',
      description: 'Visualize where your money goes and find areas to optimize spending.',
      color: 'bg-purple-100 text-purple-600'
    },
    {
      icon: LineChart,
      title: 'Profit & Loss',
      description: 'Complete P&L statements with trend analysis and margin calculations.',
      color: 'bg-green-100 text-green-600'
    },
    {
      icon: TrendingUp,
      title: 'Sales Performance',
      description: 'Track sales by product, customer, channel, and time period.',
      color: 'bg-orange-100 text-orange-600'
    }
  ]

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-24 sm:pt-32 pb-8 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-[#166534]" />

        {/* Floating elements */}
        <motion.div
          className="absolute top-1/4 left-10 w-20 h-20 bg-[#a3e635]/20 rounded-full blur-xl"
          animate={{ y: [0, 20, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-1/4 right-10 w-32 h-32 bg-[#a3e635]/10 rounded-full blur-2xl"
          animate={{ y: [0, -20, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 7, repeat: Infinity }}
        />

        <div className="relative mx-auto max-w-7xl">
          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-[#a3e635] text-sm font-medium mb-6"
            >
              <BarChart3 className="h-4 w-4" />
              Business reports
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6"
            >
              Smart Report
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-xl text-green-100 mb-10 max-w-3xl mx-auto"
            >
              A clear report of how your business is doing. Sales, expenses, profit, cash flow and
              stock for any period, built from the records you already keep in ABS.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              <Link href="/onboarding">
                <Button size="lg" className="text-base px-8 py-6 bg-[#a3e635] hover:bg-[#84cc16] text-[#14532d] font-semibold">
                  Try Smart Report Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything in One Report
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Smart Report pulls your sales, expenses, and stock together so you can see the whole picture.
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
                  <Card className="h-full border-0 bg-white hover:bg-gray-100 transition-colors">
                    <CardHeader>
                      <div className="inline-flex p-3 rounded-lg bg-[#166534]/10 text-[#166534] mb-4 w-fit">
                        <Icon className="h-6 w-6" />
                      </div>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base text-gray-600">
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

      {/* Report Types Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Comprehensive Reports
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From daily sales to yearly totals, get the reports you need.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {reportTypes.map((report, index) => {
              const Icon = report.icon
              return (
                <motion.div
                  key={report.title}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card className="h-full border hover:border-[#166534]/50 transition-colors">
                    <CardHeader className="flex flex-row items-center gap-4">
                      <div className={`p-3 rounded-lg ${report.color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{report.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base">
                        {report.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get your report in three simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Run Your Business',
                description: 'Record sales, invoices, and expenses in ABS as you work. There is nothing extra to set up.'
              },
              {
                step: '2',
                title: 'Choose a Period',
                description: 'Pick the dates and the sections you want: sales, expenses, cash flow, inventory, and more.'
              },
              {
                step: '3',
                title: 'Read & Share',
                description: 'See your numbers with charts and comparisons, then download the report as a PDF.'
              }
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#166534] text-white text-2xl font-bold mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-[#166534]">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to See Your Numbers Clearly?
            </h2>
            <p className="text-xl text-green-100 mb-8">
              Start your free trial and get a clear report of your business in minutes.
            </p>
            <Link href="/onboarding">
              <Button size="lg" className="text-base px-8 py-6 bg-[#a3e635] hover:bg-[#84cc16] text-[#14532d] font-semibold">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </main>
  )
}
