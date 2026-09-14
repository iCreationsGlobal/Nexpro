"use client";

import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function GetTheAppModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="get-app-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="get-app-title" className="text-xl font-bold text-brand-900">
          Get the Sabito app
        </h2>
        <p className="mt-2 text-sm text-brand-600">
          Track referrals, apply to partners, and request cashouts on the go. Use the marketer web
          app now — mobile builds are available via Expo for partners.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a href="/signup">
            <Button className="w-full">Join as marketer on web</Button>
          </a>
          <a href="/login">
            <Button variant="outline" className="w-full">
              Sign in
            </Button>
          </a>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
