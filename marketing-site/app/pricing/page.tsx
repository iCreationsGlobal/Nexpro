import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PricingPageContent } from "@/components/sections/PricingPageContent";
import { SHOW_PRICING } from "@/lib/featureFlags";

export const metadata: Metadata = {
  title: "Pricing Plans",
  description:
    "Choose an African Business Suite (ABS) plan that works best for your business. Starter, Professional, and Enterprise plans for shops, pharmacies, and studios.",
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingPage() {
  if (!SHOW_PRICING) {
    redirect("/");
  }

  return (
    <main>
      <div className="pt-24 sm:pt-32 pb-8 sm:pb-12 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Pricing Plans
          </h1>
          <p className="text-xl text-gray-600">
            Choose the plan that works best for your business
          </p>
        </div>
      </div>
      <PricingPageContent />
    </main>
  )
}
