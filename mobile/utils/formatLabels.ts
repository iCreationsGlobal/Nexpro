import { BRAND_GREEN } from '@/constants/brand';

/**
 * Human-readable labels aligned with web list/detail formatting.
 */
export function formatStatusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  if (status === 'partial') return 'Partially paid';
  return status
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Sale status chip colors (web Sales.jsx parity). */
export function getSaleStatusColors(status?: string): { bg: string; text: string } {
  switch (status) {
    case 'completed':
      return { bg: '#dcfce7', text: BRAND_GREEN };
    case 'partially_paid':
      return { bg: '#fef3c7', text: '#92400e' };
    case 'pending':
      return { bg: '#fef3c7', text: '#92400e' };
    case 'cancelled':
    case 'refunded':
      return { bg: '#f3f4f6', text: '#6b7280' };
    default:
      return { bg: '#e0e7ff', text: '#3730a3' };
  }
}
