'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { BookDemoModal } from '@/components/BookDemoModal'
import { Calendar } from 'lucide-react'

export default function AboutPage() {
  const [demoModalOpen, setDemoModalOpen] = useState(false)

  return (
    <main>
      <div className="pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            About Us
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            African Business Suite (ABS) helps African businesses run better – from shops and pharmacies to printing studios and more.
          </p>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-600">
            <p>
              We build tools that fit how you work: inventory, sales, customers, and reports in one place. Our goal is to make it simple to manage your business so you can focus on growing it.
            </p>
            <p>
              Whether you run a small shop, a pharmacy, or a printing press, ABS gives you the clarity and control you need – without the complexity of big enterprise software.
            </p>
          </div>

          <div className="mt-10">
            <Button
              size="lg"
              onClick={() => setDemoModalOpen(true)}
              className="bg-[#166534] hover:bg-[#14532d]"
            >
              <Calendar className="h-5 w-5 mr-2" />
              Book a Demo
            </Button>
          </div>
        </div>
      </div>

      <BookDemoModal open={demoModalOpen} onClose={() => setDemoModalOpen(false)} />
    </main>
  )
}
