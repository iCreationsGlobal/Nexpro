import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import settingsService from '@/services/settingsService';
import { sanitizeFocusAreaIds } from '@/config/focusAreas';
import { QUERY_CACHE } from '@/constants';

/**
 * The member's ranked focus-area picks for the active workspace (chosen in the mobile app).
 * @param {object} options
 * @param {string|null} options.businessType - Resolved business type (see useWorkspaceNav)
 * @param {(key: string) => boolean} options.hasFeature
 * @param {boolean} [options.enabled]
 * @returns {{ focusAreas: string[], isLoading: boolean }}
 */
export function useFocusAreas({ businessType, hasFeature, enabled = true }) {
  const { activeTenantId, isDriver } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'focus-areas', activeTenantId],
    queryFn: () => settingsService.getFocusAreas(),
    enabled: enabled && !!activeTenantId && !isDriver,
    staleTime: QUERY_CACHE.STALE_TIME_STABLE,
  });

  const focusAreas = useMemo(
    () => sanitizeFocusAreaIds(data?.focusAreas, businessType, hasFeature),
    [data?.focusAreas, businessType, hasFeature]
  );

  return { focusAreas, isLoading };
}

export default useFocusAreas;
