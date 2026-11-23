import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStoreCatalogPath } from './storePaths.js';
import { getStoreCatalogPage } from './storeCatalog.js';

const products = Array.from({ length: 200 }, (_, i) => ({
  id: `product-${i + 1}`,
  title: i === 199 ? 'Morgan Glass Kettle' : `Product ${i + 1}`,
  category: { name: i < 80 ? 'Accessories' : 'Ink' },
}));

test('all 200 products are reachable across pages without duplicates or omissions', () => {
  const first = getStoreCatalogPage(products);
  assert.equal(first.total, 200);
  assert.equal(first.totalPages, 9);
  assert.equal(first.items.length, 24);
  const seen = [];
  for (let page = 1; page <= first.totalPages; page += 1) {
    seen.push(...getStoreCatalogPage(products, { page }).items.map((item) => item.id));
  }
  assert.deepEqual(seen, products.map((item) => item.id));
  const last = getStoreCatalogPage(products, { page: '9' });
  assert.equal(last.start, 193);
  assert.equal(last.end, 200);
  assert.equal(last.items.length, 8);
});

test('search and category filtering find products beyond the former 80-product cutoff', () => {
  const search = getStoreCatalogPage(products, { search: ' glass KETTLE ', category: 'ink' });
  assert.deepEqual(search.items, [products[199]]);
  assert.equal(search.total, 1);
  const category = getStoreCatalogPage(products, { category: 'Ink', page: 5 });
  assert.equal(category.total, 120);
  assert.equal(category.totalPages, 5);
  assert.equal(category.items.at(-1).id, 'product-200');
});

test('service categories use the same complete-catalog pagination', () => {
  const services = products.map((item) => ({ ...item, category: 'Printing' }));
  const result = getStoreCatalogPage(services, { category: 'printing', page: 9 });
  assert.equal(result.total, 200);
  assert.equal(result.items.at(-1).id, 'product-200');
});

test('invalid pages and stale page numbers cannot hide matching products', () => {
  for (const page of ['', 'nope', '-1', '0', '2.5', 'Infinity']) {
    assert.equal(getStoreCatalogPage(products, { page }).page, 1);
  }
  const narrowed = getStoreCatalogPage(products, { search: 'glass kettle', page: 9 });
  assert.equal(narrowed.page, 1);
  assert.deepEqual(narrowed.items, [products[199]]);
  assert.equal(getStoreCatalogPage(products, { page: 999 }).page, 9);
  assert.deepEqual(getStoreCatalogPage(products, { search: 'not found', page: 9 }), {
    items: [], total: 0, page: 1, totalPages: 1, start: 0, end: 0,
  });
});

test('new searches stay in the store and start on the first page', () => {
  assert.equal(buildStoreCatalogPath('test-store', {
    pathname: '/shop/test-store/products', search: 'glass kettle',
  }), '/shop/test-store/products?search=glass+kettle');
  assert.equal(buildStoreCatalogPath('test-store', {
    isCustomDomain: true, category: 'Ink',
  }), '/products?category=Ink');
});
