import { useSyncExternalStore } from 'react';

/**
 * Products per row on an Online Store, chosen by the store owner (settings metadata.productGrid).
 * Same rules as Backend/utils/productGrid.js and Frontend/src/utils/productGrid.js.
 */
export const PHONE_COLUMNS = [1, 2];
export const COMPUTER_COLUMNS = [3, 4, 5, 6];

/**
 * @param {unknown} value
 * @returns {{ phone: 1|2, computer: 3|4|5|6|null, computerCards: 'large'|'compact' }} `computer: null` keeps the template's own.
 */
export const sanitizeProductGrid = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  const phone = Number(raw.phone);
  const computer = Number(raw.computer);
  return {
    phone: PHONE_COLUMNS.includes(phone) ? phone : 2,
    computer: COMPUTER_COLUMNS.includes(computer) ? computer : null,
    computerCards: raw.computerCards === 'compact' ? 'compact' : 'large',
  };
};

// Full class names: Tailwind only keeps classes it can read in the source.
const PHONE_CLASSES = {
  1: 'grid-cols-1 gap-4 sm:grid-cols-2',
  2: 'grid-cols-2 gap-2',
};
// Five or six do not fit the narrowest computers; they start at 1280px.
const COMPUTER_CLASSES = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-4 xl:grid-cols-5',
  6: 'lg:grid-cols-4 xl:grid-cols-6',
};

/**
 * Grid classes for phones, tablets (always 3) and computers.
 * @param {ReturnType<typeof sanitizeProductGrid>} grid
 * @param {{ computerColumns: string, computerGap: string }} template - What computers use unless the owner chose a number.
 */
export const getProductGridClass = (grid, { computerColumns, computerGap }) => (
  `grid ${PHONE_CLASSES[grid.phone]} md:grid-cols-3 md:gap-3 ${computerGap} ${COMPUTER_CLASSES[grid.computer] || computerColumns}`
);

const COMPUTER_QUERY = '(min-width: 1024px)';
const subscribeToWidth = (onChange) => {
  const media = window.matchMedia(COMPUTER_QUERY);
  media.addEventListener?.('change', onChange);
  return () => media.removeEventListener?.('change', onChange);
};
const isComputerWidth = () => window.matchMedia(COMPUTER_QUERY).matches;

/**
 * Whether cards are compact (image, name, price) at the current screen width.
 * @param {ReturnType<typeof sanitizeProductGrid>|null} grid - null outside Online Stores: always the large card.
 */
export const useCompactCards = (grid) => {
  const isComputer = useSyncExternalStore(subscribeToWidth, isComputerWidth);
  if (!grid) return false;
  return isComputer ? grid.computerCards === 'compact' : grid.phone === 2;
};
