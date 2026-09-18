"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { useStoredToken } from "@/lib/browserState";
import { cn } from "@/lib/utils";

const MARKETING_NAV = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/businesses", label: "Businesses" },
  { href: "/how-it-works#for-marketers", label: "Marketers" },
  { href: "/ai-match", label: "Partner search" },
];

export function Header() {
  const pathname = usePathname();
  const loggedIn = Boolean(useStoredToken());
  const [openPath, setOpenPath] = useState<string | null>(null);
  const mobileOpen = openPath === pathname;
  const setMobileOpen = (open: boolean) => setOpenPath(open ? pathname : null);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-brand-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition",
                  isActive(item.href)
                    ? "bg-[var(--sabito-mint)] font-semibold text-[var(--sabito-green)]"
                    : "text-brand-600 hover:text-brand-900"
                )}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center md:flex">
          <Link href={loggedIn ? "/dashboard" : "/login"}>
            <Button>{loggedIn ? "Account" : "Login"}</Button>
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span className="sr-only">Menu</span>
          <div className="space-y-1.5">
            <span
              className={cn(
                "block h-0.5 w-5 bg-brand-800 transition",
                mobileOpen && "tranbrand-y-2 rotate-45"
              )}
            />
            <span className={cn("block h-0.5 w-5 bg-brand-800", mobileOpen && "opacity-0")} />
            <span
              className={cn(
                "block h-0.5 w-5 bg-brand-800 transition",
                mobileOpen && "-tranbrand-y-2 -rotate-45"
              )}
            />
          </div>
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-brand-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm",
                  isActive(item.href)
                    ? "bg-[var(--sabito-mint)] font-semibold text-[var(--sabito-green)]"
                    : "text-brand-700"
                )}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/commission-guide" className="rounded-lg px-3 py-2.5 text-sm text-brand-700">
              Commission guide
            </Link>
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Link href={loggedIn ? "/dashboard" : "/login"} onClick={() => setMobileOpen(false)}>
              <Button className="w-full">{loggedIn ? "Account" : "Login"}</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
