'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ChevronLeft,
  ChevronRight,
  Footprints,
  Clock,
  Wallet,
  MessageCircle,
  Store,
  CalendarClock,
  BarChart3,
  Download,
  User,
  Lightbulb,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  COMING_SOON_CARDS,
  API_URL,
  type ComingSoonPreviewType,
  type ComingSoonAccent,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

const featureRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  problem: z.string().min(10, 'Please describe your problem or feature need (at least 10 characters)'),
});

type FeatureRequestFormValues = z.infer<typeof featureRequestSchema>;

const ACCENT_STYLES: Record<
  ComingSoonAccent,
  { bar: string; button: string; text: string; bg: string; border: string; cardBg: string; cardBorder: string }
> = {
  green: {
    bar: 'bg-[#166534]',
    button: 'bg-[#166534] hover:bg-[#14532d]',
    text: 'text-[#166534]',
    bg: 'bg-[#166534]/10',
    border: 'border-[#166534]/30',
    cardBg: 'bg-[#ecfdf5]',
    cardBorder: 'border-emerald-200',
  },
  lime: {
    bar: 'bg-lime-400',
    button: 'bg-lime-500 hover:bg-lime-600',
    text: 'text-lime-600',
    bg: 'bg-lime-50',
    border: 'border-lime-200',
    cardBg: 'bg-lime-50/90',
    cardBorder: 'border-lime-200',
  },
  lightGreen: {
    bar: 'bg-green-400',
    button: 'bg-green-500 hover:bg-green-600',
    text: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    cardBg: 'bg-green-50/90',
    cardBorder: 'border-green-200',
  },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MOCKUP_WRAPPER_CLASS = 'h-[260px] flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white';

function PreviewMockup({
  type,
  accent,
}: {
  type: ComingSoonPreviewType;
  accent: ComingSoonAccent;
}) {
  const s = ACCENT_STYLES[accent];

  switch (type) {
    case 'footprint':
      return (
        <div className={cn(MOCKUP_WRAPPER_CLASS)}>
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex items-center gap-1.5 border-b border-gray-50">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Footprints className={cn('h-3.5 w-3.5', s.text)} />
              This week
            </span>
          </div>
          <div className="flex-1 min-h-0 p-3 flex flex-col">
            <div className="flex-1 min-h-0 flex items-end gap-1.5 h-28 min-h-[5rem]">
              {DAYS.map((day, i) => (
                <div key={day} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full">
                  <div className="w-full h-[5rem] flex items-end justify-center gap-0.5 shrink-0">
                    <div
                      className={cn('flex-1 rounded-t min-w-0 max-w-[45%]', s.bar)}
                      style={{ height: `${[28, 72, 45, 95, 52, 68][i]}%`, minHeight: 8 }}
                      title="Visitors"
                    />
                    <div
                      className="flex-1 rounded-t min-w-0 max-w-[45%] bg-lime-400/90"
                      style={{ height: `${[22, 58, 38, 88, 48, 62][i]}%`, minHeight: 8 }}
                      title="Sales"
                    />
                  </div>
                  <span className="text-[9px] font-medium text-gray-400 shrink-0">{day}</span>
                </div>
              ))}
            </div>
            <div className="flex-shrink-0 pt-2 flex items-center gap-4 text-[9px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className={cn('w-2 h-2 rounded-sm', s.bar)} />
                Visitors 360
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-lime-400/90" />
                Sales GHS 2.4k
              </span>
            </div>
          </div>
        </div>
      );
    case 'clock':
      return (
        <div className={cn(MOCKUP_WRAPPER_CLASS)}>
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex items-center gap-1.5 border-b border-gray-50">
            <Clock className={cn('h-3.5 w-3.5', s.text)} />
            <span className="text-xs font-semibold text-gray-600">Today&apos;s shift</span>
          </div>
          <div className="flex-1 min-h-0 p-4 flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col justify-center space-y-3">
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-xs text-gray-500">Clock in</span>
                <span className={cn('text-sm font-bold tabular-nums', s.text)}>8:00 AM</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-dashed border-gray-200">
                <span className="text-xs text-gray-400">Clock out</span>
                <span className="text-sm text-gray-300 tabular-nums">—</span>
              </div>
              <div className="text-[10px] text-gray-400 text-center">4h 32m so far</div>
            </div>
            <Button size="sm" className={cn('w-full text-white text-xs font-medium flex-shrink-0', s.button)}>
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Clock out
            </Button>
          </div>
        </div>
      );
    case 'ledger':
      return (
        <div className={cn(MOCKUP_WRAPPER_CLASS)}>
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex items-center gap-1.5 border-b border-gray-50">
            <Wallet className={cn('h-3.5 w-3.5', s.text)} />
            <span className="text-xs font-semibold text-gray-600">Credit ledger</span>
          </div>
          <div className="flex-1 min-h-0 p-3 flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col justify-center space-y-0">
              {[
                { name: 'K. Mensah', amount: 'GHS 320', overdue: true },
                { name: 'A. Asante', amount: 'GHS 150', overdue: false },
                { name: 'J. Osei', amount: 'GHS 0', overdue: false },
              ].map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-gray-50/80"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="h-3 w-3 text-gray-500" />
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-700">{row.name}</span>
                      {row.overdue && (
                        <span className="ml-1.5 text-[10px] text-amber-600 font-medium">Overdue</span>
                      )}
                    </div>
                  </div>
                  <span className={cn('text-xs font-bold tabular-nums', row.amount === 'GHS 0' ? 'text-gray-400' : s.text)}>
                    {row.amount}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex-shrink-0 border-t border-gray-100 pt-2 px-2 flex justify-between">
              <span className="text-xs font-semibold text-gray-600">Total owed</span>
              <span className="text-xs font-bold text-gray-900 tabular-nums">GHS 470</span>
            </div>
          </div>
        </div>
      );
    case 'sms':
      return (
        <div className={cn(MOCKUP_WRAPPER_CLASS)}>
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex items-center gap-2 border-b border-gray-50">
            <MessageCircle className={cn('h-3.5 w-3.5', s.text)} />
            <span className="text-xs font-semibold text-gray-600">Campaign</span>
          </div>
          <div className="flex-1 min-h-0 p-4 flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col justify-center space-y-3">
              <div className={cn('rounded-xl p-3 border text-xs text-gray-700 leading-relaxed', s.bg, s.border)}>
                &ldquo;Hi! This week 10% off all drinks. Show this message at checkout. — Your Shop&rdquo;
              </div>
            </div>
            <div className="flex-shrink-0 space-y-1 text-[10px] text-gray-500">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">SMS</span>
                  <span className="text-gray-300">·</span>
                  <span className="font-medium">WhatsApp</span>
                </span>
                <span className="text-gray-400">Sent to 24</span>
              </div>
              <div className="text-gray-400">Segment: Recent customers</div>
            </div>
          </div>
        </div>
      );
    case 'storefront':
      return (
        <div className={cn(MOCKUP_WRAPPER_CLASS)}>
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex items-center gap-1.5 border-b border-gray-50">
            <Store className={cn('h-3.5 w-3.5', s.text)} />
            <span className="text-xs font-semibold text-gray-600">Online store</span>
          </div>
          <div className="flex-1 min-h-0 p-4 flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col justify-center">
              <div className="flex gap-3">
                <div className="relative flex-shrink-0">
                  <img
                    src="https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=112&h=112&fit=crop"
                    alt=""
                    className="w-14 h-14 rounded-xl border border-gray-100 object-cover"
                  />
                  <span className="absolute -top-1 -right-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                    New
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">Mineral Water 1.5L</div>
                  <div className={cn('text-base font-bold mt-0.5', s.text)}>GHS 45</div>
                  <div className="text-[10px] text-gray-400 mt-1">In stock</div>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 space-y-1.5">
              <Button size="sm" className={cn('w-full text-white text-xs font-medium', s.button)}>
                <Store className="h-3.5 w-3.5 mr-1.5" />
                Pay now
              </Button>
              <div className="text-[10px] text-gray-400 text-center">Secure payment · Paystack & Mobile Money</div>
            </div>
          </div>
        </div>
      );
    case 'appointments':
      return (
        <div className={cn(MOCKUP_WRAPPER_CLASS)}>
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex items-center gap-1.5 border-b border-gray-50">
            <CalendarClock className={cn('h-3.5 w-3.5', s.text)} />
            <span className="text-xs font-semibold text-gray-600">Wed, 12 Mar</span>
          </div>
          <div className="flex-1 min-h-0 p-4 flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col justify-center space-y-3">
              <div className="flex gap-1 text-[10px] text-gray-500">
                <span className="w-2 h-2 rounded-sm bg-emerald-200" />
                <span>Available</span>
                <span className="ml-2 w-2 h-2 rounded-sm bg-gray-200" />
                <span>Booked</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['9:00', '10:00', '11:00', '14:00', '15:00', '—'].map((t, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg border py-2 text-center text-xs font-medium',
                      t === '—'
                        ? 'border-gray-100 bg-gray-50 text-gray-400'
                        : cn(s.border, s.bg, s.text, 'border')
                    )}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    case 'reports':
      return (
        <div className={cn(MOCKUP_WRAPPER_CLASS)}>
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex items-center justify-between border-b border-gray-50">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <BarChart3 className={cn('h-3.5 w-3.5', s.text)} />
              This month
            </span>
            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">↑ +12%</span>
          </div>
          <div className="flex-1 min-h-0 p-4 flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col justify-center space-y-3">
              <div className="flex items-end gap-2 h-14">
                {[60, 85, 70, 90].map((h, i) => (
                  <div
                    key={i}
                    className={cn('flex-1 rounded-t min-w-0', s.bar)}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: 'Revenue', value: '+24%', highlight: true },
                  { label: 'Invoices sent', value: '48' },
                  { label: 'Avg. pay time', value: '6 days' },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">{row.label}</span>
                    <span className={cn('font-semibold tabular-nums', row.highlight ? s.text : 'text-gray-700')}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <Button size="sm" className={cn('w-full text-white text-xs font-medium flex-shrink-0', s.button)}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function ComingSoon() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [featureModalOpen, setFeatureModalOpen] = useState(false);
  const [featureSubmitted, setFeatureSubmitted] = useState(false);
  const [featureSubmitError, setFeatureSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeatureRequestFormValues>({
    resolver: zodResolver(featureRequestSchema),
  });

  const onFeatureSubmit = async (data: FeatureRequestFormValues) => {
    setFeatureSubmitError(null);
    try {
      const res = await fetch(`${API_URL}/api/public/feature-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFeatureSubmitError(json?.error || 'Something went wrong. Please try again.');
        return;
      }

      setFeatureSubmitted(true);
      reset();
      setTimeout(() => {
        setFeatureSubmitted(false);
        setFeatureModalOpen(false);
      }, 3000);
    } catch {
      setFeatureSubmitError('Something went wrong. Please try again.');
    }
  };

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(
      el.scrollLeft < el.scrollWidth - el.clientWidth - 1
    );
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 320;
    const gap = 24;
    const step = cardWidth + gap;
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
    setTimeout(updateScrollState, 350);
  };

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState]);

  return (
    <section
      id="coming-soon"
      className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-100"
    >
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#166534] tracking-[0.2em] uppercase">
            Coming soon
          </h2>
          <p className="mt-3 text-base text-green-700/80 max-w-xl mx-auto leading-relaxed">
            More in one place—so you don&apos;t jump from app to app. We&apos;re adding these next.
          </p>
        </div>

        <div className="relative">
          <div
            className={cn('flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth', 'scrollbar-hide')}
            ref={scrollRef}
            onScroll={updateScrollState}
          >
            {COMING_SOON_CARDS.map((card) => {
              const accentStyle = ACCENT_STYLES[card.accent];
              return (
              <Card
                key={card.id}
                className={cn(
                  'flex-shrink-0 w-[280px] sm:w-[300px] snap-center rounded-2xl overflow-hidden transition-colors',
                  accentStyle?.cardBg ?? 'bg-white',
                  accentStyle?.cardBorder ? `border ${accentStyle.cardBorder}` : 'border border-gray-100',
                  'hover:border-opacity-100'
                )}
              >
                <CardHeader className="pb-2 pt-5 px-5">
                  <CardTitle className="text-base font-bold text-gray-900">
                    {card.name}
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-500 leading-snug">
                    {card.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 px-5 pb-5">
                  <PreviewMockup type={card.preview} accent={card.accent} />
                </CardContent>
              </Card>
              );
            })}
          </div>

          <div className="flex justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="rounded-full border-green-200 bg-white text-green-700 hover:bg-green-50 hover:border-green-300 disabled:opacity-40"
              aria-label="Previous cards"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="rounded-full border-green-200 bg-white text-green-700 hover:bg-green-50 hover:border-green-300 disabled:opacity-40"
              aria-label="Next cards"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Add your idea CTA */}
          <div className="mt-12 text-center">
            <p className="text-gray-600 mb-3 max-w-xl mx-auto">
              Have an idea that will help African businesses? Add yours.
            </p>
            <Button
              onClick={() => {
                setFeatureSubmitError(null);
                setFeatureModalOpen(true);
              }}
              className="bg-[#166534] hover:bg-[#14532d] text-white"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              Add your idea
            </Button>
          </div>
        </div>
      </div>

      {/* Request a feature modal */}
      {featureModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => {
            if (!featureSubmitted) {
              setFeatureSubmitError(null);
              setFeatureModalOpen(false);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feature-modal-title"
        >
          <Card
            className="w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
              <div>
                <CardTitle id="feature-modal-title">Add your idea</CardTitle>
                <CardDescription>
                  Share your idea or problem. We build solutions for African businesses.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 -mr-2 -mt-1"
                onClick={() => {
                  setFeatureSubmitError(null);
                  setFeatureModalOpen(false);
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {featureSubmitted ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                  Thank you! We&apos;ll review your request and get back to you.
                </div>
              ) : (
                <form onSubmit={handleSubmit(onFeatureSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="feature-name">Name</Label>
                    <Input
                      id="feature-name"
                      {...register('name')}
                      className="mt-1"
                      placeholder="Your name"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="feature-email">Email</Label>
                    <Input
                      id="feature-email"
                      type="email"
                      {...register('email')}
                      className="mt-1"
                      placeholder="your.email@example.com"
                    />
                    {errors.email && (
                      <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="feature-problem">Describe the problem or the feature needed</Label>
                    <Textarea
                      id="feature-problem"
                      {...register('problem')}
                      className="mt-1"
                      rows={4}
                      placeholder="e.g. I need to track credit sales and who owes what without using WhatsApp..."
                    />
                    {errors.problem && (
                      <p className="mt-1 text-sm text-red-600">{errors.problem.message}</p>
                    )}
                  </div>
                  {featureSubmitError && (
                    <p className="text-sm text-red-600">{featureSubmitError}</p>
                  )}
                  <div className="flex gap-2 justify-end pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setFeatureSubmitError(null);
                        setFeatureModalOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="bg-[#166534] hover:bg-[#14532d]">
                      {isSubmitting ? 'Sending...' : 'Submit'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
