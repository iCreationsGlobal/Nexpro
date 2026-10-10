'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { WHATSAPP_CONTACT_URL } from '@/lib/constants';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';

export function ContactSalesSection({ showTitle = true }: { showTitle?: boolean }) {
  return (
    <section id="contact-sales" className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="mx-auto max-w-3xl text-center">
        {showTitle && (
          <>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Get a package that fits your business
            </h2>
            <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto mb-8">
              We work with each business one-on-one to tailor a plan. Talk to our team for a custom package.
            </p>
          </>
        )}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="w-full sm:w-auto text-base px-8 py-6 bg-[#166534] hover:bg-[#14532d] text-white">
              <WhatsAppIcon size={20} className="mr-2" />
              Contact Sales
            </Button>
          </a>
          <Link href="/contact?intent=demo">
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8 py-6 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white">
              <Play className="mr-2 h-5 w-5" />
              Watch demo
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
