import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants';

/**
 * Whether the dashboard's "what matters most to you" nudge has already been shown/dismissed
 * on this device. Separate from the server-side focusAreas preference so a user who dismisses
 * without picking anything isn't nagged every launch.
 */
export async function hasSeenFocusAreaPrompt(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.FOCUS_AREA_PROMPT_SEEN);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markFocusAreaPromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FOCUS_AREA_PROMPT_SEEN, 'true');
  } catch {
    // best-effort — a re-shown prompt next launch is not harmful
  }
}
