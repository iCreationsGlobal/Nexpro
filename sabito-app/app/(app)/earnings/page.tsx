"use client";

import Link from "next/link";
import { canCashout, commissionAmount } from "@/lib/workspace";
import { useEffect, useMemo, useState } from "react";
import {
  getMarketerDashboard,
  getMarketerSession,
  listMyCashouts,
  listMyEarnings,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

type AnyRow = Record<string, unknown>;

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<AnyRow[]>([]);
  const [cashouts, setCashouts] = useState<AnyRow[]>([]);
  const [dueBalance, setDueBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [hasMomo, setHasMomo] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true); setError("");
    (async () => {
      try {
        const [earn, cos, dash, me] = await Promise.all([
          listMyEarnings(),
          listMyCashouts(),
          getMarketerDashboard(),
          getMarketerSession(),
        ]);
        setEarnings((earn.data || []) as AnyRow[]);
        setCashouts((cos.data || []) as AnyRow[]);
        const dashData = (dash.data || {}) as Record<string, unknown>;
        setDueBalance(Number(dashData.availableBalance || 0));
        setTotalEarned(Number(dashData.totalEarned || 0));
        setHasMomo(Boolean(me.data.marketer.momoNumber || me.data.marketer.bankDetails));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally { setLoading(false); }
    })();
  }, [attempt]);

  const dueCount = useMemo(
    () => earnings.filter(canCashout).length,
    [earnings]
  );

  if (loading) return <div className="workspace-page" role="status">Loading earnings…</div>;
  if (error) return <div className="workspace-page" role="alert"><p>{error}</p><Button onClick={() => setAttempt(a => a + 1)}>Try again</Button></div>;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Earnings</h1>
          <p className="text-sm text-slate-500">Commissions and cashout requests</p>
        </div>
        <Link href="/cashout">
          <Button disabled={dueCount === 0}>Request cashout</Button>
        </Link>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {!hasMomo ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add a MoMo number or bank details in{" "}
          <Link href="/account" className="font-semibold underline">
            Account
          </Link>{" "}
          before requesting cashout.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-[#1F4039] p-4 text-white">
          <p className="text-sm opacity-80">Available (due)</p>
          <p className="text-2xl font-bold">GHS {dueBalance.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Total earned</p>
          <p className="text-2xl font-bold text-slate-900">GHS {totalEarned.toFixed(2)}</p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="font-semibold text-slate-900">Commission history</h2>
        <div className="mt-3 space-y-2">
          {earnings.length === 0 ? (
            <p className="text-sm text-slate-500">No earnings yet.</p>
          ) : (
            earnings.map((e) => (
              <div key={String(e.id)} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium">
                  GHS {commissionAmount(e).toFixed(2)} · {String(e.status)}
                </p>
                <p className="text-slate-500">
                  {String(e.rateType || "commission")}
                  {e.ratePercent ? ` @ ${String(e.ratePercent)}%` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-semibold text-slate-900">Cashout requests</h2>
        <div className="mt-3 space-y-2">
          {cashouts.length === 0 ? (
            <p className="text-sm text-slate-500">No cashout requests yet.</p>
          ) : (
            cashouts.map((c) => (
              <div key={String(c.id)} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium">
                  GHS {Number(c.amount || 0).toFixed(2)} · {String(c.status)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
