import { useCallback, useState } from 'react';

/**
 * Tracks focus for a single TextInput so its border can highlight (green) while active.
 * Compose the returned onFocus/onBlur with any handler the caller already passes.
 */
export function useFocusBorder() {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { focused, onFocus, onBlur };
}
