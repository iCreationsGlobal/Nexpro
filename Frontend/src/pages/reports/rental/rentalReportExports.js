import dayjs from 'dayjs';
import { showSuccess } from '../../../utils/toast';

/**
 * Escape a CSV cell value per RFC 4180.
 * @param {unknown} value
 * @returns {string}
 */
export const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * Build CSV string from headers, data rows, and optional metadata rows.
 * @param {string[]} headers
 * @param {unknown[][]} rows
 * @param {unknown[][]} [metaRows]
 * @returns {string}
 */
export const rowsToCsv = (headers, rows, metaRows = []) => {
  const lines = [
    ...metaRows.map((row) => row.map(escapeCsvCell).join(',')),
    ...(metaRows.length ? [''] : []),
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return lines.join('\n');
};

/**
 * Trigger a client-side CSV download.
 * @param {string} csvContent
 * @param {string} filename
 */
export const downloadCsvFile = (csvContent, filename) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

/**
 * Metadata rows describing export scope (period + branch).
 * @param {{ dateRange?: import('dayjs').Dayjs[], branchScopeLabel?: string }} params
 * @returns {string[][]}
 */
export const buildRentalExportMetaRows = ({ dateRange, branchScopeLabel }) => {
  const start = dateRange?.[0]?.format?.('YYYY-MM-DD') || '';
  const end = dateRange?.[1]?.format?.('YYYY-MM-DD') || '';
  return [
    ['Report', 'Rental Report Export'],
    ['Period', `${start} to ${end}`],
    ['Branch scope', branchScopeLabel || 'All branches'],
    ['Generated', dayjs().format('YYYY-MM-DD HH:mm')],
  ];
};

/**
 * Build a scoped rental CSV filename.
 * @param {string} slug
 * @param {import('dayjs').Dayjs[]} dateRange
 * @returns {string}
 */
export const buildRentalExportFilename = (slug, dateRange) => {
  const start = dateRange?.[0]?.format?.('YYYY-MM-DD') || 'start';
  const end = dateRange?.[1]?.format?.('YYYY-MM-DD') || 'end';
  return `rental_${slug}_${start}_${end}.csv`;
};

/**
 * Download CSV and show success toast.
 * @param {string} csvContent
 * @param {string} filename
 */
const downloadAndNotify = (csvContent, filename) => {
  downloadCsvFile(csvContent, filename);
  showSuccess('CSV downloaded successfully');
};

const formatDamageType = (type) => String(type || 'other').replace(/_/g, ' ');

/**
 * Export revenue-by-product table as CSV.
 * @param {object[]} rows
 * @param {{ dateRange: import('dayjs').Dayjs[], branchScopeLabel?: string }} scope
 */
export const exportRevenueByProductCsv = (rows, scope) => {
  if (!rows?.length) return;
  const meta = buildRentalExportMetaRows(scope);
  const headers = ['Product', 'SKU', 'Quantity Rented', 'Rental Count', 'Revenue'];
  const dataRows = rows.map((row) => [
    row.productName,
    row.sku || '',
    row.quantityRented ?? 0,
    row.rentalCount ?? 0,
    row.revenue ?? 0,
  ]);
  const csv = rowsToCsv(headers, dataRows, meta);
  downloadAndNotify(csv, buildRentalExportFilename('revenue_by_product', scope.dateRange));
};

/**
 * Export late-return incidents as CSV.
 * @param {object[]} incidents
 * @param {object} summary
 * @param {{ dateRange: import('dayjs').Dayjs[], branchScopeLabel?: string }} scope
 */
export const exportLateReturnsCsv = (incidents, summary, scope) => {
  if (!incidents?.length) return;
  const meta = [
    ...buildRentalExportMetaRows(scope),
    ['Late return count', summary?.lateReturnCount ?? 0],
    ['Total days late', summary?.totalDaysLate ?? 0],
    ['Total late charges', summary?.totalLateCharges ?? 0],
    ['Pending late charges', summary?.pendingLateCharges ?? 0],
  ];
  const headers = [
    'Customer',
    'Branch',
    'Scheduled End',
    'Actual Return',
    'Days Late',
    'Late Charge',
    'Rental ID',
  ];
  const dataRows = incidents.map((row) => [
    row.customerName,
    row.branchName,
    row.scheduledEndDate || '',
    row.actualReturnDate || '',
    row.daysLate ?? 0,
    row.lateChargeAmount ?? 0,
    row.rentalId || '',
  ]);
  const csv = rowsToCsv(headers, dataRows, meta);
  downloadAndNotify(csv, buildRentalExportFilename('late_returns', scope.dateRange));
};

/**
 * Export utilization-by-product table as CSV.
 * @param {object[]} rows
 * @param {object} totals
 * @param {{ dateRange: import('dayjs').Dayjs[], branchScopeLabel?: string }} scope
 */
export const exportUtilizationCsv = (rows, totals, scope) => {
  if (!rows?.length) return;
  const meta = [
    ...buildRentalExportMetaRows(scope),
    ['Overall utilization rate', `${Number(totals?.overallUtilizationRate || 0).toFixed(1)}%`],
    ['Total rented days', totals?.totalRentedDays ?? 0],
    ['Total available days', totals?.totalAvailableDays ?? 0],
  ];
  const headers = [
    'Product',
    'SKU',
    'Units',
    'Rented Days',
    'Available Days',
    'Utilization Rate (%)',
  ];
  const dataRows = rows.map((row) => [
    row.productName,
    row.sku || '',
    row.units ?? 0,
    row.rentedDays ?? 0,
    row.availableDays ?? 0,
    Number(row.utilizationRate || 0).toFixed(1),
  ]);
  const csv = rowsToCsv(headers, dataRows, meta);
  downloadAndNotify(csv, buildRentalExportFilename('utilization', scope.dateRange));
};

/**
 * Export damage-by-type table as CSV.
 * @param {object[]} rows
 * @param {object} totals
 * @param {{ dateRange: import('dayjs').Dayjs[], branchScopeLabel?: string }} scope
 */
export const exportDamageByTypeCsv = (rows, totals, scope) => {
  if (!rows?.length) return;
  const meta = [
    ...buildRentalExportMetaRows(scope),
    ['Total damage reports', totals?.reportCount ?? 0],
    ['Total damage cost', totals?.totalCost ?? 0],
  ];
  const headers = ['Damage Type', 'Report Count', 'Total Cost'];
  const dataRows = rows.map((row) => [
    formatDamageType(row.damageType),
    row.reportCount ?? 0,
    row.totalCost ?? 0,
  ]);
  const csv = rowsToCsv(headers, dataRows, meta);
  downloadAndNotify(csv, buildRentalExportFilename('damage_by_type', scope.dateRange));
};
