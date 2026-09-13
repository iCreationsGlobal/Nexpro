"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredToken, listPartners, listMyApplications, listMyPartnerships, type MarketplaceBusiness } from "@/lib/api";
import { BusinessCard } from "@/components/businesses/BusinessCard";
import { Input } from "@/components/ui/input";
import { SABITO_CATEGORY_CHIPS, sabitoCategoryQuery, type SabitoCategoryChipId } from "@/lib/partnerCategories";

type Row = Record<string, unknown>;
export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<MarketplaceBusiness[]>([]);
  const [applications, setApplications] = useState<Row[]>([]);
  const [partners, setPartners] = useState<Row[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState("discover");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SabitoCategoryChipId>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const authenticated = Boolean(getStoredToken());
    setSignedIn(authenticated);
    const view = new URLSearchParams(window.location.search).get("view");
    if (authenticated && (view === "applications" || view === "partners")) setTab(view);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try {
        if (tab === "discover") {
          const data = await listPartners({ search: search || undefined, category: sabitoCategoryQuery(category) });
          if (!cancelled) setBusinesses(data);
        } else {
          const [apps, partnerships] = await Promise.all([listMyApplications(), listMyPartnerships()]);
          if (!cancelled) { setApplications(apps.data as Row[]); setPartners(partnerships.data as Row[]); }
        }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load businesses"); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, category, tab, attempt]);
  const rows = tab === "applications" ? applications : partners;
  return <div className="workspace-page">
    <div className="workspace-page-heading"><div><h1>Businesses</h1><p>Find your next partner and grow your referral income.</p></div></div>
    {signedIn && <div className="workspace-tabs" aria-label="Business views">{[["discover", "Discover"], ["partners", "My partnerships"], ["applications", "Applications"]].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)} className={tab === value ? "is-active" : ""}>{label}</button>)}</div>}
    {tab === "discover" && <><Input aria-label="Search businesses" placeholder="Search by name or location" value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" /><div className="sabito-partner-filters">{SABITO_CATEGORY_CHIPS.map(chip => <button className={`sabito-partner-filter ${category === chip.id ? "is-active" : ""}`} aria-pressed={category === chip.id} key={chip.id} onClick={() => setCategory(chip.id)}>{chip.id === "all" ? "All" : chip.label}</button>)}</div></>}
    {loading ? <p className="workspace-empty" role="status">Loading businesses…</p> : error ? <div className="workspace-empty" role="alert"><p>{error}</p><button className="workspace-action mt-3" onClick={() => setAttempt(a => a + 1)}>Try again</button></div> : tab === "discover" ? <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{businesses.length ? businesses.map(b => <BusinessCard key={b.id} business={b} featured />) : <p className="workspace-empty col-span-full">No businesses match. Try another category or search.</p>}</div> : <div className="mt-6 space-y-3">{rows.length === 0 ? <div className="workspace-onboarding"><div><h2>{tab === "applications" ? "No applications yet" : "No partnerships yet"}</h2><p>Discover a business and apply to become a referral partner.</p></div><button className="workspace-action" onClick={() => setTab("discover")}>Discover businesses</button></div> : rows.map(row => {
      const tenant = row.tenant as Row | undefined;
      const settings = tenant?.partnerProgramSettings as Row | undefined;
      const title = String(settings?.displayName || tenant?.name || "Business partner");
      return <article key={String(row.id)} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2><span className="workspace-status">{String(row.status || "pending")}</span></div>{row.createdAt ? <p className="mt-2 text-sm text-slate-500">{new Date(String(row.createdAt)).toLocaleDateString()}</p> : null}{tab === "partners" && row.status === "active" && <Link href={`/referrals?add=1&partnership=${encodeURIComponent(String(row.id))}`} className="workspace-link mt-4">Add a referral →</Link>}</article>;
    })}</div>}
  </div>;
}
