import api from './api';
import { buildScopedQueryString } from '../utils/shopScope';

/**
 * ABS on WhatsApp (Backend controllers/whatsappAssistantController.js): the signed-in owner or manager connects their
 * own WhatsApp, for the business and shop they have open. `api` answers with the body.
 */
const scoped = (path = '') => {
  const query = buildScopedQueryString();
  return `/whatsapp-assistant${path}${query ? `?${query}` : ''}`;
};
const dataOf = (body) => body?.data ?? body;

const absWhatsAppService = {
  getStatus: async () => dataOf(await api.get(scoped())),
  connect: async (pin) => dataOf(await api.post(scoped('/connect'), { pin })),
  changePin: async (pin) => dataOf(await api.put(scoped('/pin'), { pin })),
  useHere: async () => dataOf(await api.put(scoped('/here'))),
  disconnect: async () => dataOf(await api.delete(scoped())),
  /** The PIN page (no sign-in: a one-time link sent in the chat). */
  checkUnlock: async (token) => api.get(`/public/whatsapp-unlock/${encodeURIComponent(token)}`, { skipRetry: true }),
  unlock: async (token, pin) => dataOf(await api.post(`/public/whatsapp-unlock/${encodeURIComponent(token)}`, { pin })),
};

export default absWhatsAppService;
