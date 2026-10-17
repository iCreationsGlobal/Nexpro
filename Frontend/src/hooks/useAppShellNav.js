import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceNav } from '@/hooks/useWorkspaceNav';
import { useFocusAreas } from '@/hooks/useFocusAreas';
import { buildMoreMenuSections, buildTabBarItems } from '@/config/appShellNav';

/**
 * Tab bar, More sheet and header destinations for the phone/tablet app shell.
 * @param {object} [options]
 * @param {boolean} [options.enabled] - Skip the focus-area request when the shell is not shown
 */
export function useAppShellNav({ enabled = true } = {}) {
  const { isDriver } = useAuth();
  const { businessType, menuItems, allMenuItems, simpleMode, hasWorkspaceFeature } = useWorkspaceNav();
  const { focusAreas } = useFocusAreas({
    businessType,
    hasFeature: hasWorkspaceFeature,
    enabled: enabled && !simpleMode.isRestricted,
  });

  const tabItems = useMemo(
    () =>
      buildTabBarItems({
        businessType,
        isDriver,
        simpleMode,
        allMenuItems,
        menuItems,
        hasFeature: hasWorkspaceFeature,
        focusAreas,
      }),
    [businessType, isDriver, simpleMode, allMenuItems, menuItems, hasWorkspaceFeature, focusAreas]
  );

  const moreSections = useMemo(
    () => buildMoreMenuSections({ menuItems, tabItems, isDriver, simpleMode }),
    [menuItems, tabItems, isDriver, simpleMode]
  );

  /** Root destinations for the header (Account pages get a back button, like native stack pages). */
  const destinations = useMemo(
    () => [
      ...tabItems.filter((item) => item.to && !item.center),
      ...moreSections.filter((section) => section.id !== 'account').flatMap((section) => section.items),
    ],
    [tabItems, moreSections]
  );

  return { tabItems, moreSections, destinations, isSimpleTiles: Boolean(simpleMode.isRestricted) };
}

export default useAppShellNav;
