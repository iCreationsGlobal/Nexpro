/**
 * Resolve the local ABS API origin for Next.js /api proxying.
 * On localhost, ignore production hosts and probe Backend/.env PORT (5000–5010).
 */

const PRODUCTION_API_HOSTS = new Set(["api.africanbusinesssuite.com"]);
const FALLBACK_ORIGIN = "http://127.0.0.1:5002";
const PROBE_PORTS = [5002, 5001, 5000, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010];
const CACHE_MS = 8_000;

function normalizeOrigin(url: string): string {
  let value = url.trim().replace(/\/$/, "").replace(/\/api\/?$/i, "");
  if (value && !/^https?:\/\//i.test(value)) {
    const local = /^(localhost|127(?:\.\d{1,3}){3}|192\.168\.)/i.test(value);
    value = `${local ? "http" : "https"}://${value}`;
  }
  return value;
}

function envOrigin(): string {
  return normalizeOrigin(
    process.env.ABS_API_ORIGIN || process.env.NEXT_PUBLIC_ABS_API_ORIGIN || ""
  );
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.")
  );
}

function isProductionHost(origin: string): boolean {
  try {
    return PRODUCTION_API_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export async function probeAbsOrigin(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(700),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
    } | null;
    return (
      json?.success === true &&
      String(json?.message || "")
        .toLowerCase()
        .includes("running")
    );
  } catch {
    return false;
  }
}

let cache: { origin: string; at: number } | null = null;
let lastLoggedOrigin: string | null = null;

function remember(origin: string): string {
  cache = { origin, at: Date.now() };
  if (lastLoggedOrigin !== origin) {
    lastLoggedOrigin = origin;
    console.log(`[sabito-app] Proxying /api → ${origin}`);
  }
  return origin;
}

/**
 * @param options.force Re-probe even if a recent origin is cached (e.g. ECONNREFUSED).
 */
export async function resolveLocalAbsOrigin(options?: { force?: boolean }): Promise<string> {
  if (!options?.force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.origin;
  }

  const fromEnv = envOrigin();
  const isDev = process.env.NODE_ENV !== "production";

  if (!isDev) {
    return remember(fromEnv || "https://api.africanbusinesssuite.com");
  }

  if (fromEnv && !isProductionHost(fromEnv)) {
    try {
      const parsed = new URL(fromEnv);
      if (isLocalHostname(parsed.hostname) && (await probeAbsOrigin(parsed.origin))) {
        return remember(parsed.origin);
      }
      if (!isLocalHostname(parsed.hostname)) {
        return remember(parsed.origin);
      }
    } catch {
      // fall through to port scan
    }
  } else if (fromEnv && isProductionHost(fromEnv)) {
    console.warn(
      `[sabito-app] ABS_API_ORIGIN is production (${fromEnv}); probing localhost instead.`
    );
  }

  for (const port of PROBE_PORTS) {
    const origin = `http://127.0.0.1:${port}`;
    if (fromEnv && origin === fromEnv.replace(/\/$/, "")) {
      continue;
    }
    if (await probeAbsOrigin(origin)) {
      return remember(origin);
    }
  }

  // Env port may come up after Next starts — keep using it rather than production.
  const fallback =
    fromEnv && !isProductionHost(fromEnv) ? fromEnv.replace(/\/$/, "") : FALLBACK_ORIGIN;
  return remember(fallback);
}
