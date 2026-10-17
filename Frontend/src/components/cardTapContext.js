import { createContext } from 'react';

/**
 * Phones and tablets: each card in MobileCardView provides a tap target; ActionColumn fills it with
 * its "View" action instead of rendering a full-width button, so tapping the card opens the record
 * like the native app's lists.
 * @type {import('react').Context<{ open: (() => void) | null } | null>}
 */
export const CardTapContext = createContext(null);
