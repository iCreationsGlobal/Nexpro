import { collapseRepeatedDialCode } from '@/utils/displayPhone';

export function isPaymentCollectionConfigured(paymentCollection: unknown): boolean {
  if (!paymentCollection || typeof paymentCollection !== 'object') return false;
  const pc = paymentCollection as Record<string, unknown>;
  const settlementType = pc.settlement_type ?? pc.settlementType;
  const hasMomoDetails = Boolean(
    pc.momo_phone_masked ?? pc.momoPhone ?? pc.momo_provider ?? pc.momoProvider
  );

  const mtn = pc.mtn_collection as Record<string, unknown> | undefined;
  const hubtel = pc.hubtel_collection as Record<string, unknown> | undefined;
  const hasMerchantId = Boolean(mtn?.merchantId || mtn?.configured);
  const hasHubtel = Boolean(hubtel?.configured);

  return Boolean(
    pc.hasSubaccount === true ||
    pc.configured === true ||
    (settlementType === 'momo' && hasMomoDetails) ||
    hasMerchantId ||
    hasHubtel
  );
}

/**
 * One-line summary of where online payments settle, e.g. "MTN MoMo ****4567" or "GCB Bank ****1234".
 * Uses the masked fields from GET /settings/payment-collection; null when nothing is connected.
 */
export function describePayoutDestination(paymentCollection: unknown): string | null {
  if (!paymentCollection || typeof paymentCollection !== 'object') return null;
  const pc = paymentCollection as Record<string, unknown>;
  const settlementType = String(pc.settlement_type ?? pc.settlementType ?? '');
  if (settlementType === 'bank') {
    const bank = String(pc.bank_name ?? '').trim();
    const account = String(pc.account_number_masked ?? '').trim();
    if (!bank && !account) return null;
    return [bank || 'Bank account', account].filter(Boolean).join(' ');
  }
  const provider = String(pc.momo_provider ?? pc.momoProvider ?? '').trim();
  const phone = String(pc.momo_phone_masked ?? '').trim();
  if (!provider && !phone) return null;
  return [provider ? `${provider} MoMo` : 'Mobile Money', phone].filter(Boolean).join(' ');
}

export type DirectMomoProvider = 'MTN' | 'AIRTEL' | 'VODAFONE';

export const DIRECT_MOMO_PROVIDERS: Array<{ value: DirectMomoProvider; label: string }> = [
  { value: 'MTN', label: 'MTN Mobile Money' },
  { value: 'AIRTEL', label: 'AirtelTigo Money' },
  { value: 'VODAFONE', label: 'Telecel Cash' },
];

export function getDirectMomoProviders(paymentCollection: unknown): DirectMomoProvider[] {
  if (!isPaymentCollectionConfigured(paymentCollection)) return [];
  return DIRECT_MOMO_PROVIDERS.map((provider) => provider.value);
}

export function normalizeDirectMomoPhone(phoneNumber: string): string {
  const raw = collapseRepeatedDialCode(phoneNumber).replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+233')) return raw.slice(1);
  if (raw.startsWith('233')) return raw;
  if (raw.startsWith('0')) return `233${raw.slice(1)}`;
  if (/^\d{9}$/.test(raw)) return `233${raw}`;
  return raw.replace(/^\+/, '');
}

export function isValidDirectMomoPhone(phoneNumber: string): boolean {
  return /^233\d{9}$/.test(normalizeDirectMomoPhone(phoneNumber));
}
