import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import evatService from '../services/evatService';
import { showError, showSuccess } from '../utils/toast';
import { QUERY_STALE } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';

/** Payload sent when a manager turns on e-VAT from the customer form. */
export const ENABLE_EVAT_FROM_CUSTOMER_FORM = {
  enabled: true,
  consentAccepted: true,
  acceptConsent: true,
};

/**
 * Unwrap the standard ABS `{ success, data }` API envelope.
 * @param {*} res
 * @returns {object|undefined}
 */
function unwrapEvatStatus(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Load GRA e-VAT status for the customer form and let managers turn it on
 * without leaving the dialog. Staff can read status so TIN fields appear
 * after a manager has enabled e-VAT.
 *
 * @param {{ featureEnabled: boolean, tenantId?: string, isManager: boolean }} opts
 */
export function useCustomerEvat({ featureEnabled, tenantId, isManager }) {
  const queryClient = useQueryClient();
  const enabled = Boolean(featureEnabled && tenantId);
  const queryKey = queryKeys.evat.status(tenantId);

  const query = useQuery({
    queryKey,
    queryFn: async () => unwrapEvatStatus(await evatService.getStatus()),
    enabled,
    staleTime: QUERY_STALE.METADATA,
    retry: false,
  });

  const enableMutation = useMutation({
    mutationFn: () => evatService.updateSettings(ENABLE_EVAT_FROM_CUSTOMER_FORM),
    onSuccess: (res) => {
      queryClient.setQueryData(queryKey, unwrapEvatStatus(res));
      showSuccess('e-VAT is on. You can add buyer TIN on this customer.');
    },
    onError: (error) => {
      showError(error, 'Could not turn on e-VAT');
    },
  });

  const mutateEnable = enableMutation.mutate;
  const turnOn = useCallback(() => {
    if (!isManager) return;
    mutateEnable();
  }, [isManager, mutateEnable]);

  return {
    featureEnabled: Boolean(featureEnabled),
    evatEnabled: query.data?.enabled === true,
    isLoading: Boolean(enabled && query.isLoading),
    isManager: Boolean(isManager),
    turnOn,
    turningOn: enableMutation.isPending,
  };
}
