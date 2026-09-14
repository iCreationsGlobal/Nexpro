"use client";

import Link from "next/link";
import { canCashout, commissionAmount } from "@/lib/workspace";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCashout,
  getMarketerSession,
  listMyEarnings,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AnyRow = Record<string, unknown>;

export default function CashoutPage() {
  const router = useRouter();
  const [due, setDue] = useState<AnyRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasPayout, setHasPayout] = useState(true);
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    (async () => {
      const [earn, me] = await Promise.all([listMyEarnings("due"), getMarketerSession()]);
      const rows = ((earn.data || []) as AnyRow[]).filter(canCashout);
      setDue(rows);
      const firstBusiness = rows[0] ? String(rows[0].tenantId) : "";
      setBusinessId(firstBusiness);
      setSelected(new Set(rows.filter(r => String(r.tenantId) === firstBusiness).map(r => String(r.id))));
      setHasPayout(Boolean(me.data.marketer.momoNumber || me.data.marketer.bankDetails));
    })().catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load")).finally(() => setLoading(false));
  }, [attempt]);

  const total = due
    .filter((e) => selected.has(String(e.id)))
    .reduce((s, e) => s + commissionAmount(e), 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setMessage("");
    if (!hasPayout) {
      setMessage("Save a MoMo number or bank details in Account first.");
      return;
    }
    if (selected.size === 0) {
      setMessage("Select at least one due commission.");
      return;
    }
    setSaving(true);
    try {
      await createCashout({
        commissionIds: Array.from(selected),
        notes: notes.trim() || undefined,
      });
      router.push("/earnings");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cashout failed");
      setSaving(false);
    }
  };

  if (loading) return <div className="workspace-page" role="status">Loading available commissions…</div>;

  if (loadError) return <div className="workspace-page" role="alert"><p>{loadError}</p><Button onClick={() => { setLoading(true); setLoadError(""); setAttempt(a => a + 1); }}>Try again</Button></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/earnings">
        <Button variant="ghost">← Back to earnings</Button>
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-brand-900">Request cashout</h1>
      <p className="mt-1 text-sm text-brand-500">
        Select available commissions from one business per request. Track the payout status in Earnings.
      </p>

      {!hasPayout ? (
        <p className="mt-4 text-sm text-amber-700">
          <Link href="/account" className="underline">
            Add payout details
          </Link>{" "}
          before cashout.
        </p>
      ) : null}

      {due.length > 0 && <label className="mt-6 block text-sm">Business
        <select className="mt-2 block w-full rounded-lg border border-brand-200 bg-white p-3" value={businessId} onChange={event => { const id = event.target.value; setBusinessId(id); setSelected(new Set(due.filter(row => String(row.tenantId) === id).map(row => String(row.id)))); }}>
          {Array.from(new Set(due.map(row => String(row.tenantId)))).map(id => { const row = due.find(row => String(row.tenantId) === id); return <option key={id} value={id}>{String((row?.tenant as AnyRow)?.name || id)}</option>; })}
        </select>
      </label>}
      <div className="mt-6 space-y-2">
        {due.length === 0 ? (
          <p className="text-sm text-brand-500">No due commissions.</p>
        ) : (
          due.filter(e => String(e.tenantId) === businessId).map((e) => {
            const id = String(e.id);
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-brand-200 bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => toggle(id)}
                />
                <span className="flex-1">
                  GHS {commissionAmount(e).toFixed(2)} · {String(e.rateType || "commission")}
                </span>
              </label>
            );
          })
        )}
      </div>

      <label className="mt-4 block text-sm text-brand-600">
        Notes (optional)
        <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={loading || saving || !hasPayout || selected.size === 0} onClick={submit}>
          {saving ? "Submitting…" : `Request GHS ${total.toFixed(2)}`}
        </Button>
        {message ? <p className="text-sm text-brand-500">{message}</p> : null}
      </div>
    </div>
  );
}
