import { api } from './api';
import { MAX_INLINE_IMAGE_DATA_URL_LENGTH } from '../utils/fileUtils';
import { parseJsonStrippingOversizedInlineDataUrls } from '../utils/stripOversizedInlineDataUrls';

export type ProfilePayload = {
  name?: string;
  profilePicture?: string;
  currentPassword?: string;
  password?: string;
};

/**
 * Strip oversized inline avatars from the raw JSON body before JSON.parse.
 * Axios default transform parses first — that alone can OOM RN when profilePicture is multi-MB base64.
 */
function parseProfileJsonSafely(raw: unknown): unknown {
  return parseJsonStrippingOversizedInlineDataUrls(raw);
}

const profileResponseTransform = {
  transformResponse: [parseProfileJsonSafely],
};

/**
 * Drop oversized inline avatars before React Query / screen state hold them.
 */
function sanitizeProfileResponse<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const picture = data.profilePicture;
  if (
    typeof picture === 'string' &&
    picture.startsWith('data:') &&
    picture.length > MAX_INLINE_IMAGE_DATA_URL_LENGTH
  ) {
    data.profilePicture = '';
  }
  return payload;
}

const extensionForMimeType = (mimeType: string) => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('heic')) return 'heic';
  if (mimeType.includes('heif')) return 'heif';
  return 'jpg';
};

export const settingsService = {
  getOrganizationSettings: async () => {
    const res = await api.get('/settings/organization');
    return res?.data?.data ?? res?.data ?? res;
  },

  getPaymentCollectionSettings: async () => {
    const res = await api.get('/settings/payment-collection');
    return res?.data?.data ?? res?.data ?? res;
  },

  updatePaymentCollectionSettings: async (payload: Record<string, unknown>) => {
    const res = await api.put('/settings/payment-collection', payload);
    return res?.data?.data ?? res?.data ?? res;
  },

  verifyPaymentCollectionPassword: async (password: string) => {
    const res = await api.post('/settings/payment-collection/verify-password', { password });
    return res?.data ?? res;
  },

  sendPaymentCollectionOtp: async () => {
    const res = await api.post('/settings/payment-collection/send-otp', {});
    return res?.data ?? res;
  },

  verifyPaymentCollectionOtp: async (otp: string) => {
    const res = await api.post('/settings/payment-collection/verify-otp', { otp });
    return res?.data ?? res;
  },

  uploadOrganizationLogo: async (uri: string, mimeType = 'image/jpeg', fileName?: string | null) => {
    const formData = new FormData();
    const ext = extensionForMimeType(mimeType);
    formData.append('file', {
      uri,
      name: fileName || `logo.${ext}`,
      type: mimeType,
    } as unknown as Blob);
    const res = await api.post('/settings/organization/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return res?.data?.data ?? res?.data ?? res;
  },

  updateOrganizationSettings: async (payload: Record<string, unknown>) => {
    const res = await api.put('/settings/organization', payload);
    return res?.data?.data ?? res?.data ?? res;
  },

  getCustomerSources: async () => {
    const res = await api.get('/settings/customer-sources');
    const data = res?.data?.data ?? res?.data ?? [];
    return Array.isArray(data) ? data : [];
  },

  getLeadSources: async () => {
    const res = await api.get('/settings/lead-sources');
    const data = res?.data?.data ?? res?.data ?? [];
    return Array.isArray(data) ? data : [];
  },

  getProfile: async () => {
    const res = await api.get('/settings/profile', profileResponseTransform);
    return sanitizeProfileResponse(res.data);
  },

  updateProfile: async (payload: ProfilePayload) => {
    const res = await api.put('/settings/profile', payload, profileResponseTransform);
    return sanitizeProfileResponse(res.data);
  },

  /**
   * Upload profile avatar (multipart) — same contract as web POST /settings/profile/avatar.
   * Backend stores a public /uploads/... path (or a small data URL on serverless) and returns { success, data: user }.
   */
  uploadProfilePicture: async (uri: string, mimeType = 'image/jpeg', fileName?: string | null) => {
    const safeMime =
      typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const ext = extensionForMimeType(safeMime);
    const safeName =
      (fileName && String(fileName).trim()) || `avatar.${ext}`;
    const formData = new FormData();
    // React Native FormData file shape (not a web Blob).
    formData.append('file', {
      uri,
      name: safeName.includes('.') ? safeName : `${safeName}.${ext}`,
      type: safeMime,
    } as unknown as Blob);
    // Must override axios default application/json or multer never sees the file.
    const res = await api.post('/settings/profile/avatar', formData, {
      ...profileResponseTransform,
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return sanitizeProfileResponse(res.data);
  },

  requestDataDeletion: async (payload: { reason?: string } = {}) => {
    const res = await api.post('/settings/data-deletion-request', payload);
    return res.data;
  },

  getPOSConfig: async () => {
    const res = await api.get('/settings/pos-config');
    return res?.data?.data ?? res?.data ?? res;
  },
};
