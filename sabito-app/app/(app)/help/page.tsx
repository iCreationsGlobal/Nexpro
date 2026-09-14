"use client";

import { SUPPORT_EMAIL, WHATSAPP_SUPPORT } from "@/lib/constants";

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-900">Help & support</h1>
      <p className="mt-2 text-sm text-brand-500">
        Need help with partnerships, referrals, or cashouts? Reach the Sabito team.
      </p>
      <div className="mt-6 space-y-3">
        <a
          href={`https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent("Hi Sabito support")}`}
          className="block rounded-xl border border-brand-200 bg-white p-4 hover:border-[var(--sabito-green)]"
          target="_blank"
          rel="noreferrer"
        >
          <p className="font-semibold text-brand-900">WhatsApp</p>
          <p className="text-sm text-brand-500">Chat with support</p>
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Sabito marketer support")}`}
          className="block rounded-xl border border-brand-200 bg-white p-4 hover:border-[var(--sabito-green)]"
        >
          <p className="font-semibold text-brand-900">Email</p>
          <p className="text-sm text-brand-500">{SUPPORT_EMAIL}</p>
        </a>
      </div>
    </div>
  );
}
