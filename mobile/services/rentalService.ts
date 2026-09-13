import { api } from './api';
import { getActiveShopIdForScope } from '@/utils/shopScope';

type RentalQueryParams = Record<string, string | number | boolean | undefined | null>;

async function withActiveBranchScope(params: RentalQueryParams = {}): Promise<RentalQueryParams> {
  const activeShopId = await getActiveShopIdForScope();
  if (!activeShopId || params.branchId) return params;
  return { ...params, branchId: activeShopId };
}

async function buildQuery(params: RentalQueryParams = {}): Promise<string> {
  const scoped = await withActiveBranchScope(params);
  const searchParams = new URLSearchParams();
  Object.entries(scoped).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.append(key, String(value));
  });
  return searchParams.toString();
}

export type RentalItemRow = {
  id: string;
  productId: string;
  quantity?: number;
  rentalRatePerDay?: number;
  subtotal?: number;
  rentalUnitId?: string | null;
  product?: { id?: string; name?: string; sku?: string | null };
  rentalUnit?: {
    id?: string;
    serialNumber?: string;
    metadata?: { plateNumber?: string | null; color?: string | null };
  } | null;
};

export type RentalCustomer = {
  id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
};

export type RentalLateCharge = {
  id: string;
  daysLate?: number;
  chargePerDay?: number;
  totalCharge?: number;
  status?: string;
  metadata?: { waiveReason?: string; waivedAt?: string };
};

export type RentalDamageReport = {
  id: string;
  rentalItemId?: string;
  damageType?: string;
  severity?: string;
  description?: string | null;
  estimatedRepairCost?: number;
  photos?: string[];
  status?: string;
};

export type RentalRow = {
  id: string;
  rentalNumber?: string | null;
  status?: string;
  startDate?: string;
  endDate?: string;
  actualReturnDate?: string | null;
  totalDue?: number;
  amountPaid?: number;
  paymentMethod?: string;
  customer?: RentalCustomer | null;
  customerId?: string;
  items?: RentalItemRow[];
  lateCharges?: RentalLateCharge[];
  damageReports?: RentalDamageReport[];
  metadata?: {
    handover?: { notes?: string | null; handedOverAt?: string | null };
    return?: { inspectionNotes?: string | null; returnedAt?: string | null };
    invoiceId?: string | null;
  };
};

export type RecordRentalPaymentPayload = {
  amount: number;
  paymentMethod?: string;
  referenceNumber?: string;
  paymentDate?: string;
  notes?: string;
};

export type ReturnPreview = {
  actualReturnDate?: string;
  rentalDurationDays?: number;
  scheduledDurationDays?: number;
  lateCharge?: {
    daysLate?: number;
    chargePerDay?: number;
    totalCharge?: number;
  };
  isLate?: boolean;
};

export type RecordDamagePayload = {
  rentalItemId: string;
  productId: string;
  damageType: string;
  severity?: string;
  description?: string | null;
  estimatedRepairCost?: number;
  photos?: string[];
};

export type CreateRentalItemPayload = {
  productId: string;
  quantity: number;
  rentalRatePerDay?: number;
};

export type CreateRentalPayload = {
  customerId: string;
  startDate: string;
  endDate: string;
  paymentMethod?: string;
  amountPaid?: number;
  discountAmount?: number;
  depositAmount?: number;
  depositPaid?: boolean;
  operationalLocation?: string;
  promisedPaymentDate?: string;
  items: CreateRentalItemPayload[];
  branchId?: string;
};

export type CheckAvailabilityPayload = {
  startDate: string;
  endDate: string;
  items: Array<{ productId: string; quantity: number }>;
  branchId?: string;
};

export const rentalService = {
  getRentals: async (params: RentalQueryParams = {}) => {
    const query = await buildQuery(params);
    const res = await api.get(query ? `/rentals?${query}` : '/rentals');
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get(`/rentals/${id}`);
    return res.data;
  },

  checkoutRental: async (
    id: string,
    payload: { handoverNotes?: string | null; unitAssignments?: Array<{ rentalItemId: string; rentalUnitId: string }> } = {}
  ) => {
    const res = await api.post(`/rentals/${id}/checkout`, payload);
    return res.data;
  },

  previewReturn: async (id: string, params: { actualReturnDate?: string } = {}) => {
    const query = await buildQuery(params);
    const res = await api.get(query ? `/rentals/${id}/return-preview?${query}` : `/rentals/${id}/return-preview`);
    return res.data;
  },

  returnRental: async (
    id: string,
    payload: { actualReturnDate?: string; inspectionNotes?: string | null } = {}
  ) => {
    const res = await api.post(`/rentals/${id}/return`, payload);
    return res.data;
  },

  recordDamage: async (id: string, payload: RecordDamagePayload) => {
    const res = await api.post(`/rentals/${id}/damage`, payload);
    return res.data;
  },

  waiveLateCharge: async (rentalId: string, chargeId: string, payload: { reason: string }) => {
    const res = await api.patch(`/rentals/${rentalId}/late-charges/${chargeId}/waive`, payload);
    return res.data;
  },

  recordPayment: async (id: string, payload: RecordRentalPaymentPayload) => {
    const res = await api.post(`/rentals/${id}/payment`, payload);
    return res.data;
  },

  createRental: async (payload: CreateRentalPayload) => {
    const activeShopId = await getActiveShopIdForScope();
    const res = await api.post('/rentals', {
      ...payload,
      branchId: payload.branchId || activeShopId || undefined,
    });
    return res.data;
  },

  checkAvailability: async (payload: CheckAvailabilityPayload) => {
    const activeShopId = await getActiveShopIdForScope();
    const res = await api.post('/rentals/availability/check', {
      ...payload,
      branchId: payload.branchId || activeShopId || undefined,
    });
    return res.data;
  },
};
