import api from './api';
const base = '/integrations/google-calendar';
export const calendarService = {
  status: () => api.get(`${base}/status`).then(r => r.data),
  connect: () => api.post(`${base}/connect`).then(r => r.data),
  calendars: () => api.get(`${base}/calendars`).then(r => r.data),
  select: calendarId => api.put(`${base}/selection`, { calendarId }),
  sync: () => api.post(`${base}/sync`, {}, { timeout: 60000 }),
  disconnect: () => api.delete(`${base}/connection`),
};
