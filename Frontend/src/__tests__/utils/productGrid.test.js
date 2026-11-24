import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as dashboard from '../../utils/productGrid';
import * as storefront from '../../../../storefront/src/online-store/productGrid';
import { getTemplateTheme, STORE_TEMPLATE_IDS } from '../../../../storefront/src/templates/registry';

const server = createRequire(import.meta.url)(path.resolve(__dirname, '../../../../Backend/utils/productGrid.js'));

const CASES = [
  undefined, null, 'x', [], {}, { phone: 1 }, { phone: '2' }, { phone: 3 }, { phone: 0 }, { phone: -1 }, { phone: 1.5 }, { phone: NaN },
  { computer: 3 }, { computer: '6' }, { computer: 2 }, { computer: 7 }, { computer: null }, { computer: [] }, { computerCards: 'compact' },
  { computerCards: 'huge' }, { phone: 1, computer: 5, computerCards: 'compact', extra: '<script>' },
];

describe('product grid setting', () => {
  it.each(CASES.map((value) => [value]))('%o means the same on the server, dashboard and store', (value) => {
    expect(dashboard.sanitizeProductGrid(value)).toEqual(storefront.sanitizeProductGrid(value));
    expect(server.sanitizeProductGrid(value)).toEqual(storefront.sanitizeProductGrid(value));
  });

  it('defaults to two compact cards on phones and leaves computers alone', () => {
    expect(storefront.sanitizeProductGrid(undefined)).toEqual({ phone: 2, computer: null, computerCards: 'large' });
  });

  it('keeps only known values', () => {
    expect(storefront.sanitizeProductGrid({ phone: 1, computer: 5, computerCards: 'compact', extra: 'x' })).toEqual({ phone: 1, computer: 5, computerCards: 'compact' });
    expect(storefront.sanitizeProductGrid({ phone: 9, computer: 99, computerCards: 'huge' })).toEqual({ phone: 2, computer: null, computerCards: 'large' });
  });

  it('tells the dashboard what each template uses on computers', () => {
    expect(Object.keys(dashboard.TEMPLATE_COMPUTER_COLUMNS).sort()).toEqual([...STORE_TEMPLATE_IDS].sort());
    STORE_TEMPLATE_IDS.forEach((id) => {
      expect(getTemplateTheme(id).computerColumns).toBe(`lg:grid-cols-${dashboard.TEMPLATE_COMPUTER_COLUMNS[id]}`);
    });
  });

  it('keeps each template on computers exactly as it was', () => {
    STORE_TEMPLATE_IDS.forEach((id) => {
      const { gridClass, computerColumns, computerGap } = getTemplateTheme(id);
      const columns = [...gridClass.matchAll(/(?:lg:|sm:)?grid-cols-(\d)/g)].at(-1)[1];
      expect(computerColumns).toBe(`lg:grid-cols-${columns}`);
      expect(computerGap).toBe(`lg:gap-${gridClass.match(/gap-(\d+)/)[1]}`);
    });
  });
});

describe('product grid classes', () => {
  const template = { computerColumns: 'lg:grid-cols-4', computerGap: 'lg:gap-4' };
  const classesFor = (value) => storefront.getProductGridClass(storefront.sanitizeProductGrid(value), template).split(' ');

  it('shows two per row on phones, three on tablets and the template on computers', () => {
    expect(classesFor({})).toEqual(expect.arrayContaining(['grid', 'grid-cols-2', 'gap-2', 'md:grid-cols-3', 'lg:grid-cols-4', 'lg:gap-4']));
  });

  it('shows one per row when the owner asks for it', () => {
    expect(classesFor({ phone: 1 })).toEqual(expect.arrayContaining(['grid-cols-1', 'sm:grid-cols-2', 'md:grid-cols-3']));
  });

  it.each([[3, 'lg:grid-cols-3'], [4, 'lg:grid-cols-4'], [5, 'xl:grid-cols-5'], [6, 'xl:grid-cols-6']])('%i per row on computers', (computer, className) => {
    expect(classesFor({ computer })).toContain(className);
  });
});
