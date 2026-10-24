import { api } from './api';
import { buildScopedQueryString } from '@/utils/shopScope';

export type LynkPage = { path: string; title?: string; record?: { type: string; id: string } };

/**
 * Lynk AI inside ABS (Backend controllers/lynkAiController.js): opens a session for the signed-in owner or manager,
 * in the shop they have open, with links for the phone app; returns Lynk's screen address (with a one-time pass).
 */
export const lynkAiService = {
  start: async (opts: { tab?: 'ask' | 'insights' | 'design' | 'import'; page?: LynkPage | null } = {}): Promise<{ sessionId: string; screenUrl: string }> => {
    const query = await buildScopedQueryString();
    const res = await api.post(query ? `/lynk/session?${query}` : '/lynk/session', { screen: 'full', tab: opts.tab ?? 'ask', page: opts.page ?? null, client: 'app' });
    return res.data;
  },
};

const RECORD = /^\/(invoice|sale|customer|product|quote|job|expense)\/([^/?#]+)/;

/** The screen they came from, as Lynk AI should know it ("this invoice" on /invoice/abc). */
export function pageFromPath(path: string | null | undefined): LynkPage | null {
  if (!path || !path.startsWith('/')) return null;
  const match = path.match(RECORD);
  return { path: path.slice(0, 300), ...(match ? { record: { type: match[1], id: decodeURIComponent(match[2]) } } : {}) };
}
