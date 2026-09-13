import { describe, it, expect } from 'vitest';
import {
  getAvailableSmartReportTabs,
  getDefaultSmartReportTypeSelection,
  getSmartReportTabMeta,
  getSmartReportTypeOptionsGrouped,
} from '../../pages/reports/smart-report/smartReportTypeUtils';

describe('getSmartReportTypeOptionsGrouped rental eligibility', () => {
  it('includes rental business tabs and excludes inventory', () => {
    const groups = getSmartReportTypeOptionsGrouped({ isRental: true });
    const values = groups.flatMap((group) => group.options.map((option) => option.value));

    expect(values).toContain('rental-overview');
    expect(values).toContain('rental-inventory');
    expect(values).toContain('rental-history');
    expect(values).toContain('rental-damage');
    expect(values).toContain('sales');
    expect(values).toContain('financial');
    expect(values).not.toContain('inventory');
    expect(values).not.toContain('executive');

    const businessGroup = groups.find((group) => group.groupLabel === 'Business');
    expect(businessGroup).toBeTruthy();
    expect(businessGroup.options.map((option) => option.value)).toEqual([
      'rental-overview',
      'rental-inventory',
      'rental-history',
      'rental-damage',
    ]);

    const customersGroup = groups.find((group) => group.groupLabel === 'Customer Analytics');
    expect(customersGroup).toBeTruthy();
    expect(customersGroup.options[0].label).toBe('Customer Analytics');
  });

  it('does not include rental tabs for shop tenants', () => {
    const groups = getSmartReportTypeOptionsGrouped({ isShop: true });
    const values = groups.flatMap((group) => group.options.map((option) => option.value));

    expect(values).toContain('inventory');
    expect(values).not.toContain('rental-overview');
    expect(values).not.toContain('rental-inventory');
    expect(values).not.toContain('rental-history');
  });
});

describe('getAvailableSmartReportTabs', () => {
  it('hides shop inventory and shows rental business tabs', () => {
    const tabs = getAvailableSmartReportTabs({ isRental: true });
    const ids = tabs.map((tab) => tab.id);

    expect(ids).toContain('rental-overview');
    expect(ids).toContain('rental-history');
    expect(ids).not.toContain('inventory');
    expect(tabs.find((tab) => tab.id === 'sales')?.label).toBe('Customer Analytics');
    expect(tabs.find((tab) => tab.id === 'financial')?.label).toBe('Financial Reports');
  });
});

describe('getSmartReportTabMeta rental copy', () => {
  it('relabels sales and financial tabs for rental workspaces', () => {
    expect(getSmartReportTabMeta('sales', { isRental: true }).label).toBe('Customer Analytics');
    expect(getSmartReportTabMeta('financial', { isRental: true }).label).toBe('Financial Reports');
    expect(getSmartReportTabMeta('sales').label).toBe('Sales & Customers');
  });
});

describe('getDefaultSmartReportTypeSelection', () => {
  it('selects the rental business report tabs by default', () => {
    const selected = getDefaultSmartReportTypeSelection({ isRental: true });
    expect(selected).toEqual([
      'rental-overview',
      'rental-inventory',
      'rental-history',
      'rental-damage',
      'financial',
      'sales',
    ]);
    expect(selected).not.toContain('inventory');
    expect(selected).not.toContain('ai-insights');
  });
});
