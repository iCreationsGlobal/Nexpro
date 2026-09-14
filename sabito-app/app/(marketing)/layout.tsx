"use client";


import { usePathname } from "next/navigation";
import { useStoredToken } from "@/lib/browserState";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFab } from "@/components/ui/WhatsAppFab";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = useStoredToken();
  const signedIn = token === undefined ? null : Boolean(token);
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
