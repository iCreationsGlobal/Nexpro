import { filterDeviceContactRows } from '@/utils/filterDeviceContacts';
import type { DeviceContactRow } from '@/utils/deviceContactMapping';

const rows: DeviceContactRow[] = [
  { id: '1', name: 'Jane Doe', phone: '0241234567', email: 'jane@example.com' },
  { id: '2', name: 'Aaron Smith', phone: '0559876543', company: 'Acme Ltd' },
  { id: '3', name: 'Bob', email: 'bob@test.com' },
];

describe('filterDeviceContactRows', () => {
  it('returns all rows when search is empty', () => {
    expect(filterDeviceContactRows(rows, '')).toHaveLength(3);
    expect(filterDeviceContactRows(rows, '   ')).toHaveLength(3);
  });

  it('filters by name', () => {
    expect(filterDeviceContactRows(rows, 'aaron')).toEqual([rows[1]]);
  });

  it('filters by phone', () => {
    expect(filterDeviceContactRows(rows, '241234567')).toEqual([rows[0]]);
  });

  it('filters by email or company', () => {
    expect(filterDeviceContactRows(rows, 'bob@test')).toEqual([rows[2]]);
    expect(filterDeviceContactRows(rows, 'acme')).toEqual([rows[1]]);
  });

  it('is case insensitive', () => {
    expect(filterDeviceContactRows(rows, 'JANE')).toEqual([rows[0]]);
  });
});
