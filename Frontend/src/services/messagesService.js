import api from './api';

export async function getOverview() {
  return api.get('/messages/overview');
}

export async function getHistory(params = {}) {
  return api.get('/messages/history', { params });
}

/**
 * @param {{ recipients?: string|string[], customerIds?: string[], groupId?: string, message: string, dryRun?: boolean }} body
 */
export async function composeSms(body) {
  return api.post('/messages/compose', body);
}

export async function listTemplates() {
  return api.get('/messages/templates');
}

export async function createTemplate(body) {
  return api.post('/messages/templates', body);
}

export async function updateTemplate(id, body) {
  return api.put(`/messages/templates/${id}`, body);
}

export async function deleteTemplate(id) {
  return api.delete(`/messages/templates/${id}`);
}

export async function listGroups() {
  return api.get('/messages/groups');
}

export async function createGroup(body) {
  return api.post('/messages/groups', body);
}

export async function addGroupMembers(groupId, body) {
  return api.post(`/messages/groups/${groupId}/members`, body);
}

export async function getCredits() {
  return api.get('/credits');
}

export async function listCreditPacks() {
  return api.get('/credits/packs');
}

/**
 * @param {{ packId: string, paymentMethod: 'card'|'mobile_money' }} body
 */
export async function initializeCreditPurchase(body) {
  return api.post('/credits/initialize', body);
}

export async function verifyCreditPurchase(reference) {
  return api.get(`/credits/verify/${encodeURIComponent(reference)}`);
}

export async function updateSenderId(senderId) {
  return api.put('/messages/sender-id', { senderId });
}

export async function setupBirthdayMessaging(body = {}) {
  return api.post('/messages/birthday-setup', body);
}

const messagesService = {
  getOverview,
  getHistory,
  composeSms,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listGroups,
  createGroup,
  addGroupMembers,
  getCredits,
  listCreditPacks,
  initializeCreditPurchase,
  verifyCreditPurchase,
  updateSenderId,
  setupBirthdayMessaging,
};

export default messagesService;
