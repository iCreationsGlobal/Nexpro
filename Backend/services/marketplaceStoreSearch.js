const { OnlineStoreSettings } = require('../models');
const { createListingSearch } = require('../utils/listingSearch');

const searchStores = createListingSearch((store) => ({
  name: store.displayName,
  seller: store.slug,
  description: store.description,
}));

/**
 * One page of marketplace stores or studios. With a search, the best matches come first.
 * @param {{ search?: string, limit: number, offset: number }} page
 * @param {object} query - Sequelize options shared by both cases (where, attributes, include, order)
 * @returns {Promise<{ count: number, rows: object[] }>}
 */
const findMarketplaceStorePage = async ({ search, limit, offset }, query) => {
  if (!search) {
    return OnlineStoreSettings.findAndCountAll({ ...query, limit, offset, distinct: true });
  }
  const matches = searchStores(await OnlineStoreSettings.findAll(query), search);
  return { count: matches.length, rows: matches.slice(offset, offset + limit) };
};

module.exports = { findMarketplaceStorePage };
