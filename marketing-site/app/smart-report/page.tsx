'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Brain, 
  BarChart3, 
  TrendingUp, 
  FileText, 
  Zap, 
  MessageSquare,
  PieChart,
  LineChart,
  ArrowRight,
  Sparkles,
  Clock,
  Target
} from 'lucide-react'
import { motion } from 'framer-motion'

export default function SmartReportPage() {
  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      description: 'Get intelligent insights from your business data with our advanced AI engine that understands your metrics and trends.'
    },
    {
      icon: MessageSquare,
      title: 'Natural Language Queries',
      description: 'Ask questions in plain English like "What were my top selling products last month?" and get instant answers.'
    },
    {
      icon: TrendingUp,
      title: 'Trend Detection',
      description: 'Automatically identify patterns, seasonal trends, and anomalies in your sales, expenses, and customer behavior.'
    },
    {
      icon: Target,
      title: 'Actionable Recommendations',
      description: 'Receive AI-generated suggestions to improve profitability, reduce costs, and grow your business.'
    },
    {
      icon: Zap,
      title: 'Instant Insights',
      description: 'No more manual data crunching. Get comprehensive business intelligence in seconds, not hours.'
    },
    {
      icon: Clock,
      title: 'Real-Time Analytics',
      description: 'Access up-to-the-minute data with automatic syncing across all your business operations.'
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

  const examples = [
    '"How much did I sell this month?"',
    '"Show me customers who haven\'t ordered in 30 days"',
    '"What are my top products?"',
    '"Compare this quarter to last quarter"',
    '"What are my top expense categories?"',
    '"Why are sales down?"'
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
              <Sparkles className="h-4 w-4" />
              Powered by AI
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
              AI-powered business intelligence that turns your data into actionable insights.
              Ask questions in plain English and get instant, intelligent answers.
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

      {/* Ask Anything Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Just Ask
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              No complex dashboards. No SQL queries. Just ask what you want to know.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {examples.map((example, index) => (
              <motion.div
                key={example}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-lg p-4 border border-gray-200 hover:border-[#166534] transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-[#166534] mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 group-hover:text-gray-900 text-sm italic">
                    {example}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Intelligence That Works for You
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Smart Report combines advanced AI with your business data to deliver insights that matter.
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
                  <Card className="h-full border-0 bg-gray-50 hover:bg-gray-100 transition-colors">
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
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Comprehensive Reports
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From daily sales to annual forecasts, get the reports you need.
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
      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get intelligent insights in three simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Connect Your Data',
                description: 'Your business data is automatically synced and organized in real-time.'
              },
              {
                step: '2',
                title: 'Ask a Question',
                description: 'Type your question in plain English or choose from suggested insights.'
              },
              {
                step: '3',
                title: 'Get Insights',
                description: 'Receive instant analysis with charts, recommendations, and actionable next steps.'
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
              Ready to Get Smarter Insights?
            </h2>
            <p className="text-xl text-green-100 mb-8">
              Start your free trial and see how AI can transform your business reporting.
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
