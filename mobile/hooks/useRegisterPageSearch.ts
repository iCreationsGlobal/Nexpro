import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

import { useSmartSearch, type PageSearchConfig } from '@/context/SmartSearchContext';

/**
 * Register header search scope/placeholder while a screen is focused (web parity).
 */
export function useRegisterPageSearch(config: PageSearchConfig | null) {
  const { setPageSearchConfig } = useSmartSearch();

  useFocusEffect(
    useCallback(() => {
      setPageSearchConfig(config);
      return () => setPageSearchConfig(null);
    }, [
      setPageSearchConfig,
      config?.scope,
      config?.placeholder,
      config?.enabled,
      config?.title,
      config?.subtitle,
      config?.scan,
    ])
  );
}
