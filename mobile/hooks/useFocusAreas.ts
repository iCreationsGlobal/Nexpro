import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { settingsService } from '@/services/settings';
import { sanitizeFocusAreaIds, type FocusAreaId } from '@/constants/focusAreas';
import { QUERY_STALE } from '@/utils/queryInvalidation';

const FOCUS_AREAS_QUERY_KEY = ['settings', 'focus-areas'] as const;

/**
 * Per-user "what matters most to you" focus-area picks for the active workspace.
 * Drives Quick Actions order, the "Pinned for you" section in More, and the flexible tab-bar slot.
 */
export function useFocusAreas() {
  const queryClient = useQueryClient();
  const { activeTenantId, activeTenant, hasFeature } = useAuth();
  const businessType = activeTenant?.businessType;

  const { data, isLoading } = useQuery({
    queryKey: [...FOCUS_AREAS_QUERY_KEY, activeTenantId],
    queryFn: () => settingsService.getFocusAreas(),
    enabled: !!activeTenantId,
    staleTime: QUERY_STALE.METADATA,
  });

  const focusAreas = sanitizeFocusAreaIds(data?.focusAreas, businessType, hasFeature);
  const hasChosen = data?.source === 'user';

  const mutation = useMutation({
    mutationFn: (next: FocusAreaId[]) => settingsService.updateFocusAreas(next),
    onSuccess: (result) => {
      queryClient.setQueryData([...FOCUS_AREAS_QUERY_KEY, activeTenantId], result);
    },
  });

  const save = useCallback(
    (next: FocusAreaId[]) => mutation.mutateAsync(next),
    [mutation]
  );

  return {
    focusAreas,
    hasChosen,
    isLoading,
    save,
    isSaving: mutation.isPending,
  };
}
