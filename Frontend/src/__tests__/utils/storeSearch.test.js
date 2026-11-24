import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { searchStoreListings } from '../../../../storefront/src/online-store/storeSearch';
import { getStoreCatalogPage } from '../../../../storefront/src/online-store/storeCatalog';

const item = (title, category, shortDescription = '', extra = {}) => ({ title, shortDescription, category: category ? { name: category } : null, ...extra });

// Names and wording from a real store where "stand" listed 16 unrelated products, an air conditioner first.
const catalog = [
  item('Samsung 2.5HP R410 Split Air Conditioner AR24TRHGAWK/GA', 'Home Appliances', 'Standard installation kit'),
  item('F11- 2 Wireless Microphone', 'Audio Equipment'),
  item('Midea AC 1.5HP 12000 BTU R410', 'Home Appliances'),
  item('Laptop Stand', 'Accessories', 'Aluminium, foldable'),
  item('Nokia 105 Keypad Phone', 'Mobile Phones', 'Long standby time, standard SIM'),
  item('TECNO Camon 50', 'Mobile Phones', 'Wi-Fi 5'),
  item('Morgan FK-0315 Electric Kettle', 'Kitchen appliance', '1.8L, standard plug'),
  item('Toshiba 64GB Flash Drive', 'Pendrive', 'USB standard'),
  item('Mooved 18" Standing Fan - Black', 'Home Appliances', 'Three speeds'),
  item('TCL Refrigerator 309 LTR', 'Home Appliances', 'Opens both ways'),
  item('HP 15 Notebook', 'Computers & Laptops', 'Comes with a stand'),
  item('Epson L3350 Wi-Fi Printer', 'Printers & Scanners', 'Print and copy'),
];
const find = (query, items = catalog) => searchStoreListings(items, query).map(({ title }) => title);

describe('store search', () => {
  it('puts the thing itself first and leaves out "standard" and "standby"', () => {
    expect(find('stand')).toEqual(['Laptop Stand', 'Mooved 18" Standing Fan - Black', 'HP 15 Notebook']);
  });

  it('ranks the name above the category, and the category above the description', () => {
    expect(find('phone')).toEqual(['Nokia 105 Keypad Phone', 'TECNO Camon 50', 'F11- 2 Wireless Microphone']);
  });

  it.each([
    ['nokia phone', ['Nokia 105 Keypad Phone']],
    ['phone nokia', ['Nokia 105 Keypad Phone']],
    ['stand for laptop', ['Laptop Stand', 'HP 15 Notebook']],
    ['samsung fan', []],
  ])('matches every word in any order: "%s"', (query, expected) => {
    expect(find(query)).toEqual(expected);
  });

  it.each([
    ['ac', ['Samsung 2.5HP R410 Split Air Conditioner AR24TRHGAWK/GA', 'Midea AC 1.5HP 12000 BTU R410']],
    ['air conditioners', ['Samsung 2.5HP R410 Split Air Conditioner AR24TRHGAWK/GA', 'Midea AC 1.5HP 12000 BTU R410']],
    ['samsung ac', ['Samsung 2.5HP R410 Split Air Conditioner AR24TRHGAWK/GA']],
    ['Fridge', ['TCL Refrigerator 309 LTR']],
  ])('knows other names for the same thing: "%s"', (query, expected) => {
    expect(find(query)).toEqual(expected);
  });

  it.each([
    ['KETTLES', 'Morgan FK-0315 Electric Kettle'],
    ['notebooks', 'HP 15 Notebook'],
    ['book', 'HP 15 Notebook'],
    ['lap', 'Laptop Stand'],
    ['flashdrive', 'Toshiba 64GB Flash Drive'],
    ['fk-0315', 'Morgan FK-0315 Electric Kettle'],
    ['AR24TRHGAWK/GA', 'Samsung 2.5HP R410 Split Air Conditioner AR24TRHGAWK/GA'],
    ['105', 'Nokia 105 Keypad Phone'],
  ])('finds "%s"', (query, title) => {
    expect(find(query)[0]).toBe(title);
  });

  it.each(['wifi', 'wi-fi', 'Wi Fi'])('treats "%s" the same', (query) => {
    expect(find(query)).toEqual(['Epson L3350 Wi-Fi Printer', 'TECNO Camon 50']);
  });

  it('does not match inside short words or descriptions', () => {
    expect(find('pen')).toEqual(['Toshiba 64GB Flash Drive']); // the Pendrive category, not "Opens"
    expect(find('ink')).toEqual([]); // "Drinking" style matches are gone
    expect(find('object', [{ title: 'Mug', category: { id: 'c1' } }])).toEqual([]); // a category object is never searched as text
  });

  it('reads one or two letters as a word, or as a beginning when nothing has it', () => {
    expect(find('hp')).toEqual(['HP 15 Notebook']);
    expect(find('no')).toEqual(['Nokia 105 Keypad Phone', 'HP 15 Notebook']);
  });

  it('ranks an exact phrase above the same words apart', () => {
    const drives = [item('Hard Disk Drive'), item('External Hard Drive')];
    expect(find('hard drive', drives)).toEqual(['External Hard Drive', 'Hard Disk Drive']);
  });

  it('searches SKU, services and descriptions without reading HTML tags', () => {
    const items = [
      item('Cable', '', '', { sku: 'AB-1234' }),
      { name: 'Braids', category: 'Hair', shortDescription: '<strong>Neat</strong> finish' },
    ];
    expect(find('ab-1234', items)).toEqual(['Cable']);
    expect(searchStoreListings(items, 'braid')).toEqual([items[1]]);
    expect(searchStoreListings(items, 'hair')).toEqual([items[1]]);
    expect(searchStoreListings(items, 'neat')).toEqual([items[1]]);
    expect(searchStoreListings(items, 'strong')).toEqual([]);
  });

  it('handles accents, Ghanaian letters, filler words, symbols and odd input', () => {
    const items = [item('Café Table'), item('Wɔnpɛ Lamp'), item('The One')];
    expect(find('cafe', items)).toEqual(['Café Table']);
    expect(find('wɔnpɛ', items)).toEqual(['Wɔnpɛ Lamp']);
    expect(find('the', items)).toEqual(['The One']);
    expect(find('!!!')).toEqual([]);
    expect(find('(.*)+[')).toEqual([]);
    expect(searchStoreListings(null, 'x')).toEqual([]);
    expect(searchStoreListings([null, undefined, {}], 'x')).toEqual([]);
  });

  it('keeps the catalog order when nothing is searched, and for equal matches', () => {
    expect(searchStoreListings(catalog, '   ')).toEqual(catalog);
    expect(find('home')).toEqual(catalog.filter(({ category }) => category?.name === 'Home Appliances').map(({ title }) => title));
  });

  it('searches inside the chosen category and fills the first page with the best matches', () => {
    expect(getStoreCatalogPage(catalog, { search: 'stand', category: 'accessories' }).items.map(({ title }) => title)).toEqual(['Laptop Stand']);
    const many = [...Array.from({ length: 60 }, (_, i) => item(`Cable ${i}`, '', 'with stand')), item('Phone Stand')];
    const page = getStoreCatalogPage(many, { search: 'stand' });
    expect(page.items[0].title).toBe('Phone Stand');
    expect(page.total).toBe(61);
  });
});

describe('the two copies of the search', () => {
  const core = (file) => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../..', file), 'utf8');
    return source.slice(source.indexOf('// === Search core'), source.indexOf('// === End of search core'));
  };

  it('are the same on the online store and on the server', () => {
    expect(core('storefront/src/online-store/storeSearch.js').length).toBeGreaterThan(1000);
    expect(core('Backend/utils/listingSearch.js')).toBe(core('storefront/src/online-store/storeSearch.js'));
  });
});

describe('very long searches', () => {
  it('are cut short instead of slowing the page', () => {
    const items = Array.from({ length: 3000 }, (_, i) => item(`Item ${i}`, 'Home Appliances', 'word '.repeat(80)));
    const started = performance.now();
    searchStoreListings(items, 'zzzz '.repeat(20000));
    searchStoreListings(items, 'a'.repeat(200000));
    searchStoreListings([item('x'.repeat(50000), '', 'y'.repeat(50000))], 'laptop');
    expect(performance.now() - started).toBeLessThan(4000);
  });
});
