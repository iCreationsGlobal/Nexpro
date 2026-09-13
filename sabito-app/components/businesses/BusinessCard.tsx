import Link from "next/link";
import { MapPin } from "lucide-react";
import type { MarketplaceBusiness } from "@/lib/api";

export function BusinessCard({ business, featured = false }: { business: MarketplaceBusiness; featured?: boolean }) {
  if (featured) {
    return (
      <Link href={`/businesses/${business.slug}`} className="sabito-partner-card">
        <div className="sabito-partner-photo">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoUrl || ""} alt={business.name} loading="lazy" />
          ) : <span aria-hidden="true">{business.name.slice(0, 1)}</span>}
        </div>
        <div className="sabito-partner-details">
          <p className="sabito-partner-category">{business.category}</p>
          <h3>{business.name}</h3>
          {business.location && <p className="sabito-partner-location"><MapPin aria-hidden="true" size={18} />{business.location}</p>}
          <p className="sabito-partner-rate">Earn from {business.commissionFrom}%</p>
          {business.applicationsOpen === false && <p className="sabito-partner-closed">Applications full</p>}
        </div>
      </Link>
    );
  }
  return (
    <Link
      href={`/businesses/${business.slug}`}
      className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-[var(--sabito-green)]"
    >
      <div className="aspect-[4/3] bg-[var(--sabito-mint)]">
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logoUrl || ""}
            alt={business.name}
            className="h-full w-full object-contain p-6"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl font-bold text-[var(--sabito-green)]/40">
            {business.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="space-y-1 p-4">
        <p className="text-xs font-medium text-[var(--sabito-green)]">{business.category}</p>
        <h3 className="font-semibold text-slate-900 group-hover:text-[var(--sabito-green-dark)]">
          {business.name}
        </h3>
        <p className="text-sm text-slate-500">{business.location}</p>
        <p className="text-sm font-semibold text-slate-900">
          Commission from {business.commissionFrom}%
        </p>
        {business.applicationsOpen === false ? (
          <p className="text-xs text-[var(--sabito-orange)]">Applications full</p>
        ) : null}
      </div>
    </Link>
  );
}
