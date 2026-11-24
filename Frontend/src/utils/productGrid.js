/**
 * Products per row on an Online Store, chosen by the store owner (settings metadata.productGrid).
 * Same rules as Backend/utils/productGrid.js and storefront/src/online-store/productGrid.js.
 */
export const PHONE_COLUMNS = [1, 2];
export const COMPUTER_COLUMNS = [3, 4, 5, 6];

/** What each template uses on computers unless the owner chooses a number (storefront/src/templates/registry.js). */
export const TEMPLATE_COMPUTER_COLUMNS = { classic: 4, minimal: 3, bold: 3, marketplace: 5, catalog: 2 };

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
