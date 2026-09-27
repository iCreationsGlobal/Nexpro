import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getSimpleModeConfig } from '@/constants/simpleMode';

/**
 * Simple Mode state for the signed-in member (mirrors Frontend/src/hooks/useSimpleMode.js).
 * - isSimple: member chose Simple Mode and their business type supports it
 * - showAdvanced: member brought the full app back (Settings)
 * - isRestricted: tabs, menu and screens are trimmed to the Simple Mode set
 */
export function useSimpleMode() {
  const { interfaceMode, simpleModeShowAdvanced, activeTenant, isDriver } = useAuth();
  return useMemo(() => {
    const config = getSimpleModeConfig(activeTenant?.businessType);
    const isSimple = interfaceMode === 'simple' && !isDriver && Boolean(config);
    return {
      config,
      isSimple,
      showAdvanced: simpleModeShowAdvanced,
      isRestricted: isSimple && !simpleModeShowAdvanced,
    };
  }, [interfaceMode, simpleModeShowAdvanced, activeTenant?.businessType, isDriver]);
}

export default useSimpleMode;
