/**
 * ABS Sabito marketer API — single source of truth for mobile networking.
 * Paths match docs/sabito-marketer-api.md
 */
import apiClient, { setAuthToken, getAuthToken } from '../services/apiClient';

export type Marketer = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  momoNumber?: string | null;
  bankDetails?: string | null;
};

export type MarketplaceBusiness = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  category?: string;
  location?: string;
  commissionFrom?: number;
  firstClientRatePercent?: number;
  returningClientRatePercent?: number;
  pitch?: string;
  logoUrl?: string | null;
  slotsLeft?: number;
  applicationsOpen?: boolean;
};

const unwrap = <T>(res: { data: { success?: boolean; data: T; message?: string } }): T => {
  if (res.data?.success === false) {
    throw new Error((res.data as any).message || 'Request failed');
  }
  return res.data.data;
};

export async function registerMarketer(payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}) {
  const data = unwrap<{ token: string; marketer: Marketer }>(
    await apiClient.post('/public/sabito-marketer/auth/register', payload)
  );
  await setAuthToken(data.token);
  return data;
}

export async function loginMarketer(payload: { email: string; password: string }) {
  const data = unwrap<{ token: string; marketer: Marketer }>(
    await apiClient.post('/public/sabito-marketer/auth/login', payload)
  );
  await setAuthToken(data.token);
  return data;
}

export async function getMarketerSession() {
  return unwrap<{ marketer: Marketer }>(
    await apiClient.get('/public/sabito-marketer/auth/me')
  );
}

export async function updateMarketerProfile(payload: {
  name?: string;
  phone?: string;
  momoNumber?: string;
  bankDetails?: string;
}) {
  return unwrap<{ marketer: Marketer }>(
    await apiClient.patch('/public/sabito-marketer/auth/profile', payload)
  );
}

export async function listPartners(params?: { category?: string; search?: string }) {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.search) q.set('search', params.search);
  const qs = q.toString() ? `?${q}` : '';
  return unwrap<MarketplaceBusiness[]>(
    await apiClient.get(`/public/sabito-partners${qs}`)
  );
}

export async function getPartner(slug: string) {
  return unwrap<MarketplaceBusiness>(
    await apiClient.get(`/public/sabito-partners/${encodeURIComponent(slug)}`)
  );
}

export async function applyToPartner(tenantId: string, pitch?: string) {
  return unwrap(await apiClient.post('/public/sabito-marketer/applications', { tenantId, pitch }));
}

export async function listMyApplications() {
  return unwrap<any[]>(await apiClient.get('/public/sabito-marketer/applications'));
}

export async function listMyPartnerships() {
  return unwrap<any[]>(await apiClient.get('/public/sabito-marketer/partnerships'));
}

export async function listMyEarnings(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return unwrap<any[]>(await apiClient.get(`/public/sabito-marketer/earnings${qs}`));
}

export async function getMarketerDashboard() {
  return unwrap<Record<string, any>>(await apiClient.get('/public/sabito-marketer/dashboard'));
}

export async function createReferral(payload: {
  partnershipId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  note?: string;
}) {
  return unwrap(await apiClient.post('/public/sabito-marketer/referrals', payload));
}

export async function listMyReferrals() {
  return unwrap<any[]>(await apiClient.get('/public/sabito-marketer/referrals'));
}

export async function getMyReferral(id: string) {
  return unwrap<any>(await apiClient.get(`/public/sabito-marketer/referrals/${encodeURIComponent(id)}`));
}

export async function createCashout(payload: { commissionIds: string[]; notes?: string }) {
  return unwrap(await apiClient.post('/public/sabito-marketer/cashouts', payload));
}

export async function listMyCashouts() {
  return unwrap<any[]>(await apiClient.get('/public/sabito-marketer/cashouts'));
}

export async function logoutMarketer() {
  await setAuthToken(null);
}

export { getAuthToken, setAuthToken };
