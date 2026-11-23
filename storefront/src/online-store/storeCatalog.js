import { filterStoreListings } from './storePaths.js';

export const STORE_CATALOG_PAGE_SIZE = 24;

/** Search the complete store catalog before selecting the visible page. */
export const getStoreCatalogPage = (items, { search = '', category = '', page = 1 } = {}) => {
  const matches = filterStoreListings(items, { search, category });
  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / STORE_CATALOG_PAGE_SIZE));
  const requestedPage = Number(page);
  const currentPage = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const offset = (currentPage - 1) * STORE_CATALOG_PAGE_SIZE;

  return {
    items: matches.slice(offset, offset + STORE_CATALOG_PAGE_SIZE),
    total,
    page: currentPage,
    totalPages,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + STORE_CATALOG_PAGE_SIZE, total),
  };
};
