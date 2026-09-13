/**
 * In-memory harness for rental integration tests.
 * Wires real rentalAvailabilityService against mocked Sequelize models.
 */
const { Op } = require('sequelize');

const TABLE_KEYS = {
  Product: 'products',
  Customer: 'customers',
  Rental: 'rentals',
  RentalItem: 'rentalItems',
  PreBooking: 'preBookings',
  PreBookingItem: 'preBookingItems',
  RentalExtension: 'rentalExtensions',
  LateCharge: 'lateCharges',
  Invoice: 'invoices',
  OnlineStoreSettings: 'onlineStoreSettings',
  OnlineProductListing: 'onlineProductListings',
};

const addDays = (dateStr, days) => {
  const parsed = new Date(`${dateStr}T12:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const createEmptyStore = () => ({
  products: [],
  customers: [],
  rentals: [],
  rentalItems: [],
  preBookings: [],
  preBookingItems: [],
  rentalExtensions: [],
  lateCharges: [],
  invoices: [],
  onlineStoreSettings: [],
  onlineProductListings: [],
  seq: 0,
});

const nextId = (store, prefix) => {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
};

const matchesOpValue = (recordValue, opValue) => {
  if (opValue == null || typeof opValue !== 'object') {
    return recordValue === opValue;
  }
  if (opValue[Op.in]) {
    return opValue[Op.in].includes(recordValue);
  }
  if (opValue[Op.lte] != null) {
    return recordValue <= opValue[Op.lte];
  }
  if (opValue[Op.gte] != null) {
    return recordValue >= opValue[Op.gte];
  }
  if (opValue[Op.lt] != null) {
    return recordValue < opValue[Op.lt];
  }
  if (opValue[Op.gt] != null) {
    return recordValue > opValue[Op.gt];
  }
  if (opValue[Op.ne] != null) {
    return recordValue !== opValue[Op.ne];
  }
  return recordValue === opValue;
};

const matchesWhere = (record, where = {}) => {
  if (!where || !Object.keys(where).length) return true;

  for (const [key, value] of Object.entries(where)) {
    if (key === Op.or) {
      if (!value.some((clause) => matchesWhere(record, clause))) return false;
      continue;
    }
    if (!matchesOpValue(record[key], value)) return false;
  }
  return true;
};

const resolveInclude = (record, includeSpec, getStore) => {
  const store = getStore();
  if (!includeSpec) return record;

  const specs = Array.isArray(includeSpec) ? includeSpec : [includeSpec];

  for (const spec of specs) {
    const alias = spec.as;
    const targetModel = spec.model?.name || spec.model;
    const table = TABLE_KEYS[targetModel];
    if (!table) continue;

    if (targetModel === 'Rental' && record.rentalId) {
      const rental = store.rentals.find((row) => row.id === record.rentalId);
      if (!rental || (spec.where && !matchesWhere(rental, spec.where))) {
        if (spec.required) return null;
        record[alias] = null;
        continue;
      }
      record[alias] = buildInstance(rental, 'Rental', getStore);
      continue;
    }

    if (targetModel === 'PreBooking' && record.preBookingId) {
      const preBooking = store.preBookings.find((row) => row.id === record.preBookingId);
      if (!preBooking || (spec.where && !matchesWhere(preBooking, spec.where))) {
        if (spec.required) return null;
        record[alias] = null;
        continue;
      }
      record[alias] = buildInstance(preBooking, 'PreBooking', getStore);
      continue;
    }

    if (targetModel === 'RentalItem' && record.id) {
      record[alias] = store.rentalItems
        .filter((row) => row.rentalId === record.id)
        .map((row) => buildInstance(row, 'RentalItem', getStore));
      continue;
    }

    if (targetModel === 'PreBookingItem' && record.id) {
      record[alias] = store.preBookingItems
        .filter((row) => row.preBookingId === record.id)
        .map((row) => buildInstance(row, 'PreBookingItem', getStore));
      continue;
    }

    if (targetModel === 'Product') {
      const productId = record.productId || record.id;
      const product = store.products.find((row) => row.id === productId);
      record[alias] = product ? buildInstance(product, 'Product', getStore) : null;
      continue;
    }

    if (targetModel === 'Customer') {
      const customerId = record.customerId || record.id;
      const customer = store.customers.find((row) => row.id === customerId);
      record[alias] = customer ? buildInstance(customer, 'Customer', getStore) : null;
    }
  }

  return record;
};

const buildInstance = (record, modelName, getStore) => {
  const table = TABLE_KEYS[modelName];
  const instance = Object.assign(record, {
    get({ plain } = {}) {
      return plain ? { ...record } : record;
    },
    async update(payload) {
      Object.assign(record, payload);
      if (payload.metadata && typeof payload.metadata === 'object') {
        record.metadata = {
          ...(record.metadata && typeof record.metadata === 'object' ? record.metadata : {}),
          ...payload.metadata,
        };
      }
      return instance;
    },
    async reload(options = {}) {
      const store = getStore();
      const fresh = store[table].find((row) => row.id === record.id);
      if (fresh && fresh !== record) {
        Object.keys(fresh).forEach((key) => {
          record[key] = fresh[key];
        });
      }
      if (options.include) {
        const resolved = resolveInclude(record, options.include, getStore);
        if (resolved) {
          Object.assign(record, resolved);
        }
      }
      return instance;
    },
  });
  return instance;
};

const queryTable = (getStore, modelName, { where, include, order, limit } = {}) => {
  const store = getStore();
  const table = TABLE_KEYS[modelName];
  let rows = store[table].filter((row) => matchesWhere(row, where));

  if (include) {
    rows = rows
      .map((row) => resolveInclude(row, include, getStore))
      .filter(Boolean);
  }

  if (order?.length) {
    const [field, direction = 'ASC'] = order[0];
    rows.sort((a, b) => {
      if (a[field] === b[field]) return 0;
      const cmp = a[field] > b[field] ? 1 : -1;
      return direction === 'DESC' ? -cmp : cmp;
    });
  }

  if (limit) {
    rows = rows.slice(0, limit);
  }

  return rows.map((row) => buildInstance(row, modelName, getStore));
};

const createModelApi = (getStore, modelName, idPrefix) => ({
  name: modelName,
  create: jest.fn(async (data) => {
    const store = getStore();
    const table = TABLE_KEYS[modelName];
    const record = {
      id: nextId(store, idPrefix),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
      ...data,
    };
    store[table].push(record);
    return buildInstance(record, modelName, getStore);
  }),
  findOne: jest.fn(async ({ where, include, transaction, lock } = {}) => {
    void transaction;
    void lock;
    const rows = queryTable(getStore, modelName, { where, include, limit: 1 });
    return rows[0] || null;
  }),
  findAll: jest.fn(async ({ where, include, order, transaction } = {}) => {
    void transaction;
    return queryTable(getStore, modelName, { where, include, order });
  }),
  findByPk: jest.fn(async (id, { include, transaction } = {}) => {
    void transaction;
    const rows = queryTable(getStore, modelName, { where: { id }, include, limit: 1 });
    return rows[0] || null;
  }),
  count: jest.fn(async ({ where } = {}) => {
    return queryTable(getStore, modelName, { where }).length;
  }),
});

const buildModelMocks = (getStore) => ({
  Product: createModelApi(getStore, 'Product', 'product'),
  Customer: createModelApi(getStore, 'Customer', 'customer'),
  Rental: createModelApi(getStore, 'Rental', 'rental'),
  RentalItem: createModelApi(getStore, 'RentalItem', 'rental-item'),
  PreBooking: createModelApi(getStore, 'PreBooking', 'prebooking'),
  PreBookingItem: createModelApi(getStore, 'PreBookingItem', 'prebooking-item'),
  RentalExtension: createModelApi(getStore, 'RentalExtension', 'extension'),
  LateCharge: createModelApi(getStore, 'LateCharge', 'late-charge'),
  Invoice: createModelApi(getStore, 'Invoice', 'invoice'),
  DamageReport: createModelApi(getStore, 'DamageReport', 'damage'),
  Expense: createModelApi(getStore, 'Expense', 'expense'),
  RentalUnit: createModelApi(getStore, 'RentalUnit', 'unit'),
  OnlineStoreSettings: createModelApi(getStore, 'OnlineStoreSettings', 'store'),
  OnlineProductListing: createModelApi(getStore, 'OnlineProductListing', 'listing'),
  Payment: { create: jest.fn() },
});

const buildDatabaseMock = () => ({
  sequelize: {
    transaction: jest.fn(async () => ({
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    })),
  },
});

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createStaffReq = (overrides = {}) => ({
  tenantId: 'tenant-1',
  user: { id: 'user-1', tenantId: 'tenant-1', role: 'admin' },
  params: {},
  query: {},
  body: {},
  ...overrides,
});

const seedRentableProduct = async (store, models, {
  stockQty = 2,
  rentalRatePerDay = 100,
  name = 'Camera Kit',
} = {}) => {
  const product = await models.Product.create({
    tenantId: 'tenant-1',
    name,
    isRentable: true,
    isSalable: false,
    isActive: true,
    rentalRatePerDay,
    stockQty,
  });
  store.products[store.products.length - 1].stockQty = stockQty;
  return product;
};

const seedCustomer = async (models, overrides = {}) => models.Customer.create({
  tenantId: 'tenant-1',
  name: 'Jane Doe',
  phone: '0244123456',
  email: 'jane@example.com',
  ...overrides,
});

const seedStorefront = async (models, { productId, slug = 'rental-store' } = {}) => {
  const store = await models.OnlineStoreSettings.create({
    tenantId: 'tenant-1',
    shopId: 'shop-1',
    slug,
    displayName: 'Rental Store',
    enabled: true,
  });
  const listing = await models.OnlineProductListing.create({
    tenantId: 'tenant-1',
    shopId: 'shop-1',
    productId,
    title: 'Camera Kit',
    status: 'published',
    metadata: {},
  });
  return { store, listing };
};

module.exports = {
  Op,
  addDays,
  todayStr,
  createEmptyStore,
  buildModelMocks,
  buildDatabaseMock,
  createMockRes,
  createStaffReq,
  seedRentableProduct,
  seedCustomer,
  seedStorefront,
};
