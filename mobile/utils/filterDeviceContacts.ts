import type { DeviceContactRow } from '@/utils/deviceContactMapping';

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Filter device contact rows by name, phone, email, or company (client-side).
 */
export function filterDeviceContactRows(
  rows: DeviceContactRow[],
  searchText: string
): DeviceContactRow[] {
  const query = normalizeSearchText(searchText);
  if (!query) return rows;

  return rows.filter((row) => {
    const haystack = [row.name, row.phone, row.email, row.company]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}
