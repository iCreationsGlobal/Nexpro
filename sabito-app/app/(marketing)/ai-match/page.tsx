"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusinessCard } from "@/components/businesses/BusinessCard";
import { listPartners, type MarketplaceBusiness } from "@/lib/api";
import { ABS_BUSINESS_SIGNUP_URL } from "@/lib/constants";

export default function AIMatchPage() {
  const [activeTab, setActiveTab] = useState<"businesses" | "marketers">("businesses");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MarketplaceBusiness[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    if (activeTab === "marketers") {
      setResults([]);
      setMessage(
        "Marketer discovery for businesses happens inside ABS after you enable Sabito Partners and review applications. Sign up on ABS to manage partners."
      );
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const data = await listPartners({ search: query.trim() });
      setResults(data);
      if (!data.length) {
        setMessage(
          "No partner businesses matched that search yet. Browse all partners or join as a marketer to apply when they list."
        );
      }
    } catch {
      setResults([]);
      setMessage("Search temporarily unavailable. Try browsing partner businesses instead.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <section
        className="relative overflow-hidden text-white"
        style={{
          backgroundColor: "#1ca700",
          backgroundImage: "url(/brand/bg-pattern.png)",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-[#1ca700]/88" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-sm">
            <Sparkles className="h-4 w-4" />
            Search partner businesses
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            Find the right partners faster
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">
            Search by business name or keyword. Find ABS businesses that enabled Sabito Partners, then
            apply, refer by email or phone, and earn on collected payment.
          </p>

          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-white/20 bg-white p-4 text-left text-brand-900">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("businesses");
                  setResults(null);
                  setMessage(null);
                }}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${
                  activeTab === "businesses"
                    ? "bg-[var(--sabito-green)] text-white"
                    : "bg-brand-100 text-brand-600"
                }`}
              >
                Find businesses
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("marketers");
                  setResults(null);
                  setMessage(null);
                }}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${
                  activeTab === "marketers"
                    ? "bg-[var(--sabito-green)] text-white"
                    : "bg-brand-100 text-brand-600"
                }`}
              >
                Find marketers
              </button>
            </div>
            <form onSubmit={handleSearch} className="mt-3">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={3}
                placeholder={
                  activeTab === "businesses"
                    ? "Try a business name or keyword, such as printing"
                    : "Manage marketer applications in ABS"
                }
                className="w-full resize-none rounded-xl border border-brand-200 px-3 py-2 text-sm outline-none focus:border-[var(--sabito-green)]"
              />
              <div className="mt-3 flex justify-end">
                <Button type="submit" disabled={loading || !query.trim()}>
                  {loading ? "Searching…" : "Find matches"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        {message ? (
          <div className="rounded-2xl border border-dashed border-brand-300 bg-[var(--sabito-mint)] px-6 py-8 text-center">
            <p className="text-sm text-brand-700">{message}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {activeTab === "marketers" ? (
                <a href={ABS_BUSINESS_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
                  <Button>Go to ABS</Button>
                </a>
              ) : (
                <>
                  <Link href="/businesses">
                    <Button variant="outline">Browse all partners</Button>
                  </Link>
                  <Link href="/signup">
                    <Button>Join as marketer</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : null}

        {results && results.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold text-brand-900">
              Found {results.length} partner{results.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-brand-600">
              Sign up free to apply and start referring.
            </p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {results.slice(0, 8).map((b) => (
                <BusinessCard key={b.id} business={b} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/signup">
                <Button>Sign up free to connect</Button>
              </Link>
            </div>
          </>
        ) : null}

        {!results && !message ? (
          <div className="grid gap-8 md:grid-cols-3">
            {[
              ["Browse partners", "See businesses that enabled Sabito Partners on ABS.", "/businesses"],
              ["How matching works", "Email/phone first-touch attribution when customers pay.", "/how-it-works"],
              ["Set commission rates", "Guide for businesses configuring first & returning rates.", "/commission-guide"],
            ].map(([title, body, href]) => (
              <Link
                key={title}
                href={href}
                className="rounded-2xl border border-brand-200 bg-white p-6 hover:border-[var(--sabito-green)]"
              >
                <h3 className="text-lg font-semibold text-brand-900">{title}</h3>
                <p className="mt-2 text-sm text-brand-600">{body}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
