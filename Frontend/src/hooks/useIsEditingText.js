import { useEffect, useState } from 'react';

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** @param {EventTarget|null} element */
export function isTextEntryElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement) return !element.readOnly && !NON_TEXT_INPUT_TYPES.has(element.type);
  return false;
}

/**
 * True while a text field has focus — on phones that means the on-screen keyboard is up, so
 * bottom bars should step aside.
 * @param {boolean} [enabled]
 */
export function useIsEditingText(enabled = true) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEditing(false);
      return undefined;
    }
    const update = () => setEditing(isTextEntryElement(document.activeElement));
    const onFocusOut = () => {
      // focusout fires before focus lands on the next element.
      window.setTimeout(update, 0);
    };
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [enabled]);

  return editing;
}

export default useIsEditingText;
