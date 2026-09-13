export const SITE_NAME = "Sabito";
export const WHATSAPP_SUPPORT = "233269056851";
export const SUPPORT_EMAIL = "support@sabito.app";

export const TOKEN_KEY = "sabito_marketer_token";

/**
 * ABS marketing site for business signup / learn more.
 * Businesses do not sign up on Sabito — they use African Business Suite.
 */
export const ABS_SITE_URL = (
  process.env.NEXT_PUBLIC_ABS_SITE_URL || "https://absghana.com"
).replace(/\/$/, "");

/** ABS app onboarding (business account creation). Falls back to marketing site. */
export const ABS_BUSINESS_SIGNUP_URL = (
  process.env.NEXT_PUBLIC_ABS_BUSINESS_SIGNUP_URL || `${ABS_SITE_URL}`
).replace(/\/$/, "");

const PRODUCTION_API_HOST = "api.africanbusinesssuite.com";

function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function originFromEnv(): string {
  const raw = (
    process.env.ABS_API_ORIGIN ||
    process.env.NEXT_PUBLIC_ABS_API_ORIGIN ||
    "http://127.0.0.1:5002"
  ).trim();
  return stripTrailingSlash(raw).replace(/\/api$/i, "");
}

/**
 * ABS API base including `/api` suffix.
 * In the browser on localhost, always use same-origin `/api` (Next proxies to the local backend).
 * NEXT_PUBLIC_ABS_API_URL to production is ignored while the app runs on localhost.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const onLocalhost =
      host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");
    const fromEnv = process.env.NEXT_PUBLIC_ABS_API_URL?.trim().replace(/\/$/, "");
    if (fromEnv && onLocalhost) {
      try {
        const envHost = new URL(
          /^https?:\/\//i.test(fromEnv) ? fromEnv : `http://${fromEnv}`
        ).hostname;
        if (envHost === PRODUCTION_API_HOST) return "/api";
      } catch {
        return "/api";
      }
    }
    if (fromEnv && !onLocalhost) return fromEnv;
    return "/api";
  }

  return `${originFromEnv()}/api`;
}

/** @deprecated use getApiBaseUrl() — kept for older imports */
export const API_BASE_URL = getApiBaseUrl();
