import api from './api';

const evatService = {
  getStatus: async () => api.get('/evat/status'),
  updateSettings: async (payload) => api.put('/evat/settings', payload),
  testStamp: async () => api.post('/evat/test-stamp'),
  stamp: async (type, id) => api.post('/evat/stamp', { type, id }),
  getFilingSummary: async (startDate, endDate) =>
    api.get('/evat/filing-summary', { params: { startDate, endDate } }),
};

export default evatService;
