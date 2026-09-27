import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSimpleModeConfig } from '../config/simpleMode';
import { getSimpleModeShowAdvanced } from '../utils/interfaceMode';

/**
 * Simple Mode state for the signed-in member.
 * - isSimple: member chose Simple Mode and their business type supports it
 * - showAdvanced: member brought the full menu back (Settings)
 * - isRestricted: menu/pages are trimmed to the Simple Mode set
 */
export function useSimpleMode() {
  const { interfaceMode, activeMembership, activeTenant, isDriver } = useAuth();
  return useMemo(() => {
    const config = getSimpleModeConfig(activeTenant?.businessType);
    const isSimple = interfaceMode === 'simple' && !isDriver && Boolean(config);
    const showAdvanced = getSimpleModeShowAdvanced(activeMembership);
    return {
      config,
      isSimple,
      showAdvanced,
      isRestricted: isSimple && !showAdvanced,
    };
  }, [interfaceMode, activeMembership, activeTenant?.businessType, isDriver]);
}

export default useSimpleMode;
