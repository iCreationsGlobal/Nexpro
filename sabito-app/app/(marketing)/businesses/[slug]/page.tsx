"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  applyToPartner,
  getPartner,
  getStoredToken,
  type MarketplaceBusiness,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function BusinessDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<MarketplaceBusiness | null>(null);
  const [pitch, setPitch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await getPartner(params.slug);
      if (!cancelled) {
        setBusiness(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  const onApply = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!getStoredToken()) {
      router.push(`/login?next=/businesses/${params.slug}`);
      return;
    }
    if (!business?.tenantId) return;
    if (business.applicationsOpen === false) {
      setError("Applications are full for this business.");
      return;
    }
    setSubmitting(true);
    try {
      await applyToPartner(business.tenantId, pitch);
      setMessage("Application submitted. Track status in your dashboard.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-brand-500">Loading…</p>;
  }
  if (!business) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p>Business not found.</p>
        <Link href="/businesses" className="text-[var(--sabito-teal)]">
          Back to marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-[var(--sabito-teal)]">{business.category}</p>
      <h1 className="mt-1 text-3xl font-bold text-brand-900">{business.name}</h1>
      <p className="mt-1 text-brand-500">{business.location}</p>
      <p className="mt-4 text-brand-700">{business.pitch || business.description}</p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-brand-500">First-client commission</p>
          <p className="font-semibold">{business.firstClientRatePercent ?? business.commissionFrom}%</p>
        </div>
        <div>
          <p className="text-xs text-brand-500">Returning-client commission</p>
          <p className="font-semibold">{business.returningClientRatePercent ?? "—"}%</p>
        </div>
        <div>
          <p className="text-xs text-brand-500">Slots left</p>
          <p className="font-semibold">{business.slotsLeft ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-brand-500">Payout notes</p>
          <p className="text-sm">{business.payoutNotes || "After the business remits commissions to ABS, request cashout in Sabito. ABS pays your marketer share to your saved payout method."}</p>
        </div>
      </div>

      {business.services && business.services.length > 0 ? (
        <div className="mt-6">
          <h2 className="font-semibold text-brand-900">Services in program</h2>
          <ul className="mt-2 space-y-1 text-sm text-brand-700">
            {business.services.map((s) => (
              <li key={s.id}>
                {s.label} — first {s.firstClientRatePercent}% / returning {s.returningClientRatePercent}%
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={onApply} className="mt-8 space-y-3 rounded-2xl border border-brand-200 p-5">
        <h2 className="font-semibold text-brand-900">Apply to partner</h2>
        <Input
          placeholder="Short pitch / experience (optional)"
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-[var(--sabito-teal)]">{message}</p> : null}
        <div className="flex justify-end gap-2">
          <Link href="/dashboard">
            <Button type="button" variant="outline">
              Dashboard
            </Button>
          </Link>
          <Button type="submit" disabled={submitting || business.applicationsOpen === false}>
            {business.applicationsOpen === false
              ? "Applications full"
              : submitting
                ? "Submitting…"
                : "Apply"}
          </Button>
        </div>
      </form>
    </div>
  );
}
