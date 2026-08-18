import { API_BASE_URL } from '@/utils/apiBaseUrl';

export const formatCurrency = (amount: number | string, currency = 'GHS') => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} 0.00`;
  return `${currency} ${value.toFixed(2)}`;
};

export const resolveImageUrl = (path?: string | null) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

export const clampQuantity = (value: number) => Math.min(Math.max(1, Math.floor(value || 1)), 100);
