/**
 * Device-local iBIS chat preferences (not the workspace Anthropic key).
 * Keys stay aligned with mobile/utils/ibisChatPreferences.ts.
 */

export const IBIS_CHAT_PREFS_STORAGE_KEY = 'ibisChatPreferences';

export const IBIS_CHAT_PERIOD_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

export const DEFAULT_IBIS_CHAT_PREFERENCES = {
  defaultPeriod: 'month',
  showSuggestionChips: true,
};

const PERIOD_KEYS = new Set(IBIS_CHAT_PERIOD_OPTIONS.map((option) => option.key));

/**
 * @param {unknown} value
 * @returns {'today'|'week'|'month'}
 */
export function normalizeIbisChatPeriod(value) {
  return PERIOD_KEYS.has(value) ? value : DEFAULT_IBIS_CHAT_PREFERENCES.defaultPeriod;
}

/**
 * @param {unknown} raw
 * @returns {{ defaultPeriod: 'today'|'week'|'month', showSuggestionChips: boolean }}
 */
export function parseIbisChatPreferences(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_IBIS_CHAT_PREFERENCES };
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_IBIS_CHAT_PREFERENCES };
  }
  return {
    defaultPeriod: normalizeIbisChatPeriod(parsed.defaultPeriod),
    showSuggestionChips: parsed.showSuggestionChips !== false,
  };
}

export function loadIbisChatPreferences() {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_IBIS_CHAT_PREFERENCES };
  }
  try {
    return parseIbisChatPreferences(localStorage.getItem(IBIS_CHAT_PREFS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_IBIS_CHAT_PREFERENCES };
  }
}

/**
 * @param {{ defaultPeriod?: string, showSuggestionChips?: boolean }} prefs
 */
export function saveIbisChatPreferences(prefs) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      IBIS_CHAT_PREFS_STORAGE_KEY,
      JSON.stringify(parseIbisChatPreferences(prefs))
    );
  } catch {
    /* ignore quota / private mode */
  }
}
