import { useCallback, useState } from 'react';
import {
  loadIbisChatPreferences,
  normalizeIbisChatPeriod,
  saveIbisChatPreferences,
} from '../utils/ibisChatPreferences';

/**
 * Device-local iBIS chat preferences (default period + suggestion chips).
 */
export function useIbisChatPreferences() {
  const [prefs, setPrefs] = useState(() => loadIbisChatPreferences());

  const updatePreferences = useCallback((partial) => {
    setPrefs((current) => {
      const next = {
        defaultPeriod: normalizeIbisChatPeriod(
          partial.defaultPeriod !== undefined ? partial.defaultPeriod : current.defaultPeriod
        ),
        showSuggestionChips:
          partial.showSuggestionChips !== undefined
            ? Boolean(partial.showSuggestionChips)
            : current.showSuggestionChips,
      };
      saveIbisChatPreferences(next);
      return next;
    });
  }, []);

  const setDefaultPeriod = useCallback(
    (key) => updatePreferences({ defaultPeriod: key }),
    [updatePreferences]
  );

  const setShowSuggestionChips = useCallback(
    (value) => updatePreferences({ showSuggestionChips: value === true }),
    [updatePreferences]
  );

  return {
    defaultPeriod: prefs.defaultPeriod,
    showSuggestionChips: prefs.showSuggestionChips,
    setDefaultPeriod,
    setShowSuggestionChips,
  };
}
