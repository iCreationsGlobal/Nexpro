import api from './api';

/**
 * api interceptor already returns response body `{ success, data }` — return it as-is
 * so callers can use `response.data` (same pattern as settingsService).
 *
 * @returns {Promise<{ success: boolean, data: { email: { available: boolean }, sms: { available: boolean }, whatsapp: { available: boolean } } }>}
 */
export async function getCapabilities() {
  return api.get('/marketing/capabilities');
}

export async function getOverview() {
  return api.get('/marketing/overview');
}

/**
 * @param {{ activeOnly?: boolean }} params
 */
export async function getPreview(params = {}) {
  return api.get('/marketing/preview', { params });
}

/**
 * @param {Object} body - broadcast payload (channels, dryRun, email/sms/whatsapp fields)
 */
export async function postBroadcast(body) {
  return api.post('/marketing/broadcast', body);
}

/**
 * @param {{ status?: string, page?: number, limit?: number }} params
 * @returns {Promise<{ success: boolean, data: { campaigns: Array, total: number, totalPages: number, currentPage: number, limit: number, offset: number } }>}
 */
export async function listCampaigns(params = {}) {
  return api.get('/marketing/campaigns', { params });
}

export async function getCampaign(id) {
  return api.get(`/marketing/campaigns/${id}`);
}

export async function createCampaign(body) {
  return api.post('/marketing/campaigns', body);
}

export async function updateCampaign(id, body) {
  return api.put(`/marketing/campaigns/${id}`, body);
}

export async function sendCampaign(id, body = {}) {
  return api.post(`/marketing/campaigns/${id}/send`, body);
}

export async function scheduleCampaign(id, body) {
  return api.post(`/marketing/campaigns/${id}/schedule`, body);
}

/**
 * Per-recipient send log. @param {{ status?: string, channel?: string, page?: number, limit?: number }} params
 */
export async function getCampaignRecipients(id, params = {}) {
  return api.get(`/marketing/campaigns/${id}/recipients`, { params });
}

export async function retryFailedRecipients(id) {
  return api.post(`/marketing/campaigns/${id}/retry-failed`);
}

export default {
  getCapabilities,
  getOverview,
  getPreview,
  postBroadcast,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  sendCampaign,
  scheduleCampaign,
  getCampaignRecipients,
  retryFailedRecipients,
};
