"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getStoredToken } from "@/lib/api";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFab } from "@/components/ui/WhatsAppFab";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => { setSignedIn(Boolean(getStoredToken())); }, [pathname]);
  const businessPage = pathname === "/businesses" || pathname.startsWith("/businesses/");
  if (businessPage && signedIn === null) return <p className="workspace-loading">Loading…</p>;
  if (businessPage && signedIn) return <DashboardShell>{children}</DashboardShell>;
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
      <WhatsAppFab />
    </>
  );
}
