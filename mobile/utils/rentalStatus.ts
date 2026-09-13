import {
  RENTAL_CHECKOUTABLE_STATUSES,
  RENTAL_OPEN_STATUSES,
  RENTAL_RETURNABLE_STATUSES,
  RENTAL_STATUS_LABELS,
  RENTAL_STATUSES,
} from '@/constants';
import type { RentalRow } from '@/services/rentalService';

export type RentalListFilter = 'active' | 'overdue' | 'due_today';

export const RENTAL_LIST_FILTERS: { value: RentalListFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_today', label: 'Due today' },
];

export const DAMAGE_TYPE_OPTIONS = [
  { value: 'scratch', label: 'Scratch' },
  { value: 'dent', label: 'Dent' },
  { value: 'broken', label: 'Broken' },
  { value: 'lost', label: 'Lost' },
  { value: 'stained', label: 'Stained' },
  { value: 'other', label: 'Other' },
] as const;

export const DAMAGE_SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
] as const;

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeIsoDate(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function isDateAfterToday(dateStr?: string | null): boolean {
  const normalized = normalizeIsoDate(dateStr);
  if (!normalized) return false;
  return normalized > getTodayIsoDate();
}

export function getRentalStatusLabel(status?: string | null): string {
  if (!status) return RENTAL_STATUS_LABELS[RENTAL_STATUSES.PENDING];
  return RENTAL_STATUS_LABELS[status] || status.replace(/_/g, ' ');
}

export function getRentalStatusColors(status?: string | null): { bg: string; text: string; border: string } {
  switch (status) {
    case RENTAL_STATUSES.CONFIRMED:
      return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' };
    case RENTAL_STATUSES.ACTIVE:
      return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
    case RENTAL_STATUSES.OVERDUE:
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
    case RENTAL_STATUSES.RETURNED:
    case RENTAL_STATUSES.COMPLETED:
      return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
    case RENTAL_STATUSES.CANCELLED:
      return { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
    default:
      return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
  }
}

export function isRentalCheckoutEligible(rental: RentalRow | null | undefined, isManager: boolean): boolean {
  if (!rental?.status || !RENTAL_CHECKOUTABLE_STATUSES.includes(rental.status as (typeof RENTAL_CHECKOUTABLE_STATUSES)[number])) {
    return false;
  }
  return !isDateAfterToday(rental.startDate) || isManager;
}

export function isRentalReturnable(rental: RentalRow | null | undefined): boolean {
  return !!rental?.status && RENTAL_RETURNABLE_STATUSES.includes(rental.status as (typeof RENTAL_RETURNABLE_STATUSES)[number]);
}

export function isRentalOpen(rental: RentalRow | null | undefined): boolean {
  return !!rental?.status && RENTAL_OPEN_STATUSES.includes(rental.status as (typeof RENTAL_OPEN_STATUSES)[number]);
}

export function isRentalDueToday(rental: RentalRow): boolean {
  const endDate = normalizeIsoDate(rental.endDate);
  if (!endDate || endDate !== getTodayIsoDate()) return false;
  return ['confirmed', 'active', 'overdue'].includes(rental.status || '');
}

export function getRentalReference(rental: RentalRow): string {
  return rental.rentalNumber || rental.id.slice(0, 8).toUpperCase();
}

export function getRentalCustomerLabel(rental: RentalRow): string {
  return rental.customer?.name || 'Customer';
}

export function getRentalItemsSummary(rental: RentalRow): string {
  const items = rental.items || [];
  if (!items.length) return 'No items';
  const first = items[0]?.product?.name || 'Item';
  if (items.length === 1) return first;
  return `${first} +${items.length - 1} more`;
}

export function matchesRentalSearch(rental: RentalRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const blob = [
    rental.rentalNumber,
    rental.id,
    rental.customer?.name,
    rental.customer?.phone,
    rental.customer?.email,
    ...(rental.items || []).map((item) => item.product?.name),
    ...(rental.items || []).map((item) => item.product?.sku),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return blob.includes(q);
}
