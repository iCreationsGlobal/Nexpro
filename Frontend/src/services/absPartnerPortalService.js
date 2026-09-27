import axios from 'axios';
import { API_BASE_URL } from './api';
const client = axios.create({
  baseURL: `${API_BASE_URL || ''}/api/abs-partners`,
  timeout: 30000
});
const KEY = 'abs-partner-session';
export const partnerSession = {
  get: () => sessionStorage.getItem(KEY),
  set: token => sessionStorage.setItem(KEY, token),
  clear: () => sessionStorage.removeItem(KEY)
};
client.interceptors.request.use(config => {
  const token = partnerSession.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default {
  login: input => client.post('/login', input).then(r => r.data.data),
  accept: input => client.post('/accept-invitation', input).then(r => r.data.data),
  overview: () => client.get('/overview').then(r => r.data.data),
  create: input => client.post('/records', input).then(r => r.data.data),
  update: (id, input) => client.patch(`/records/${id}`, input).then(r => r.data.data),
  payoutDetails: input => client.put('/payout-details', input).then(r => r.data.data),
  logout: () => client.post('/logout')
};
