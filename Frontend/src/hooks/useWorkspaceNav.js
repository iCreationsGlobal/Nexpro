import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useBranding } from '@/context/BrandingContext';
import { useStudioLocationOptional } from '@/context/StudioLocationContext';
import { useScopedWorkspaceName } from '@/hooks/useScopedWorkspaceName';
import { useWorkspaceProfile } from '@/hooks/useWorkspaceProfile';
import { useSidebarPreferences } from '@/hooks/useSidebarPreferences';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { buildSimpleModeNav } from '@/config/simpleMode';
import { getMenuItems, getQuickActions } from '@/config/navigation';
import { filterHiddenNavItems, sanitizeHiddenSidebarKeys } from '@/constants/sidebarMenus';
import { APP_NAME, STUDIO_LIKE_TYPES } from '@/constants';
import settingsService from '@/services/settingsService';

/**
 * Line under the app title: org name for default branding; attribution when app name is white-labeled.
 * @param {string} appName - Resolved display name from branding (same as title above).
 * @param {string} organizationDisplayName - Company / workspace name from settings or tenant.
 * @returns {string} Subtitle text or empty to hide the row.
 */
export function sidebarBrandSubtitle(appName, organizationDisplayName) {
  const usingDefaultProductName =
    (appName || '').trim().toLowerCase() === String(APP_NAME || 'ABS').trim().toLowerCase();
  if (usingDefaultProductName) {
    return (organizationDisplayName || '').trim();
  }
  return 'Powered by ABS';
}

/**
 * Menu and quick actions for the signed-in member, shared by the desktop sidebar and the
 * phone/tablet app shell so both apply the same business-type, role, plan and Simple Mode rules.
 */
export function useWorkspaceNav() {
  const { isAdmin, isManager, isDriver, activeTenant, isPlatformAdmin, isSupportAccessActive } = useAuth();
  const simpleMode = useSimpleMode();
  const { kind, hasWorkspaceFeature } = useWorkspaceProfile();
  const hidePlatformAdminNav = isPlatformAdmin && !isSupportAccessActive;
  const studio = useStudioLocationOptional();

  const activeStudioType = studio?.activeLocation?.studioType || null;
  const businessType = STUDIO_LIKE_TYPES.includes(activeStudioType)
    ? activeStudioType
    : kind || null;
  const shopType =
    activeTenant?.metadata?.businessSubType ||
    activeTenant?.metadata?.shopType ||
    null;

  const { hiddenSidebarKeys: rawHiddenSidebarKeys } = useSidebarPreferences();
  const hiddenSidebarKeys = useMemo(
    () => sanitizeHiddenSidebarKeys(rawHiddenSidebarKeys, kind || null, shopType),
    [rawHiddenSidebarKeys, kind, shopType]
  );

  /** Everything the role and plan allow, before the member's hide-from-menu choices. */
  const allMenuItems = useMemo(
    () =>
      getMenuItems(
        businessType,
        isAdmin,
        isManager,
        isDriver,
        shopType,
        hasWorkspaceFeature,
        hidePlatformAdminNav
      ),
    [businessType, isAdmin, isManager, isDriver, shopType, hasWorkspaceFeature, hidePlatformAdminNav]
  );

  const menuItems = useMemo(() => {
    const visible = filterHiddenNavItems(allMenuItems, hiddenSidebarKeys);
    // Simple Mode: only the essentials, flattened out of their groups.
    return simpleMode.isRestricted ? buildSimpleModeNav(simpleMode.config, visible) : visible;
  }, [allMenuItems, hiddenSidebarKeys, simpleMode.isRestricted, simpleMode.config]);

  // Simple Mode sells from the dashboard's Sell button; no quick-action list.
  const quickActions = useMemo(
    () => (simpleMode.isRestricted ? [] : getQuickActions(businessType, shopType)),
    [businessType, shopType, simpleMode.isRestricted]
  );

  return {
    businessType,
    shopType,
    menuItems,
    allMenuItems,
    quickActions,
    simpleMode,
    hasWorkspaceFeature,
  };
}

/**
 * App name, colour and workspace name for the sidebar header and the app-shell header.
 */
export function useWorkspaceBrand() {
  const { isManager, activeTenant } = useAuth();
  const { appName, primaryColor } = useBranding();
  const { kind, isShopScoped, hasWorkspaceFeature } = useWorkspaceProfile();

  const { data: organizationData } = useQuery({
    queryKey: ['settings', 'organization'],
    queryFn: () => settingsService.getOrganizationSettings(),
    enabled: isManager && !!activeTenant?.id,
  });
  const organization = organizationData?.data ?? organizationData;
  const orgName = (organization?.name || activeTenant?.name || '').trim();
  const businessName = useScopedWorkspaceName(organization?.name, '');
  const subtitle = useMemo(
    () => sidebarBrandSubtitle(appName, businessName),
    [appName, businessName]
  );
  const showScopeSwitcher =
    isShopScoped ||
    (STUDIO_LIKE_TYPES.includes(kind) && hasWorkspaceFeature('studioLocationsModule'));

  return { appName, primaryColor, orgName, businessName, subtitle, showScopeSwitcher };
}
