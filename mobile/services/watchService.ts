import { api } from './api';
import { buildScopedQueryString } from '@/utils/shopScope';
import type { WatchReviewDecision } from '@/utils/watch';

type WatchParams = Record<string, string | number | boolean | undefined | null>;

async function scopedPath(path: string, params: WatchParams = {}): Promise<string> {
  const query = await buildScopedQueryString(params);
  return query ? `${path}?${query}` : path;
}

/**
 * ABS Watch — same endpoints as the web Watch page. Clip upload and person detection need disk
 * storage on the server (a shop PC), so mobile reviews incidents and summaries only.
 */
export const watchService = {
  getSummary: async (params: WatchParams = {}) => {
    const res = await api.get(await scopedPath('/watch/summary', params));
    return res.data;
  },

  listIncidents: async (params: WatchParams = {}) => {
    const res = await api.get(await scopedPath('/watch/incidents', params));
    return res.data;
  },

  reviewIncident: async (id: string, payload: { decision: WatchReviewDecision; note?: string }) => {
    const res = await api.patch(`/watch/incidents/${id}/review`, payload);
    return res.data;
  },

  /** Re-match the day's camera activity against recorded sales. */
  reconcile: async (payload: { date?: string } = {}) => {
    const res = await api.post('/watch/reconcile', payload);
    return res.data;
  },

  listCameras: async () => {
    const res = await api.get(await scopedPath('/watch/cameras'));
    return res.data;
  },
};
