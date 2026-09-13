import api, { postFormDataWithProgress } from './api';
import { WATCH_PROCESS_TIMEOUT_MS } from '../utils/watchProcessClient';

export { WATCH_PROCESS_TIMEOUT_MS } from '../utils/watchProcessClient';

const withQuery = (path, params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
};

const watchService = {
  /**
   * @param {object} params
   * @returns {Promise}
   */
  getSummary: async (params = {}) => api.get(withQuery('/watch/summary', params)),

  /**
   * @param {object} params
   * @returns {Promise}
   */
  listIncidents: async (params = {}) => api.get(withQuery('/watch/incidents', params)),

  /**
   * @param {string} id
   * @param {{ decision: string, note?: string }} payload
   * @returns {Promise}
   */
  reviewIncident: async (id, payload) => api.patch(`/watch/incidents/${id}/review`, payload),

  /**
   * Upload a short shop clip (MP4/WebM).
   * @param {File} file
   * @returns {Promise}
   */
  uploadClip: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return postFormDataWithProgress('/watch/clips', formData, { timeout: WATCH_PROCESS_TIMEOUT_MS });
  },

  /**
   * Attach a clipReference to an existing incident.
   * @param {string} id
   * @param {{ clipReference: string }} payload
   * @returns {Promise}
   */
  attachIncidentClip: async (id, payload) => api.patch(`/watch/incidents/${id}/clip`, payload),

  /**
   * Run local person detection on an uploaded Watch clip.
   * @param {{ clipUrl: string, maxSeconds?: number }} payload
   * @returns {Promise}
   */
  processUploadedClip: async (payload) => api.post('/watch/clips/process', payload, {
    timeout: WATCH_PROCESS_TIMEOUT_MS,
    skipRetry: true,
  }),

  /**
   * Person boxes sidecar for an uploaded Watch clip.
   * @param {string} clipUrl
   * @returns {Promise}
   */
  getClipDetections: async (clipUrl) => api.get(
    withQuery('/watch/clips/detections', { clipUrl }),
    { skipRetry: true }
  ),

  /**
   * @param {{ events: object[], matchWindowMinutes?: number }} payload
   * @returns {Promise}
   */
  ingestEvents: async (payload) => api.post('/watch/events', payload),

  /**
   * @param {object} payload
   * @returns {Promise}
   */
  reconcile: async (payload = {}) => api.post('/watch/reconcile', payload),

  /**
   * @returns {Promise}
   */
  listCameras: async () => api.get('/watch/cameras'),

  /**
   * @param {object} payload
   * @returns {Promise}
   */
  createCamera: async (payload) => api.post('/watch/cameras', payload),

  /**
   * @param {string} id
   * @param {object} payload
   * @returns {Promise}
   */
  updateCamera: async (id, payload) => api.put(`/watch/cameras/${id}`, payload),
};

export default watchService;
