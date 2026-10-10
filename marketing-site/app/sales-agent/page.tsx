'use client';

import Link from 'next/link';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, MapPin, Megaphone, Send, Store, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, APP_URL, BRAND_ALTERNATE } from '@/lib/constants';

const salesAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(6, 'Please enter a valid phone or WhatsApp number'),
  email: z.string().email('Invalid email address'),
  cityRegion: z.string().min(2, 'City or region is required'),
  experience: z.string().optional(),
  whyJoin: z.string().optional(),
});

type SalesAgentFormValues = z.infer<typeof salesAgentSchema>;

const benefits = [
  {
    icon: Store,
    title: 'Help local businesses modernize',
    description: 'Introduce ABS to shops, studios, pharmacies, salons, and service businesses that need simpler tools.',
  },
  {
    icon: Megaphone,
    title: 'Earn from introductions',
    description: 'Refer serious business owners and grow with the ABS team as they move from paper and WhatsApp to digital workflows.',
  },
  {
    icon: Users,
    title: 'Work with a practical product',
    description: 'ABS brings POS, inventory, invoices, customers, reports, and mobile access together for everyday African businesses.',
  },
];

export default function SalesAgentPage() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SalesAgentFormValues>({
    resolver: zodResolver(salesAgentSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      cityRegion: '',
      experience: '',
      whyJoin: '',
    },
  });

  const onSubmit = async (data: SalesAgentFormValues) => {
    setSubmitError(null);
    try {
      const res = await fetch(`${API_URL}/api/public/sales-agent-application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSubmitError(json?.error || 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted(true);
      reset();
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    }
  };

  return (
    <main className="bg-white">
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#ecfdf5] to-white border-b border-emerald-100">
        <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-[#166534]">
              <MapPin className="mr-2 h-4 w-4" />
              Ghana sales partner program
            </div>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-950">
              Become an {BRAND_ALTERNATE} Sales Agent
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-gray-600 leading-relaxed max-w-2xl">
              Help shops, studios, pharmacies, and growing local businesses go digital. Earn by introducing ABS to owners who need POS, inventory, invoices, customers, and reports in one place.
            </p>
            <p className="mt-3 text-sm text-gray-500 max-w-2xl">
              This is the ABS Sales Agent program (SaaS signup growth). It is separate from{' '}
              <strong className="font-medium text-gray-700">Sabito Partners</strong> — the marketer referral program for customers of individual businesses.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/contact">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white">
                  Ask a question
                </Button>
              </Link>
              <a href="#apply">
                <Button size="lg" className="w-full sm:w-auto bg-[#166534] hover:bg-[#14532d] text-white">
                  Apply now
                </Button>
              </a>
            </div>
          </div>

          <Card className="bg-white border-emerald-200">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-950">How it works</CardTitle>
              <CardDescription>
                A short application helps us understand your location, network, and experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Apply with your contact details and city or region.',
                'Our team reviews your application and follows up.',
                'Approved agents get a unique code and signup link to share with businesses.',
                'Businesses that sign up with your code get 3 months free. You earn on their first 3 paid months after that.',
              ].map((step) => (
                <div key={step} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#166534]" />
                  <p className="text-sm text-gray-700 leading-relaxed">{step}</p>
                </div>
              ))}
              <p className="text-sm text-gray-600 leading-relaxed pt-1">
                Already have a code? Share{' '}
                <a
                  href={`${APP_URL}/signup?code=YOUR_CODE`}
                  className="font-medium text-[#166534] hover:underline"
                >
                  {APP_URL}/signup?code=YOUR_CODE
                </a>{' '}
                so new businesses can start with 3 months free.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-950">
              Built for people who know local business owners
            </h2>
            <p className="mt-4 text-lg text-gray-600 leading-relaxed">
              If you already speak with shop owners, studio operators, pharmacists, salons, service providers, or SME founders, you can help them discover a simpler way to run daily operations.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <Card key={benefit.title} className="border-gray-200 bg-white">
                  <CardHeader>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-[#166534]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-xl text-gray-950">{benefit.title}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {benefit.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="apply" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 border-t border-gray-100">
        <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-12 items-start">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-950">
              Apply in a few minutes
            </h2>
            <p className="mt-4 text-lg text-gray-600 leading-relaxed">
              Tell us where you are, how to reach you, and why you want to help businesses go digital with ABS.
            </p>
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-5">
              <p className="text-sm font-semibold text-[#166534]">Best fit</p>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Sales experience helps, but it is not required. We care most about your ability to connect with business owners and explain practical value clearly.
              </p>
            </div>
          </div>

          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle>Sales agent application</CardTitle>
              <CardDescription>
                Required fields help us contact you and match you to the right region.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-[#166534]" />
                  <h3 className="mt-4 text-lg font-semibold text-gray-950">Application received</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Thank you for applying. The ABS team will review your details and follow up.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5 border-[#166534] text-[#166534] hover:bg-[#166534] hover:text-white"
                    onClick={() => setSubmitted(false)}
                  >
                    Submit another application
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="agent-name">Name</Label>
                      <Input
                        id="agent-name"
                        {...register('name')}
                        className="mt-1"
                        placeholder="Your full name"
                      />
                      {errors.name && (
                        <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="agent-phone">Phone/WhatsApp</Label>
                      <Input
                        id="agent-phone"
                        {...register('phone')}
                        className="mt-1"
                        placeholder="055 000 0000"
                      />
                      {errors.phone && (
                        <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="agent-email">Email</Label>
                      <Input
                        id="agent-email"
                        type="email"
                        {...register('email')}
                        className="mt-1"
                        placeholder="you@example.com"
                      />
                      {errors.email && (
                        <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="agent-city-region">City/Region</Label>
                      <Input
                        id="agent-city-region"
                        {...register('cityRegion')}
                        className="mt-1"
                        placeholder="Accra, Ashanti, Tamale..."
                      />
                      {errors.cityRegion && (
                        <p className="mt-1 text-sm text-red-600">{errors.cityRegion.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="agent-experience">Experience (optional)</Label>
                    <Textarea
                      id="agent-experience"
                      {...register('experience')}
                      className="mt-1 min-h-24"
                      placeholder="Tell us about any sales, field work, SME, software, or business experience."
                    />
                    {errors.experience && (
                      <p className="mt-1 text-sm text-red-600">{errors.experience.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="agent-why-join">Why do you want to join? (optional)</Label>
                    <Textarea
                      id="agent-why-join"
                      {...register('whyJoin')}
                      className="mt-1 min-h-24"
                      placeholder="Share why you want to help businesses go digital with ABS."
                    />
                    {errors.whyJoin && (
                      <p className="mt-1 text-sm text-red-600">{errors.whyJoin.message}</p>
                    )}
                  </div>

                  {submitError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {submitError}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="bg-[#166534] hover:bg-[#14532d] text-white"
                      disabled={isSubmitting}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {isSubmitting ? 'Submitting...' : 'Submit application'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
