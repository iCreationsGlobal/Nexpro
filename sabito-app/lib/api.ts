import { getApiBaseUrl, TOKEN_KEY } from "./constants";

export type MarketplaceBusiness = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  category: string;
  location: string;
  commissionFrom: number;
  firstClientRatePercent?: number;
  returningClientRatePercent?: number;
  pitch?: string;
  description?: string;
  logoUrl?: string | null;
  imageUrl?: string | null;
  slotsLeft?: number;
  applicationsOpen?: boolean;
  payoutNotes?: string | null;
  services?: Array<{
    id: string;
    label: string;
    firstClientRatePercent: number;
    returningClientRatePercent: number;
  }>;
};

export type Marketer = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  momoNumber?: string | null;
  bankDetails?: string | null;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "ApiError"; }
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.auth && typeof window !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const message = json?.message || json?.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return json as T;
}

export async function listPartners(params?: {
  category?: string;
  search?: string;
}): Promise<MarketplaceBusiness[]> {
  const q = new URLSearchParams();
  if (params?.category && params.category !== "All categories") {
    q.set("category", params.category);
  }
  if (params?.search) q.set("search", params.search);
  const qs = q.toString() ? `?${q}` : "";
  const json = await request<{ success: boolean; data: MarketplaceBusiness[] }>(
    `/public/sabito-partners${qs}`
  );
  return json.data || [];
}

export async function getPartner(slug: string): Promise<MarketplaceBusiness | null> {
  try {
    const json = await request<{ success: boolean; data: MarketplaceBusiness }>(
      `/public/sabito-partners/${encodeURIComponent(slug)}`
    );
    return json.data || null;
  } catch {
    return null;
  }
}

export async function registerMarketer(payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}) {
  return request<{ success: boolean; data: { token: string; marketer: Marketer } }>(
    "/public/sabito-marketer/auth/register",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function loginMarketer(payload: { email: string; password: string }) {
  return request<{ success: boolean; data: { token: string; marketer: Marketer } }>(
    "/public/sabito-marketer/auth/login",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function getMarketerSession() {
  return request<{ success: boolean; data: { marketer: Marketer } }>(
    "/public/sabito-marketer/auth/me",
    { auth: true }
  );
}

export async function applyToPartner(tenantId: string, pitch?: string) {
  return request<{ success: boolean; data: unknown }>(
    "/public/sabito-marketer/applications",
    {
      method: "POST",
      auth: true,
      body: JSON.stringify({ tenantId, pitch }),
    }
  );
}

export async function listMyApplications() {
  return request<{ success: boolean; data: unknown[] }>(
    "/public/sabito-marketer/applications",
    { auth: true }
  );
}

export async function listMyPartnerships() {
  return request<{ success: boolean; data: unknown[] }>(
    "/public/sabito-marketer/partnerships",
    { auth: true }
  );
}

export async function listMyEarnings(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ success: boolean; data: unknown[] }>(
    `/public/sabito-marketer/earnings${qs}`,
    { auth: true }
  );
}

export async function getMarketerDashboard() {
  return request<{ success: boolean; data: Record<string, unknown> }>(
    "/public/sabito-marketer/dashboard",
    { auth: true }
  );
}

export async function createReferral(payload: {
  partnershipId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  note?: string;
}) {
  return request<{ success: boolean; data: unknown }>(
    "/public/sabito-marketer/referrals",
    { method: "POST", auth: true, body: JSON.stringify(payload) }
  );
}

export async function listMyReferrals() {
  return request<{ success: boolean; data: unknown[] }>(
    "/public/sabito-marketer/referrals",
    { auth: true }
  );
}

export async function getMyReferral(id: string) {
  return request<{ success: boolean; data: unknown }>(
    `/public/sabito-marketer/referrals/${encodeURIComponent(id)}`,
    { auth: true }
  );
}

export async function createCashout(payload: { commissionIds: string[]; notes?: string }) {
  return request<{ success: boolean; data: unknown }>(
    "/public/sabito-marketer/cashouts",
    { method: "POST", auth: true, body: JSON.stringify(payload) }
  );
}

export async function listMyCashouts() {
  return request<{ success: boolean; data: unknown[] }>(
    "/public/sabito-marketer/cashouts",
    { auth: true }
  );
}

export async function updateMarketerProfile(payload: {
  name?: string;
  phone?: string;
  momoNumber?: string;
  bankDetails?: string;
}) {
  return request<{ success: boolean; data: { marketer: Marketer } }>(
    "/public/sabito-marketer/auth/profile",
    {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(payload),
    }
  );
}

export function persistAuth(token: string) {
  if (typeof window !== "undefined") { localStorage.setItem(TOKEN_KEY, token); window.dispatchEvent(new Event("sabito:auth-changed")); }
}

export function clearAuth() {
  if (typeof window !== "undefined") { localStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event("sabito:auth-changed")); }
}

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function requestPasswordReset(email: string) {
  return request<{ success: boolean; data: { message: string } }>(
    '/public/sabito-marketer/auth/forgot-password',
    { method: 'POST', body: JSON.stringify({ email }) }
  );
}

export function resetPassword(payload: { email: string; code: string; password: string }) {
  return request<{ success: boolean; data: { message: string } }>(
    '/public/sabito-marketer/auth/reset-password',
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

export function changePassword(payload: { currentPassword: string; password: string }) {
  return request<{ success: boolean; data: { message: string } }>(
    '/public/sabito-marketer/auth/change-password',
    { method: 'POST', auth: true, body: JSON.stringify(payload) }
  );
}

export function closeAccount(password: string) {
  return request<{ success: boolean; data: { message: string } }>(
    '/public/sabito-marketer/auth/account',
    { method: 'DELETE', auth: true, body: JSON.stringify({ password }) }
  );
}
