import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_IBIS_CHAT_PREFERENCES,
  loadIbisChatPreferences,
  normalizeIbisChatPeriod,
  saveIbisChatPreferences,
  type IbisChatPeriodKey,
  type IbisChatPreferences,
} from '@/utils/ibisChatPreferences';

/**
 * Device-local iBIS chat preferences (default period + suggestion chips).
 */
export function useIbisChatPreferences() {
  const [prefs, setPrefs] = useState<IbisChatPreferences>(DEFAULT_IBIS_CHAT_PREFERENCES);

  useEffect(() => {
    let mounted = true;
    loadIbisChatPreferences().then((loaded) => {
      if (mounted) setPrefs(loaded);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const updatePreferences = useCallback((partial: Partial<IbisChatPreferences>) => {
    setPrefs((current) => {
      const next: IbisChatPreferences = {
        defaultPeriod: normalizeIbisChatPeriod(
          partial.defaultPeriod !== undefined ? partial.defaultPeriod : current.defaultPeriod
        ),
        showSuggestionChips:
          partial.showSuggestionChips !== undefined
            ? Boolean(partial.showSuggestionChips)
            : current.showSuggestionChips,
      };
      void saveIbisChatPreferences(next);
      return next;
    });
  }, []);

  const setDefaultPeriod = useCallback(
    (key: IbisChatPeriodKey) => updatePreferences({ defaultPeriod: key }),
    [updatePreferences]
  );

  const setShowSuggestionChips = useCallback(
    (value: boolean) => updatePreferences({ showSuggestionChips: value === true }),
    [updatePreferences]
  );

  return {
    defaultPeriod: prefs.defaultPeriod,
    showSuggestionChips: prefs.showSuggestionChips,
    setDefaultPeriod,
    setShowSuggestionChips,
  };
}
