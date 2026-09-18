import { api } from './api';
const base = '/integrations/google-calendar';
export const calendarService = {
  status: async () => (await api.get(`${base}/status`)).data.data,
  connect: async () => (await api.post(`${base}/connect`)).data.data,
  calendars: async () => (await api.get(`${base}/calendars`)).data.data,
  select: (calendarId: string) => api.put(`${base}/selection`, { calendarId }),
  sync: () => api.post(`${base}/sync`, {}, { timeout: 60000 }),
  disconnect: () => api.delete(`${base}/connection`),
};
