const { Op } = require('sequelize');

jest.mock('../../../models', () => ({
  Product: { findAll: jest.fn(), create: jest.fn(), destroy: jest.fn(), count: jest.fn() },
  ProductCategory: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  ProductShopStock: { destroy: jest.fn() },
  ProductStockMovement: { findAll: jest.fn(), destroy: jest.fn() },
  Barcode: { findAll: jest.fn(), destroy: jest.fn() },
  ProductVariant: { rawAttributes: { productId: {} }, findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  SaleItem: { rawAttributes: { productId: {} }, findAll: jest.fn() },
  QuoteItem: { rawAttributes: { productId: {} }, findAll: jest.fn() },
}));

jest.mock('../../../config/database', () => ({
  sequelize: {
    // Outer transaction: run the work. Nested (savepoint): run it; a throw is contained by the caller.
    transaction: jest.fn(async (options, work) => (typeof options === 'function' ? options({ outer: true }) : work({ savepoint: true }))),
  },
}));

jest.mock('../../../utils/productStockUtils', () => ({ applyStockChange: jest.fn(), syncParentQuantityFromVariants: jest.fn() }));

const models = require('../../../models');
const { applyStockChange, syncParentQuantityFromVariants } = require('../../../utils/productStockUtils');
const {
  planProductImport,
  commitProductImport,
  undoProductImport,
} = require('../../../services/productImportService');

const { Product, ProductCategory, ProductStockMovement, Barcode, SaleItem, QuoteItem, ProductVariant } = models;

/** Existing ABS data the plan checks against. */
function givenExisting({ products = [], aliases = [], categories = [], variants = [] } = {}) {
  ProductVariant.findAll.mockImplementation(async ({ where }) => {
    if (where?.productId) return [];
    const wanted = (where[Op.or] || []).flatMap((w) => (w.sku ? w.sku[Op.in] : w.barcode[Op.in]));
    return variants.filter((v) => wanted.includes(v.sku) || wanted.includes(v.barcode));
  });
  Product.findAll.mockImplementation(async ({ where }) => {
    if (where.sku) return products.filter((p) => p.sku && where.sku[Op.in].includes(p.sku));
    if (where.barcode) return products.filter((p) => p.barcode && where.barcode[Op.in].includes(p.barcode));
    if (where[Op.and]) {
      const names = where[Op.and][0].logic[Op.in];
      return products.filter((p) => names.includes(p.name.trim().toLowerCase()));
    }
    return [];
  });
  Barcode.findAll.mockResolvedValue(aliases.map((barcode) => ({ barcode })));
  ProductCategory.findAll.mockImplementation(async ({ where }) => {
    const names = where[Op.and][0].logic[Op.in];
    return categories.filter((c) => names.includes(c.name.toLowerCase()));
  });
}

const rows = (...items) => items.map((data, i) => ({ row: i + 2, data }));
const byRow = (plan) => Object.fromEntries(plan.rows.map((r) => [r.row, r]));

beforeEach(() => {
  jest.clearAllMocks();
  givenExisting();
});

describe('planProductImport', () => {
  it('adds valid rows and reports invalid ones', async () => {
    const plan = await planProductImport({
      tenantId: 't1',
      rows: rows({ name: 'Rice 5kg', sellingPrice: 120 }, { name: '', sellingPrice: 5 }, { name: 'Oil', costPrice: -2 }),
    });

    expect(plan.summary).toEqual({ total: 3, add: 1, skip: 0, error: 2 });
    expect(byRow(plan)[3]).toMatchObject({ status: 'error', reason: 'Product Name is required' });
    expect(byRow(plan)[4]).toMatchObject({ status: 'error', reason: 'Cost Price cannot be negative' });
    expect(plan.toAdd).toEqual([{ row: 2, record: expect.objectContaining({ name: 'Rice 5kg', sellingPrice: 120 }) }]);
  });

  it('skips repeats inside the file, but not same-named products told apart by SKU', async () => {
    const plan = await planProductImport({
      tenantId: 't1',
      rows: rows(
        { name: 'Milo 400g', sku: 'M1' },
        { name: 'Other', sku: 'M1' },
        { name: 'Bread', barcode: '600123' },
        { name: 'Loaf', barcode: '600123' },
        { name: 'Sugar' },
        { name: '  sugar ' },
        { name: 'Shirt', sku: 'S-RED' },
        { name: 'Shirt', sku: 'S-BLUE' },
      ),
    });

    const result = byRow(plan);
    expect(result[3]).toMatchObject({ status: 'skip', reason: 'Same SKU as row 2' });
    expect(result[5]).toMatchObject({ status: 'skip', reason: 'Same barcode as row 4' });
    expect(result[7]).toMatchObject({ status: 'skip', reason: 'Same name as row 6' });
    expect(result[9].status).toBe('add');
    expect(plan.summary.add).toBe(5);
  });

  it('skips products already in ABS by SKU, barcode (including extra barcodes) or name', async () => {
    givenExisting({
      products: [
        { name: 'Milo 400g', sku: 'M1', barcode: null },
        { name: 'Bread', sku: null, barcode: '600123' },
        { name: 'Sugar 1kg', sku: null, barcode: null },
      ],
      aliases: ['777'],
    });

    const plan = await planProductImport({
      tenantId: 't1',
      rows: rows(
        { name: 'Milo tin', sku: 'M1' },
        { name: 'Bread loaf', barcode: '600123' },
        { name: 'Biscuits', barcode: '777' },
        { name: 'SUGAR 1KG' },
        { name: 'Salt' },
      ),
    });

    const result = byRow(plan);
    expect(result[2].reason).toBe('SKU M1 is already used by "Milo 400g"');
    expect(result[3].reason).toBe('Barcode 600123 is already used by "Bread"');
    expect(result[4].reason).toBe('Barcode 777 is already used by another product');
    expect(result[5].reason).toBe('"SUGAR 1KG" is already in your products');
    expect(result[6].status).toBe('add');
  });

  it('matches categories ignoring case and lists the ones it will create', async () => {
    givenExisting({ categories: [{ id: 'cat-drinks', name: 'Drinks' }] });

    const plan = await planProductImport({
      tenantId: 't1',
      rows: rows({ name: 'Coke', categoryName: 'drinks' }, { name: 'Soap', categoryName: 'Toiletries' }, { name: 'Gel', categoryName: 'toiletries' }),
    });

    expect(plan.categoryIds).toEqual({ drinks: 'cat-drinks' });
    expect(plan.newCategories).toEqual(['Toiletries']);
  });

  it('without creating categories, warns that the product goes in without one', async () => {
    const plan = await planProductImport({
      tenantId: 't1',
      rows: rows({ name: 'Soap', categoryName: 'Toiletries' }),
      createCategories: false,
    });

    expect(plan.newCategories).toEqual([]);
    expect(plan.rows[0].warnings).toEqual(['Category "Toiletries" not found; added without a category']);
  });

  it('applies the product rules and reports a row they reject', async () => {
    const plan = await planProductImport({
      tenantId: 't1',
      shopId: 'shop-1',
      rows: rows({ name: 'Drill', wholesalePrice: 'abc' }, { name: 'Saw' }),
      prepare: (record) => {
        if (record.name === 'Drill') throw new Error('Wholesale price must be a valid number');
        return record;
      },
    });

    expect(byRow(plan)[2]).toMatchObject({ status: 'error', reason: 'Wholesale price must be a valid number' });
    expect(plan.toAdd[0].record).toMatchObject({ name: 'Saw', shopId: 'shop-1' });
  });
});

describe('commitProductImport', () => {
  it('adds each product with the batch id and its opening stock; a failing row does not stop the rest', async () => {
    ProductCategory.create.mockResolvedValue({ id: 'cat-new' });
    Product.create.mockImplementation(async (data) => {
      if (data.name === 'Broken') throw Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' });
      return { id: `p-${data.name}`, name: data.name };
    });

    const plan = await planProductImport({
      tenantId: 't1',
      shopId: 'shop-1',
      rows: rows({ name: 'Rice', quantityOnHand: 10, categoryName: 'Food' }, { name: 'Broken' }, { name: 'Beans' }),
    });
    const result = await commitProductImport({ plan, tenantId: 't1', userId: 'u1' });

    expect(result.added.map((p) => p.name)).toEqual(['Rice', 'Beans']);
    expect(result.failed).toEqual([{ row: 3, name: 'Broken', reason: 'Already in your products (same SKU or barcode)' }]);
    expect(result.newCategories).toEqual(['Food']);

    const rice = Product.create.mock.calls[0][0];
    expect(rice).toMatchObject({ categoryId: 'cat-new', quantityOnHand: 0, shopId: 'shop-1', tenantId: 't1' });
    expect(rice.metadata).toEqual({ importBatchId: result.batchId, importedAt: expect.any(String) });
    expect(rice).not.toHaveProperty('categoryName');
    expect(applyStockChange).toHaveBeenCalledTimes(1);
    expect(applyStockChange).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'p-Rice',
      shopId: 'shop-1',
      setTo: 10,
      type: 'opening',
      metadata: { source: 'import', importBatchId: result.batchId },
    }));
  });

  it('keeps stock on the product when there is no shop to record it in', async () => {
    Product.create.mockImplementation(async (data) => ({ id: 'p1', name: data.name }));
    const plan = await planProductImport({ tenantId: 't1', rows: rows({ name: 'Rice', quantityOnHand: 4 }) });

    await commitProductImport({ plan, tenantId: 't1' });

    expect(Product.create.mock.calls[0][0].quantityOnHand).toBe(4);
    expect(applyStockChange).not.toHaveBeenCalled();
  });
});

describe('undoProductImport', () => {
  const BATCH = 'batch-1';

  beforeEach(() => {
    Product.findAll.mockResolvedValue([
      { id: 'p1', name: 'Rice', shopId: 's1' },
      { id: 'p2', name: 'Beans', shopId: 's1' },
      { id: 'p3', name: 'Oil', shopId: 's1' },
      { id: 'p4', name: 'Salt', shopId: 's2' },
    ]);
    SaleItem.findAll.mockResolvedValue([{ productId: 'p2' }]);
    QuoteItem.findAll.mockResolvedValue([]);
    ProductStockMovement.findAll.mockResolvedValue([
      { productId: 'p1', type: 'opening', metadata: { importBatchId: BATCH } },
      { productId: 'p3', type: 'opening', metadata: { importBatchId: BATCH } },
      { productId: 'p3', type: 'adjustment', metadata: {} },
    ]);
    ProductCategory.findAll.mockResolvedValue([{ id: 'cat-new' }]);
    Product.count.mockResolvedValue(0);
  });

  it('removes only products nothing has used, and keeps the rest with the reason', async () => {
    const result = await undoProductImport({ tenantId: 't1', batchId: BATCH, canAccess: (p) => p.shopId === 's1' });

    expect(result.removed).toEqual([{ id: 'p1', name: 'Rice' }]);
    expect(result.kept).toEqual(expect.arrayContaining([
      { id: 'p2', name: 'Beans', reason: 'Already sold' },
      { id: 'p3', name: 'Oil', reason: 'Stock has changed since the import' },
      { id: 'p4', name: 'Salt', reason: 'In a shop you cannot manage' },
    ]));
    expect(Product.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't1', id: { [Op.in]: ['p1'] } } }));
    expect(ProductCategory.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't1', id: 'cat-new' } }));
  });

  it('reports an unknown batch', async () => {
    Product.findAll.mockResolvedValue([]);
    await expect(undoProductImport({ tenantId: 't1', batchId: 'nope' })).resolves.toEqual({ found: 0, removed: [], kept: [] });
    expect(Product.destroy).not.toHaveBeenCalled();
  });
});

describe('colours and sizes (variants, from Lynk)', () => {
  const polo = { name: 'Polo shirt', sellingPrice: 50, quantityOnHand: 5 };
  const choices = [
    { attributes: { colour: 'Red', size: 'XL' }, sku: 'POLO-R-XL', sellingPrice: 50, quantityOnHand: 3 },
    { attributes: { colour: 'Blue', size: 'M' }, sku: 'POLO-B-M', sellingPrice: '55', quantityOnHand: 2 },
  ];

  it('checks each colour and size with its product, and skips a code ABS already uses', async () => {
    let plan = await planProductImport({ tenantId: 't1', rows: [{ row: 'r1', data: polo, variants: choices }] });
    expect(plan.rows[0].status).toBe('add');
    expect(plan.toAdd[0].record.variants.map((v) => [v.name, v.sku, v.sellingPrice])).toEqual([['Red / XL', 'POLO-R-XL', 50], ['Blue / M', 'POLO-B-M', 55]]);

    givenExisting({ variants: [{ sku: 'POLO-B-M', product: { name: 'Old polo' } }] });
    plan = await planProductImport({ tenantId: 't1', rows: [{ row: 'r1', data: polo, variants: choices }] });
    expect(plan.rows[0]).toMatchObject({ status: 'skip', reason: 'SKU POLO-B-M is already used by "Old polo"' });

    plan = await planProductImport({ tenantId: 't1', rows: [{ row: 'r1', data: polo, variants: [{ attributes: { size: 'S' }, quantityOnHand: -1 }] }] });
    expect(plan.rows[0].status).toBe('error');
  });

  it('adds the colours and sizes with their own opening stock, and the product\'s total follows them', async () => {
    Product.create.mockImplementation(async (data) => ({ id: 'p-polo', ...data }));
    ProductVariant.create.mockImplementation(async (data) => ({ id: `v-${data.sku}`, ...data }));
    const plan = await planProductImport({ tenantId: 't1', rows: [{ row: 'r1', data: polo, variants: choices }] });
    const result = await commitProductImport({ plan, tenantId: 't1', openingShopId: 'shop-osu', batchId: 'lynk-imp1' });
    expect(result.batchId).toBe('lynk-imp1');
    expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Polo shirt', hasVariants: true, quantityOnHand: 0 }), expect.anything());
    expect(ProductVariant.create).toHaveBeenCalledTimes(2);
    expect(ProductVariant.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Red / XL', productId: 'p-polo', quantityOnHand: 0, metadata: expect.objectContaining({ importBatchId: 'lynk-imp1' }) }), expect.anything());
    expect(applyStockChange).toHaveBeenCalledWith(expect.objectContaining({ productVariantId: 'v-POLO-R-XL', shopId: 'shop-osu', setTo: 3, type: 'opening' }));
    expect(syncParentQuantityFromVariants).toHaveBeenCalledWith('p-polo', expect.anything());
  });

  it('undo removes the colours and sizes the import made, with their product', async () => {
    Product.findAll.mockResolvedValue([{ id: 'p-polo', name: 'Polo shirt', shopId: null }]);
    ProductStockMovement.findAll.mockResolvedValue([]);
    SaleItem.findAll.mockResolvedValue([]);
    QuoteItem.findAll.mockResolvedValue([]);
    ProductCategory.findAll.mockResolvedValue([]);
    const result = await undoProductImport({ tenantId: 't1', batchId: 'lynk-imp1' });
    expect(result.removed).toEqual([{ id: 'p-polo', name: 'Polo shirt' }]);
    expect(ProductVariant.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        [Op.or]: [{ metadata: { importBatchId: { [Op.ne]: 'lynk-imp1' } } }, { metadata: { importBatchId: null } }],
      }),
    }));
    expect(ProductVariant.destroy).toHaveBeenCalled();
  });

  it('undo keeps a product that was given a colour or size after the import', async () => {
    Product.findAll.mockResolvedValue([{ id: 'p-polo', name: 'Polo shirt', shopId: null }]);
    ProductStockMovement.findAll.mockResolvedValue([]);
    SaleItem.findAll.mockResolvedValue([]);
    QuoteItem.findAll.mockResolvedValue([]);
    ProductCategory.findAll.mockResolvedValue([]);
    ProductVariant.findAll.mockResolvedValueOnce([{ productId: 'p-polo' }]);
    const result = await undoProductImport({ tenantId: 't1', batchId: 'lynk-imp1' });
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([expect.objectContaining({ id: 'p-polo', reason: 'Has variants added since the import' })]);
  });
});
