/**
 * Products per row on an Online Store, chosen by the store owner (settings metadata.productGrid).
 * Same rules as storefront/src/online-store/productGrid.js and Frontend/src/utils/productGrid.js.
 */
const PHONE_COLUMNS = [1, 2];
const COMPUTER_COLUMNS = [3, 4, 5, 6];

/**
 * @param {unknown} value
 * @returns {{ phone: 1|2, computer: 3|4|5|6|null, computerCards: 'large'|'compact' }} `computer: null` keeps the template's own.
 */
const sanitizeProductGrid = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  const phone = Number(raw.phone);
  const computer = Number(raw.computer);
  return {
    phone: PHONE_COLUMNS.includes(phone) ? phone : 2,
    computer: COMPUTER_COLUMNS.includes(computer) ? computer : null,
    computerCards: raw.computerCards === 'compact' ? 'compact' : 'large',
  };
};

module.exports = { COMPUTER_COLUMNS, PHONE_COLUMNS, sanitizeProductGrid };
