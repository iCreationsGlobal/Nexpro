/**
 * Device-local iBIS chat preferences (not the workspace Anthropic key).
 * Keys stay aligned with Frontend/src/utils/ibisChatPreferences.js.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const IBIS_CHAT_PREFS_STORAGE_KEY = 'ibisChatPreferences';

export const IBIS_CHAT_PERIOD_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
] as const;

export type IbisChatPeriodKey = (typeof IBIS_CHAT_PERIOD_OPTIONS)[number]['key'];

export type IbisChatPreferences = {
  defaultPeriod: IbisChatPeriodKey;
  showSuggestionChips: boolean;
};

export const DEFAULT_IBIS_CHAT_PREFERENCES: IbisChatPreferences = {
  defaultPeriod: 'month',
  showSuggestionChips: true,
};

const PERIOD_KEYS = new Set<string>(IBIS_CHAT_PERIOD_OPTIONS.map((option) => option.key));

export function normalizeIbisChatPeriod(value: unknown): IbisChatPeriodKey {
  return PERIOD_KEYS.has(String(value))
    ? (value as IbisChatPeriodKey)
    : DEFAULT_IBIS_CHAT_PREFERENCES.defaultPeriod;
}

export function parseIbisChatPreferences(raw: unknown): IbisChatPreferences {
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
  const record = parsed as Record<string, unknown>;
  return {
    defaultPeriod: normalizeIbisChatPeriod(record.defaultPeriod),
    showSuggestionChips: record.showSuggestionChips !== false,
  };
}

export async function loadIbisChatPreferences(): Promise<IbisChatPreferences> {
  try {
    const raw = await AsyncStorage.getItem(IBIS_CHAT_PREFS_STORAGE_KEY);
    return parseIbisChatPreferences(raw);
  } catch {
    return { ...DEFAULT_IBIS_CHAT_PREFERENCES };
  }
}

export async function saveIbisChatPreferences(prefs: IbisChatPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(
      IBIS_CHAT_PREFS_STORAGE_KEY,
      JSON.stringify(parseIbisChatPreferences(prefs))
    );
  } catch {
    /* ignore storage failures */
  }
}
