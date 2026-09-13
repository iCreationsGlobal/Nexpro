import api from './api';

const getSettings = () => api.get('/partner-program/settings');
const updateSettings = (payload) => api.put('/partner-program/settings', payload);
const getCatalog = () => api.get('/partner-program/catalog');
const listApplications = (params) => api.get('/partner-program/applications', { params });
const approveApplication = (id) => api.post(`/partner-program/applications/${id}/approve`);
const declineApplication = (id, payload) =>
  api.post(`/partner-program/applications/${id}/decline`, payload || {});
const listPartnerships = (params) => api.get('/partner-program/partnerships', { params });
const revokePartnership = (id) => api.post(`/partner-program/partnerships/${id}/revoke`);
const listCommissions = (params) => api.get('/partner-program/commissions', { params });
const markCommissionsPaid = (payload) => api.post('/partner-program/remittances', payload);
const listRemittances = (params) => api.get('/partner-program/remittances', { params });
const paySabito = (payload) => api.post('/partner-program/remittances', payload);
const listReferrals = (params) => api.get('/partner-program/referrals', { params });
const listCashouts = (params) => api.get('/partner-program/cashouts', { params });
const approveCashout = (id) => api.post(`/partner-program/cashouts/${id}/approve`);
const rejectCashout = (id, payload) => api.post(`/partner-program/cashouts/${id}/reject`, payload || {});
const markCashoutPaid = (id, payload) =>
  api.post(`/partner-program/cashouts/${id}/mark-paid`, payload || {});

const partnerProgramService = {
  getSettings,
  updateSettings,
  getCatalog,
  listApplications,
  approveApplication,
  declineApplication,
  listPartnerships,
  revokePartnership,
  listCommissions,
  markCommissionsPaid,
  listRemittances,
  paySabito,
  listReferrals,
  listCashouts,
  approveCashout,
  rejectCashout,
  markCashoutPaid,
};

export default partnerProgramService;
