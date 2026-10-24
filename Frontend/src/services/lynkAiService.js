import api from './api';
import { buildScopedQueryString } from '../utils/shopScope';

/**
 * Lynk AI inside ABS (Backend controllers/lynkAiController.js): opens a session for the signed-in owner or manager, in
 * the shop they have open, and returns Lynk's screen address (with a one-time pass) to show in a frame.
 */
const lynkAiService = {
  /**
   * @param {{ screen?: 'full'|'panel', tab?: 'ask'|'insights'|'design'|'import', page?: { path: string, title?: string, record?: { type: string, id: string } } | null }} [opts]
   * @returns {Promise<{ sessionId: string, screenUrl: string, tabs: string[] }>}
   */
  start: async ({ screen = 'full', tab = 'ask', page = null } = {}) => {
    const query = buildScopedQueryString();
    const response = await api.post(`/lynk/session${query ? `?${query}` : ''}`, { screen, tab, page, client: 'web' });
    return response?.data ?? response;
  },
};

export default lynkAiService;
