'use client';

import { Pricing } from './Pricing';
import dynamic from 'next/dynamic';

const CTASection = dynamic(
  () => import('@/components/sections/CTASection').then((m) => m.CTASection),
  { ssr: true }
);

export function PricingPageContent() {
  return (
    <>
      <Pricing showTitle={false} />
      <CTASection />
    </>
  );
}
