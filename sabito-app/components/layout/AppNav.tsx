"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/businesses", label: "Businesses" },
  { href: "/referrals", label: "Referrals" },
  { href: "/earnings", label: "Earnings" },
  { href: "/account", label: "Account" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-brand-200 bg-white">
      <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
        {LINKS.map((link) => {
          const active =
            link.href === "/businesses"
              ? pathname.startsWith("/businesses")
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "shrink-0 border-b-2 px-3 py-3 text-sm font-medium",
                active
                  ? "border-[var(--sabito-green)] text-[var(--sabito-green)]"
                  : "border-transparent text-brand-500 hover:text-brand-800"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
