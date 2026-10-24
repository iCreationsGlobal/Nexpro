const crypto = require('crypto');
const { absDetails, verifyLynkSignature, rowsFromLynk, batchIdFor, startImport } = require('../../../services/lynkImport');

describe('Lynk AI product import (services/lynkImport.js)', () => {
  it("sends ABS's own import template as its product details, with what each one means", () => {
    const details = absDetails();
    const byKey = Object.fromEntries(details.map((d) => [d.key, d]));
    expect(byKey.name).toMatchObject({ label: 'Product Name', kind: 'text', required: true, role: 'name' });
    expect(byKey.sellingPrice).toMatchObject({ kind: 'money', role: 'price', per_choice: true });
    expect(byKey.costPrice).toMatchObject({ kind: 'money', role: 'cost' });
    expect(byKey.quantityOnHand).toMatchObject({ kind: 'number', role: 'quantity', per_choice: true });
    expect(byKey.categoryName.role).toBe('category');
    expect(byKey.expiryDate).toMatchObject({ kind: 'date', role: 'expiry' });
    expect(byKey.isActive).toMatchObject({ kind: 'yesno' });
    expect(byKey.isActive.role).toBeUndefined();
  });

  it('trusts only messages signed with the secret', () => {
    const body = Buffer.from(JSON.stringify({ event: 'import.finished', import_id: 'imp1' }));
    const sig = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
    expect(verifyLynkSignature(body, sig, 'whsec_test')).toBe(true);
    expect(verifyLynkSignature(body, sig, 'whsec_other')).toBe(false);
    expect(verifyLynkSignature(Buffer.from('{"changed":1}'), sig, 'whsec_test')).toBe(false);
    expect(verifyLynkSignature(body, 'nothex', 'whsec_test')).toBe(false);
    expect(verifyLynkSignature(body, sig, '')).toBe(false);
  });

  it("reads Lynk's products as ABS import rows, colours and sizes as variants", () => {
    const rows = rowsFromLynk([
      { row: 'r1', values: { name: 'Polo shirt', sellingPrice: 50, quantityOnHand: 5, categoryName: 'Clothes' }, choices: [{ attributes: { colour: 'Red', size: 'XL' }, values: { sellingPrice: 50, quantityOnHand: 3, sku: 'P-R-XL' } }] },
      { row: 'r2', values: { name: 'Milo 500g', sellingPrice: 45, costPrice: 40 } },
    ]);
    expect(rows[0].row).toBe('r1');
    expect(rows[0].data).toMatchObject({ name: 'Polo shirt', sellingPrice: 50, categoryName: 'Clothes' });
    expect(rows[0].variants).toEqual([{ attributes: { colour: 'Red', size: 'XL' }, sellingPrice: 50, quantityOnHand: 3, sku: 'P-R-XL' }]);
    expect(rows[1].variants).toEqual([]);
    expect(rows[1].update).toBeUndefined();
    const [update] = rowsFromLynk([{ row: 'r3', action: 'update', match: { by: 'sku', id: 'p-9', name: 'Milo' }, values: { name: 'Milo', sellingPrice: 48 } }]);
    expect(update.update).toEqual({ id: 'p-9' });
    expect(batchIdFor('cm123abc')).toBe('lynk-cm123abc');
    expect(batchIdFor('../x')).toBe('lynk-x');
  });

  it("starts an import on Lynk for the business, with ABS's lists, products and addresses", async () => {
    process.env.LYNK_API_KEY = 'lynk_test';
    process.env.LYNK_URL = 'https://lynk.test';
    process.env.API_PUBLIC_URL = 'https://api.abs.test';
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ id: 'imp1', screen_url: 'https://lynk.test/import/pass' }) }));
    const out = await startImport({ tenant: { id: 't1', name: 'Glow Mart' }, user: { email: 'ama@glow.test' }, categories: ['Drinks'], units: ['pcs'], shops: [{ id: 's1', name: 'Osu' }], existing: [{ id: 'p1', name: 'Milo', sku: 'M1', barcode: null }] }, { fetchImpl });
    expect(out.screen_url).toBe('https://lynk.test/import/pass');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://lynk.test/api/v1/products/imports');
    expect(init.headers.Authorization).toBe('Bearer lynk_test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ user: { id: 't1', name: 'Glow Mart', email: 'ama@glow.test' }, screen: true, variants: true, can_update: true, lists: { categories: ['Drinks'], units: ['pcs'], shops: [{ id: 's1', name: 'Osu' }] }, check_url: 'https://api.abs.test/api/webhooks/lynk/import-check', webhook_url: 'https://api.abs.test/api/webhooks/lynk/import-finished' });
    expect(body.existing).toEqual([{ id: 'p1', name: 'Milo', sku: 'M1' }]);

    const refused = jest.fn(async () => ({ ok: false, status: 402, json: async () => ({ error: { message: 'Insufficient Lynk wallet balance' } }) }));
    await expect(startImport({ tenant: { id: 't1' }, categories: [], units: [], shops: [], existing: [] }, { fetchImpl: refused })).rejects.toMatchObject({ statusCode: 402, message: 'Insufficient Lynk wallet balance' });
  });
});
