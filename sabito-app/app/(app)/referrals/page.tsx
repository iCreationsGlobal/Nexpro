"use client";

import { useBrowserSearch } from "@/lib/browserState";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createReferral,
  listMyPartnerships,
  listMyReferrals,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AnyRow = Record<string, unknown>;
const fetchRows = () => Promise.all([listMyPartnerships(), listMyReferrals()]);

export default function ReferralsPage() {
  const [partnerships, setPartnerships] = useState<AnyRow[]>([]);
  const [referrals, setReferrals] = useState<AnyRow[]>([]);
  const [partnershipId, setPartnershipId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const browserSearch = useBrowserSearch();
  const [formChoice, setShowForm] = useState<boolean | null>(null);
  const showForm = formChoice ?? (new URLSearchParams(browserSearch).get("add") === "1");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const applyRows = ([partners, refs]: Awaited<ReturnType<typeof fetchRows>>) => {
    const partnerRows = ((partners.data || []) as AnyRow[]).filter(p => p.status === "active");
    setPartnerships(partnerRows);
    setReferrals((refs.data || []) as AnyRow[]);
    setPartnershipId((prev) => {
      const requested = prev || new URLSearchParams(window.location.search).get("partnership") || "";
      return partnerRows.some(row => String(row.id) === requested) ? requested : partnerRows[0] ? String(partnerRows[0].id) : "";
    });
  };

  const load = () => fetchRows().then(applyRows);

  useEffect(() => {
    let active = true;
    fetchRows().then((rows) => { if (active) applyRows(rows); })
      .catch((err) => { if (active) setLoadError(err instanceof Error ? err.message : "Failed to load"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    setMessage("");
    if (!partnershipId || !clientName.trim()) {
      setMessage("Select a partnership and enter the client name.");
      return;
    }
    if (!clientEmail.trim() && !clientPhone.trim()) {
      setMessage("Add client email or phone so the business can match the customer.");
      return;
    }
    setSaving(true);
    try {
      await createReferral({
        partnershipId,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        location: location.trim() || undefined,
        note: note.trim() || undefined,
      });
      setClientName("");
      setClientEmail("");
      setClientPhone("");
      setLocation("");
      setNote("");
      setShowForm(false);
      setMessage("Referral submitted.");
      try { await load(); } catch { setMessage("Referral submitted. Refresh the page to see the latest list."); }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create referral");
    } finally {
      setSaving(false);
    }
  };

  const filtered = referrals.filter(r => (status === "all" || r.status === status) && [r.clientName, r.clientEmail, r.clientPhone, r.email, r.phone].some(v => String(v || "").toLowerCase().includes(search.toLowerCase())));
  if (loading) return <div className="workspace-page" role="status">Loading referrals…</div>;
  if (loadError) return <div className="workspace-page" role="alert"><p>{loadError}</p><Button onClick={() => { setLoading(true); setLoadError(""); load().catch(err => setLoadError(String(err))).finally(() => setLoading(false)); }}>Try again</Button></div>;
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Referrals</h1>
        <p className="text-sm text-brand-500">
          Refer clients to your partners and track each connection in one place.
        </p>
      </div>

      {message && <p role="status" className={`rounded-xl p-4 text-sm ${message.startsWith("Referral submitted") ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>{message}</p>}
      {partnerships.length === 0 ? (
        <section className="workspace-onboarding"><div><h2>Partner with a business to start referring clients</h2><p>Browse businesses and send an application. Once approved, you can submit referrals here.</p></div><Link href="/businesses" className="workspace-action">Browse businesses</Link></section>
      ) : <Button disabled={saving} onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Add referral"}</Button>}
      {showForm && partnerships.length > 0 && <form className="rounded-2xl border border-brand-200 bg-white p-5" aria-label="Add referral" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <h2 className="font-semibold text-brand-900">Add referral</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="text-sm text-brand-600">
              Partnership
              <select
                className="mt-1 w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm"
                value={partnershipId}
                onChange={(e) => setPartnershipId(e.target.value)}
              >
                {partnerships.map((p) => {
                  const tenant = p.tenant as AnyRow | undefined;
                  const settings = tenant?.partnerProgramSettings as AnyRow | undefined;
                  return (
                    <option key={String(p.id)} value={String(p.id)}>
                      {String(settings?.displayName || tenant?.name || p.referralCode || p.id)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-sm text-brand-600">
              Client name *
              <Input className="mt-1" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </label>
            <label className="text-sm text-brand-600">
              Client email (or phone)
              <Input className="mt-1" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </label>
            <label className="text-sm text-brand-600">
              Client phone (or email)
              <Input className="mt-1" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </label>
            <label className="text-sm text-brand-600">
              Location (optional)
              <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <label className="text-sm text-brand-600">
              Note (optional)
              <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving || partnerships.length === 0}>
            {saving ? "Submitting…" : "Submit referral"}
          </Button>
        </div>
      </form>}

      <section>
        <h2 className="font-semibold text-brand-900">Your referrals</h2>
        <div className="my-4 flex flex-wrap gap-3">
          <Input aria-label="Search referrals" placeholder="Search by client name, email or phone" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
          <select aria-label="Referral status" value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm"><option value="all">All statuses</option>{Array.from(new Set(referrals.map(r => String(r.status)))).sort().map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
        </div>
        <div className="mt-3 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-brand-500">{referrals.length ? "No referrals match your search." : "Your referrals will appear here once submitted."}</p>
          ) : (
            filtered.map((r) => (
              <Link
                key={String(r.id)}
                href={`/referrals/${r.id}`}
                className="block rounded-xl border border-brand-200 bg-white p-3 text-sm hover:border-[var(--sabito-green)]"
              >
                <p className="font-medium">{String(r.clientName || "Client")}</p>
                <p className="text-brand-500">
                  {String(r.status)}
                  {r.email ? ` · ${String(r.email)}` : ""}
                  {r.phone ? ` · ${String(r.phone)}` : ""}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
