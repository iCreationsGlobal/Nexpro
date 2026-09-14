"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Building2, Send, Wallet, UserRound, ArrowLeft, Menu, X, History, LifeBuoy } from "lucide-react";
import { useStoredToken } from "@/lib/browserState";
import { Logo } from "@/components/ui/Logo";
import { getMarketerSession, clearAuth, ApiError } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/businesses", label: "Businesses", icon: Building2 },
  { href: "/referrals", label: "Referrals", icon: Send },
  { href: "/earnings", label: "Earnings", icon: Wallet },
  { href: "/account", label: "Account", icon: UserRound },
  { href: "/activities", label: "Activity", icon: History },
  { href: "/help", label: "Help & support", icon: LifeBuoy },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const token = useStoredToken();
  const [validatedToken, setValidatedToken] = useState<string | null>(null);
  const ready = Boolean(token && token === validatedToken);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/") || (href === "/earnings" && pathname === "/cashout");
  const title = links.find((link) => active(link.href))?.label || "Your workspace";

  useEffect(() => {
    let cancelled = false;
    const login = () => router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (token === undefined) return;
    if (!token) { login(); return; }
    getMarketerSession().then(({ data }) => {
      if (!cancelled) { setName(data.marketer.name); setValidatedToken(token); }
    }).catch((err) => {
      if (cancelled) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) { setValidatedToken(null); clearAuth(); login(); }
      else setError("We couldn't load your account. Please try again.");
    });
    return () => { cancelled = true; };
  }, [pathname, router, attempt, token]);

  useEffect(() => { drawer.current?.close(); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.showModal();
    const resize = () => { if (window.innerWidth >= 1024) { drawer.current?.close(); setOpen(false); } };
    window.addEventListener("resize", resize);
    return () => { document.body.style.overflow = previous; window.removeEventListener("resize", resize); };
  }, [open]);

  const navigation = <>
    <div className="workspace-brand"><Logo light /><span>MARKETER WORKSPACE</span></div>
    <nav aria-label="Dashboard">{links.map(({ href, label, icon: Icon }) => (
      <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={active(href) ? "is-active" : ""} onClick={() => { drawer.current?.close(); setOpen(false); }}><Icon size={20} aria-hidden="true" />{label}</Link>
    ))}</nav>
    <div className="workspace-sidebar-bottom"><Link href="/"><ArrowLeft size={18} aria-hidden="true" />Back to website</Link><p>Connect. Refer. Earn.</p></div>
  </>;

  if (!ready) return <div className="workspace-loading" role="status">{error ? <><p>{error}</p><button className="workspace-action" onClick={() => { setError(""); setAttempt(a => a + 1); }}>Try again</button></> : "Loading your workspace…"}</div>;
  return <div className="workspace-shell">
    <a href="#workspace-main" className="workspace-skip">Skip to content</a>
    <aside className="workspace-sidebar">{navigation}</aside>
    <dialog ref={drawer} className="workspace-drawer" aria-label="Dashboard navigation" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={(event) => { if (event.target === drawer.current) drawer.current.close(); }}>
      <div className="workspace-drawer-content"><button className="workspace-drawer-close" aria-label="Close navigation" onClick={() => drawer.current?.close()}><X /></button>{navigation}</div>
    </dialog>
    <div className="workspace-body">
      <header className="workspace-header"><div><button ref={trigger} className="workspace-menu" aria-label="Open dashboard navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu /></button><span>{title}</span></div><Link href="/account" className="workspace-user"><span aria-hidden="true">{name.charAt(0).toUpperCase()}</span><span>{name || "My account"}</span></Link></header>
      <main id="workspace-main" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
