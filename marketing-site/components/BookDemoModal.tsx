'use client'

import { useState, useMemo, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { API_URL } from '@/lib/constants'

const BOOK_DEMO_SCHEMA = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(6, 'Please enter a valid phone number'),
})

type BookDemoFormValues = z.infer<typeof BOOK_DEMO_SCHEMA>

const TIME_SLOTS = [
  '08:00 AM', '09:00 AM', '09:30 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM',
]

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

type Cell = { day: number; current: boolean }

function getDaysInMonth(year: number, month: number): Cell[][] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startPad = first.getDay()
  const daysInMonth = last.getDate()
  const prevMonth = new Date(year, month, 0)
  const prevDays = prevMonth.getDate()
  const cells: Cell[] = []
  for (let i = 0; i < startPad; i++) {
    cells.push({ day: prevDays - startPad + i + 1, current: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true })
  }
  const remaining = 42 - cells.length
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, current: false })
  }
  const rows: Cell[][] = []
  for (let r = 0; r < 6; r++) {
    rows.push(cells.slice(r * 7, (r + 1) * 7))
  }
  return rows
}

interface BookDemoModalProps {
  open: boolean
  onClose: () => void
  initialValues?: Partial<BookDemoFormValues>
}

export function BookDemoModal({ open, onClose, initialValues }: BookDemoModalProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedSuccess, setSubmittedSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<BookDemoFormValues>({
    resolver: zodResolver(BOOK_DEMO_SCHEMA),
  })

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
  const calendarRows = useMemo(() => getDaysInMonth(year, month), [year, month])

  useEffect(() => {
    if (open) {
      setSubmitError(null)
      reset(initialValues)
    }
  }, [initialValues, open, reset])

  const onSubmit = async (data: BookDemoFormValues) => {
    if (!selectedDate || !selectedTime) return
    setSubmitError(null)
    try {
      const res = await fetch(`${API_URL}/api/public/demo-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          preferredDate: selectedDate.toISOString().slice(0, 10),
          preferredTime: selectedTime,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(json?.error || 'Something went wrong. Please try again.')
        return
      }
      setSubmittedSuccess(true)
      reset()
      setSelectedDate(null)
      setSelectedTime(null)
      setTimeout(() => {
        setSubmittedSuccess(false)
        onClose()
      }, 2000)
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-demo-title"
    >
      <Card
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div>
            <h2 id="book-demo-title" className="text-xl font-semibold text-gray-900">
              Let&apos;s discuss how ABS can empower your business
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Schedule a personalized consultation with our experts and discover how ABS can drive your business forward.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 -mr-2 -mt-1"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {submittedSuccess ? (
            <div className="p-6 text-center">
              <p className="text-lg font-medium text-gray-900">Thank you!</p>
              <p className="text-sm text-gray-600 mt-1">We&apos;ll be in touch to schedule your demo.</p>
            </div>
          ) : (
            <>
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Select date and time</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Calendar */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(new Date(year, month - 1))}
                    className="p-1 rounded hover:bg-gray-200 text-gray-600"
                    aria-label="Previous month"
                  >
                    <span className="text-lg leading-none">&larr;</span>
                  </button>
                  <span className="text-sm font-medium text-gray-900">{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(new Date(year, month + 1))}
                    className="p-1 rounded hover:bg-gray-200 text-gray-600"
                    aria-label="Next month"
                  >
                    <span className="text-lg leading-none">&rarr;</span>
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {DAYS.map((d) => (
                    <div key={d} className="text-xs font-medium text-gray-500 py-1">
                      {d}
                    </div>
                  ))}
                  {calendarRows.flat().map((cell, i) => {
                    const selected = selectedDate && cell.current &&
                      selectedDate.getDate() === cell.day && selectedDate.getMonth() === month && selectedDate.getFullYear() === year
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => cell.current && setSelectedDate(new Date(year, month, cell.day))}
                        className={`
                          py-1.5 rounded text-sm
                          ${cell.current ? 'text-gray-900 hover:bg-gray-200' : 'text-gray-300'}
                          ${selected ? 'bg-[#166534] text-white hover:bg-[#14532d]' : ''}
                        `}
                      >
                        {cell.day}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Time slots */}
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'short' })
                    : 'Pick a date'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTime(slot)}
                      className={`py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                        selectedTime === slot
                          ? 'border-[#166534] bg-[#166534] text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="demo-name">Name</Label>
              <Input
                id="demo-name"
                {...register('name')}
                className="mt-1"
                placeholder="Your Name"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="demo-email">Email</Label>
              <Input
                id="demo-email"
                type="email"
                {...register('email')}
                className="mt-1"
                placeholder="your@email.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="demo-phone">Phone</Label>
              <Input
                id="demo-phone"
                type="tel"
                {...register('phone')}
                className="mt-1"
                placeholder="Your Phone Number"
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
              )}
            </div>
            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}
            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !selectedDate || !selectedTime}
                className="bg-[#166534] hover:bg-[#14532d]"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
