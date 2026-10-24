const crypto = require('crypto');

jest.mock('../../../models', () => ({
  Product: { findAll: jest.fn() },
  ProductCategory: { findAll: jest.fn() },
  Shop: { findAll: jest.fn(), findOne: jest.fn() },
  Tenant: { findByPk: jest.fn() },
  LynkImport: { findOne: jest.fn(), findByPk: jest.fn(), update: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../middleware/cache', () => ({ invalidateProductListCache: jest.fn() }));
jest.mock('../../../utils/shopUtils', () => ({ userCanAccessShopId: () => true }));
jest.mock('../../../services/productImportService', () => ({ planProductImport: jest.fn(), commitProductImport: jest.fn() }));
jest.mock('../../../controllers/productController', () => ({ _prepareImportRecord: (r) => r }));

const { LynkImport, Tenant, Shop } = require('../../../models');
const { planProductImport, commitProductImport } = require('../../../services/productImportService');
const { lynkImportCheck, lynkImportFinished, lynkImportStatus } = require('../../../controllers/lynkImportController');

const SECRET = 'whsec_test';
/** A request as Lynk sends it: the JSON body, its raw bytes and their signature. */
const signed = (body, secret = SECRET) => {
  const rawBody = Buffer.from(JSON.stringify(body));
  return { body, rawBody, headers: { 'x-lynk-signature': crypto.createHmac('sha256', secret).update(rawBody).digest('hex') } };
};
const reply = () => {
  const res = { statusCode: 200, body: null };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
};
const record = (values = {}) => {
  const r = { id: 'li1', tenantId: 't1', importId: 'imp1', startedBy: 'u1', status: 'started', batchId: 'lynk-imp1', addedCount: 0, updatedCount: 0, result: {}, ...values };
  r.update = jest.fn(async (changes) => Object.assign(r, changes));
  return r;
};
const plan = (over = {}) => ({ rows: [], toAdd: [], toUpdate: [], newCategories: [], ...over });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.LYNK_IMPORT_SECRET = SECRET;
  Tenant.findByPk.mockResolvedValue({ id: 't1', name: 'Glow Mart' });
  Shop.findOne.mockResolvedValue({ id: 's1' });
  Shop.findAll.mockResolvedValue([{ id: 's1', isDefault: true }]);
});

describe('Lynk import messages', () => {
  it('refuses a message not signed with the secret', async () => {
    const res = reply();
    await lynkImportCheck(signed({ import_id: 'imp1', user: { id: 't1' } }, 'wrong'), res, jest.fn());
    expect(res.statusCode).toBe(401);
  });

  it('refuses an import this business never started', async () => {
    LynkImport.findOne.mockResolvedValue(record({ tenantId: 'another' }));
    const res = reply();
    await lynkImportCheck(signed({ import_id: 'imp1', user: { id: 't1' }, products: [] }), res, jest.fn());
    expect(res.statusCode).toBe(404);
    expect(planProductImport).not.toHaveBeenCalled();
  });

  it('answers the check with ABS\'s preview; a product to update can go in', async () => {
    LynkImport.findOne.mockResolvedValue(record());
    planProductImport.mockResolvedValue(plan({ rows: [{ row: 'r1', status: 'update' }, { row: 'r2', status: 'skip', reason: 'SKU A1 is already used by "Milo"' }] }));
    const res = reply();
    await lynkImportCheck(signed({ import_id: 'imp1', user: { id: 't1' }, shop_id: 's1', products: [] }), res, jest.fn());
    expect(res.body.results).toEqual([{ row: 'r1', status: 'add' }, { row: 'r2', status: 'skip', reason: 'SKU A1 is already used by "Milo"' }]);
  });

  it('adds the finished products once, as the person who started it, and records what happened', async () => {
    const row = record();
    LynkImport.findOne.mockResolvedValue(row);
    LynkImport.update.mockResolvedValueOnce([1]);
    planProductImport.mockResolvedValue(plan({ toAdd: [{ row: 'r1', record: {} }], rows: [{ row: 'r1', status: 'add' }] }));
    commitProductImport.mockResolvedValue({ added: [{ row: 'r1', id: 'p1', name: 'Milo' }], updated: [], failed: [], newCategories: [] });
    const res = reply();
    await lynkImportFinished(signed({ import_id: 'imp1', user: { id: 't1' }, products: [], left_out: [{ row: 'r9', name: 'Malta', why: 'No price' }] }), res, jest.fn());
    expect(LynkImport.update).toHaveBeenCalledWith({ status: 'saving' }, { where: { id: 'li1', status: 'started' } });
    expect(commitProductImport).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', batchId: 'lynk-imp1', via: 'lynk', openingShopId: 's1' }));
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'finished', addedCount: 1, updatedCount: 0, result: expect.objectContaining({ leftOut: [{ name: 'Malta', reason: 'No price' }] }) }));
    expect(res.body).toMatchObject({ success: true, addedCount: 1 });
  });

  it('takes nothing when the import was already saved or undone (a resend)', async () => {
    LynkImport.findOne.mockResolvedValue(record({ status: 'undone' }));
    LynkImport.update.mockResolvedValueOnce([0]);
    LynkImport.findByPk.mockResolvedValue(record({ status: 'undone', addedCount: 3 }));
    planProductImport.mockResolvedValue(plan({ toAdd: [{ row: 'r1', record: {} }] }));
    const res = reply();
    await lynkImportFinished(signed({ import_id: 'imp1', user: { id: 't1' }, products: [] }), res, jest.fn());
    expect(commitProductImport).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ already: true, undone: true });
  });

  it('lets the next try go ahead when saving fails', async () => {
    LynkImport.findOne.mockResolvedValue(record());
    LynkImport.update.mockResolvedValueOnce([1]).mockResolvedValueOnce([1]);
    planProductImport.mockResolvedValue(plan({ toAdd: [{ row: 'r1', record: {} }] }));
    commitProductImport.mockRejectedValue(new Error('db down'));
    const next = jest.fn();
    await lynkImportFinished(signed({ import_id: 'imp1', user: { id: 't1' }, products: [] }), reply(), next);
    expect(LynkImport.update).toHaveBeenLastCalledWith({ status: 'started' }, { where: { id: 'li1', status: 'saving' } });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('tells the owner\'s window when an import finished, even with nothing new to add', async () => {
    LynkImport.findOne.mockResolvedValue(record({ status: 'finished', result: { skipped: [{ row: 'r1', name: 'Milo', reason: 'Already in your products' }] } }));
    const res = reply();
    await lynkImportStatus({ tenantId: 't1', params: { importId: 'imp1' } }, res, jest.fn());
    expect(res.body).toMatchObject({ finished: true, addedCount: 0, updatedCount: 0, skipped: [{ name: 'Milo' }] });
  });
});
