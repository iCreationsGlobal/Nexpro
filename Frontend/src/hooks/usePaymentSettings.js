/**
 * Shared payment / notification settings queries (POS + payment banner).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import settingsService from '../services/settingsService';
import { QUERY_CACHE } from '../constants';

export function getPaymentCollectionPayload(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.data != null && (raw.success === true || raw.success === 'true')) return raw.data;
  return raw;
}

export function isPaymentConfigured(pc) {
  if (!pc || typeof pc !== 'object') return false;
  const settlementType = pc.settlement_type ?? pc.settlementType;
  const isMomo = settlementType === 'momo';
  const hasMomoDetails = Boolean(pc.momo_phone_masked ?? pc.momoPhone ?? pc.momo_provider ?? pc.momoProvider);
  const hasMerchantId = Boolean(pc.mtn_collection?.merchantId || pc.mtn_collection?.configured);
  const hasHubtel = Boolean(pc.hubtel_collection?.configured);
  return Boolean(
    pc.hasSubaccount === true ||
    pc.configured === true ||
    (isMomo && hasMomoDetails) ||
    hasMerchantId ||
    hasHubtel
  );
}

/**
 * @param {Object} [queryOptions] - Optional React Query options shared by each settings query.
 * @returns {{ paymentCollectionConfigured: boolean, onlinePaymentRequired: boolean, isLoading: boolean }}
 */
export function usePaymentSettings(queryOptions = {}) {
  const { activeTenant, activeTenantId } = useAuth();
  const tenantId = activeTenantId || activeTenant?.id;
  const enabled = !!tenantId;

  const { data: notificationChannelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ['settings', 'notification-channels', tenantId],
    queryFn: settingsService.getNotificationChannels,
    staleTime: QUERY_CACHE.STALE_TIME_STABLE,
    enabled,
    ...queryOptions,
  });

  const { data: quoteWorkflowData, isLoading: workflowLoading } = useQuery({
    queryKey: ['settings', 'quote-workflow', tenantId],
    queryFn: settingsService.getQuoteWorkflow,
    staleTime: QUERY_CACHE.STALE_TIME_STABLE,
    enabled,
    ...queryOptions,
  });

  const { data: paymentCollectionData, isLoading: paymentLoading } = useQuery({
    queryKey: ['settings', 'payment-collection', tenantId],
    queryFn: settingsService.getPaymentCollectionSettings,
    staleTime: QUERY_CACHE.STALE_TIME_STABLE,
    enabled,
    ...queryOptions,
  });

  const paymentCollection = useMemo(
    () => getPaymentCollectionPayload(paymentCollectionData),
    [paymentCollectionData]
  );

  const paymentCollectionConfigured = useMemo(
    () => isPaymentConfigured(paymentCollection),
    [paymentCollection]
  );

  const onlinePaymentRequired = useMemo(
    () => Boolean(notificationChannelsData?.acceptOnlinePayments === true),
    [notificationChannelsData]
  );

  return {
    paymentCollection,
    paymentCollectionConfigured,
    onlinePaymentRequired,
    isLoading: channelsLoading || workflowLoading || paymentLoading,
  };
}

export default usePaymentSettings;
