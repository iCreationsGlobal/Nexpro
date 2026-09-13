"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getMyReferral } from "@/lib/api";
import { Button } from "@/components/ui/button";

type AnyRow = Record<string, unknown>;

export default function ReferralDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const [referral, setReferral] = useState<AnyRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = () => getMyReferral(id)
      .then(res => { if (!cancelled) { setReferral((res.data || null) as AnyRow | null); setError(""); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not refresh referral"); });
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/referrals">
        <Button variant="ghost">← Back to referrals</Button>
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Referral details</h1>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {!error && !referral ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : null}
      {referral ? (
        <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
          <p>
            <span className="text-slate-500">Client</span>
            <br />
            <span className="font-semibold">{String(referral.clientName || "—")}</span>
          </p>
          <p>
            <span className="text-slate-500">Status</span>
            <br />
            <span className="font-semibold">{String(referral.status || "—")}</span>
          </p>
          <p>
            <span className="text-slate-500">Email</span>
            <br />
            {String(referral.email || "—")}
          </p>
          <p>
            <span className="text-slate-500">Phone</span>
            <br />
            {String(referral.phone || "—")}
          </p>
          {referral.location ? (
            <p>
              <span className="text-slate-500">Location</span>
              <br />
              {String(referral.location)}
            </p>
          ) : null}
          {referral.note ? (
            <p>
              <span className="text-slate-500">Note</span>
              <br />
              {String(referral.note)}
            </p>
          ) : null}
          {referral.createdAt ? (
            <p className="text-slate-500">
              Created {new Date(String(referral.createdAt)).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}
      {referral && <section className="mt-8" aria-label="Client jobs">
        <h2 className="text-lg font-semibold">Client jobs</h2>
        <p className="mt-1 text-sm text-slate-500">Progress updates from your partner business. Refreshes every 30 seconds while this page is open.</p>
        {!Array.isArray(referral.jobs) || referral.jobs.length === 0 ? <p className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{referral.status === "matched" ? "No linked jobs yet. New jobs will appear once the business starts work for this client." : "Jobs become visible after your referral is matched to a customer."}</p> : <div className="mt-4 space-y-3">{(referral.jobs as AnyRow[]).map(job => <article key={String(job.id)} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{String(job.jobNumber)}</p><h3 className="mt-1 font-semibold">{String(job.title)}</h3></div><span className="workspace-status">{String(job.status).replaceAll("_", " ")}</span></div><div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">{job.dueDate ? <span>Due {new Date(String(job.dueDate)).toLocaleDateString()}</span> : null}<span>Updated {new Date(String(job.updatedAt)).toLocaleDateString()}</span></div></article>)}</div>}
      </section>}
    </div>
  );
}
