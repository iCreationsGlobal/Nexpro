"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff, ArrowUpRight, Send, Wallet, Building2 } from "lucide-react";
import { getMarketerDashboard, getMarketerSession, listMyApplications, listMyCashouts, listMyReferrals } from "@/lib/api";

type Row = Record<string, unknown>;
const money = (amount: unknown) => `GHS ${Number(amount || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DashboardPage() {
  const [name, setName] = useState("");
  const [stats, setStats] = useState<Row>({});
  const [recent, setRecent] = useState<Row[]>([]);
  const [applications, setApplications] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getMarketerSession(), getMarketerDashboard(), listMyApplications(), listMyReferrals(), listMyCashouts()]).then(([me, dash, apps, refs, cashouts]) => {
      if (cancelled) return;
      setName(me.data.marketer.name); setStats(dash.data);
      setApplications(apps.data.filter(a => (a as Row).status === "pending").length);
      setRecent([
        ...refs.data.map(row => ({ ...(row as Row), kind: "referral" })),
        ...cashouts.data.map(row => ({ ...(row as Row), kind: "cashout" })),
      ].sort((a, b) => (Date.parse(String((b as Row).createdAt)) || 0) - (Date.parse(String((a as Row).createdAt)) || 0)).slice(0, 6));
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load dashboard"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);
  const amount = (value: unknown) => hidden ? "••••••" : money(value);
  if (loading) return <div className="workspace-page" role="status">Loading your overview…</div>;
  if (error) return <div className="workspace-page" role="alert"><h1>Overview unavailable</h1><p>{error}</p><button className="workspace-action" onClick={() => { setLoading(true); setError(""); setAttempt(a => a + 1); }}>Try again</button></div>;
  return <div className="workspace-page">
    <div className="workspace-page-heading"><div><p className="workspace-eyebrow">YOUR SABITO</p><h1>Hi, {name.split(" ")[0] || "there"}</h1><p>Here’s how your connections are paying off.</p></div><Link href="/businesses" className="workspace-link">Find a business <ArrowUpRight size={18} /></Link></div>
    <section className="workspace-balance" aria-label="Earnings summary">
      <div className="workspace-balance-top"><div><p>Available balance</p><div className="workspace-balance-value"><h2>{amount(stats.availableBalance)}</h2><button aria-label={hidden ? "Show balances" : "Hide balances"} aria-pressed={hidden} onClick={() => setHidden(v => !v)}>{hidden ? <EyeOff /> : <Eye />}</button></div><p>Available for withdrawal</p></div><Link href="/cashout" className="workspace-lemon-action">Request cashout <ArrowUpRight size={18} /></Link></div>
      <div className="workspace-balance-details"><div><span>Awaiting business payment</span><strong>{amount(stats.pendingRemittanceAmount)}</strong></div><div><span>Cashout in progress</span><strong>{amount(stats.pendingCashoutAmount)}</strong></div><div><span>Total earned</span><strong>{amount(stats.totalEarned)}</strong></div></div>
    </section>
    <div className="workspace-metrics">{[["Active partners", stats.activePartnershipsCount], ["Referrals", (stats.referrals as Row)?.total], ["Pending applications", applications]].map(([label, value]) => <div key={String(label)}><p>{String(label)}</p><strong>{Number(value || 0)}</strong></div>)}</div>
    <div className="workspace-quick-actions"><Link href="/referrals?add=1"><Send /><div><strong>Add a referral</strong><span>Connect a client with a partner</span></div><ArrowUpRight /></Link><Link href="/earnings"><Wallet /><div><strong>Your earnings</strong><span>Track commissions and payouts</span></div><ArrowUpRight /></Link></div>
    {Number(stats.activePartnershipsCount || 0) === 0 && <section className="workspace-onboarding"><Building2 size={30} /><div><h2>Start with your first business partner</h2><p>Find a business you know, send an application, and refer clients once approved.</p></div><Link href="/businesses" className="workspace-action">Browse businesses</Link></section>}
    <section className="workspace-activity"><div className="workspace-section-heading"><h2>Recent activity</h2><Link href="/activities" className="workspace-link">See all <ArrowUpRight size={16} /></Link></div>{recent.length === 0 ? <p className="workspace-empty">Your referrals and cashout updates will appear here.</p> : recent.map(row => <Link className="workspace-activity-row" key={`${row.kind}-${row.id}`} href={row.kind === "referral" ? `/referrals/${row.id}` : "/earnings"}><span className="workspace-activity-icon">{row.kind === "referral" ? <Send size={19} /> : <Wallet size={19} />}</span><div><strong>{row.kind === "referral" ? String(row.clientName || "Client referral") : hidden ? "Cashout · ••••••" : `Cashout · ${money(row.amount)}`}</strong><span>{row.createdAt ? new Date(String(row.createdAt)).toLocaleDateString() : ""}</span></div><span className="workspace-status">{String(row.status || "pending").replaceAll("_", " ")}</span></Link>)}</section>
  </div>;
}
