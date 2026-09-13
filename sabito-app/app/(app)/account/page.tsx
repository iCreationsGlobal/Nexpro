"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  clearAuth,
  getMarketerSession,
  updateMarketerProfile,
  type Marketer,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AccountPage() {
  const router = useRouter();
  const [marketer, setMarketer] = useState<Marketer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [momoNumber, setMomoNumber] = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMarketerSession()
      .then((me) => {
        setMarketer(me.data.marketer);
        setName(me.data.marketer.name || "");
        setPhone(me.data.marketer.phone || "");
        setMomoNumber(me.data.marketer.momoNumber || "");
        setBankDetails(me.data.marketer.bankDetails || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await updateMarketerProfile({
        name: name.trim(),
        phone: phone.trim() || undefined,
        momoNumber: momoNumber.trim() || undefined,
        bankDetails: bankDetails.trim() || undefined,
      });
      setMarketer(res.data.marketer);
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account</h1>
        <p className="text-sm text-slate-500">{marketer?.email}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Profile</h2>
        <div className="mt-3 grid gap-2">
          <label className="text-sm text-slate-600">
            Full name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm text-slate-600">
            Phone (optional)
            <Input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Payment method</h2>
        <p className="mt-1 text-sm text-slate-500">
          Shown to businesses so they can pay your cashouts outside ABS.
        </p>
        <div className="mt-3 grid gap-2">
          <label className="text-sm text-slate-600">
            MoMo number
            <Input
              className="mt-1"
              value={momoNumber}
              onChange={(e) => setMomoNumber(e.target.value)}
              placeholder="0555155972"
            />
          </label>
          <label className="text-sm text-slate-600">
            Bank details (optional)
            <Input
              className="mt-1"
              value={bankDetails}
              onChange={(e) => setBankDetails(e.target.value)}
              placeholder="Bank · account name · number"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="outline" onClick={() => { clearAuth(); router.replace("/login"); }}>
          Sign out
        </Button>
        {message ? <p className="text-sm text-slate-500">{message}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/activities" className="text-[var(--sabito-green)]">
          All activities
        </Link>
        <Link href="/help" className="text-[var(--sabito-green)]">
          Help & support
        </Link>
      </div>
    </div>
  );
}
