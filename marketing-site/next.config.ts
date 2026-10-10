import type { NextConfig } from "next";

/**
 * ABS Online Store lives on the Vite storefront project, not this Next marketing app.
 * www.absghana.com serves marketing — /shop/:slug must leave this host.
 *
 * Prefer NEXT_PUBLIC_ONLINE_STORE_URL=https://store.absghana.com (attached to the
 * storefront Vercel project). Fallback matches that host when env is unset.
 *
 * Use redirects (not rewrites): proxying SPA HTML breaks relative /assets/* on this host,
 * and /login|/signup here already redirect to the ABS dashboard.
 *
 * Guard: if store.absghana.com is accidentally attached to this marketing project,
 * skip /shop|/template redirects when the request Host is already the store origin —
 * otherwise Location points at the same URL and browsers loop on HTTP 307.
 */
const ONLINE_STORE_FALLBACK = "https://store.absghana.com";

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, "");
}

function onlineStoreOrigin(): string {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_ONLINE_STORE_URL || "");
  const site = normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.absghana.com",
  );
  if (configured && configured !== site) return configured;
  return ONLINE_STORE_FALLBACK;
}

function hostFromOrigin(origin: string): string | null {
  try {
    const host = new URL(origin).host;
    return host || null;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    const appUrl = normalizeOrigin(
      process.env.NEXT_PUBLIC_APP_URL || "https://myapp.africanbusinesssuite.com",
    );
    const storeUrl = onlineStoreOrigin();
    const storeHost = hostFromOrigin(storeUrl);
    /** Skip when Host already is the Online Store — prevents self-redirect loops. */
    const notOnStoreHost = storeHost
      ? ([{ type: "host" as const, value: storeHost }] as const)
      : undefined;

    const toStore = (
      source: string,
      destination: string,
    ): {
      source: string;
      destination: string;
      permanent: false;
      missing?: { type: "host"; value: string }[];
    } => ({
      source,
      destination,
      permanent: false,
      ...(notOnStoreHost ? { missing: [...notOnStoreHost] } : {}),
    });

    return [
      { source: "/signup", destination: `${appUrl}/signup`, permanent: false },
      { source: "/login", destination: `${appUrl}/login`, permanent: false },
      // Live Online Store + legacy ABS template path → storefront project
      toStore("/shop", `${storeUrl}/shop`),
      toStore("/shop/:path*", `${storeUrl}/shop/:path*`),
      toStore("/template", `${storeUrl}/template`),
      toStore("/template/:path*", `${storeUrl}/template/:path*`),
    ];
  },
};

export default nextConfig;
