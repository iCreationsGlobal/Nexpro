/**
 * Data Export Utility
 * 
 * Provides CSV and Excel export functionality for data tables.
 */

const ExcelJS = require('exceljs');

/**
 * Convert data array to CSV string
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of column definitions { key, header }
 * @returns {string} - CSV string
 */
const toCSV = (data, columns) => {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  // Use provided columns or infer from first row
  const cols = columns || Object.keys(data[0]).map(key => ({ key, header: key }));

  // Header row
  const headers = cols.map(col => escapeCSVValue(col.header || col.key));
  const headerRow = headers.join(',');

  // Data rows
  const rows = data.map(row => {
    return cols.map(col => {
      const value = getNestedValue(row, col.key);
      return escapeCSVValue(formatValue(value, col.type));
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
};

/**
 * Escape special characters in CSV value
 * @param {any} value - Value to escape
 * @returns {string} - Escaped value
 */
const escapeCSVValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If value contains comma, newline, or quote, wrap in quotes and escape existing quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot-notation path (e.g., 'customer.name')
 * @returns {any} - Value at path
 */
const getNestedValue = (obj, path) => {
  if (!path) return obj;
  
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
};

/**
 * Format value based on type
 * @param {any} value - Value to format
 * @param {string} type - Type: 'date', 'datetime', 'currency', 'boolean'
 * @returns {string} - Formatted value
 */
const formatValue = (value, type) => {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'date':
      if (value instanceof Date) {
        return value.toISOString().split('T')[0];
      }
      if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toISOString().split('T')[0];
      }
      return String(value);

    case 'datetime':
      if (value instanceof Date) {
        return value.toISOString().replace('T', ' ').slice(0, 19);
      }
      if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toISOString().replace('T', ' ').slice(0, 19);
      }
      return String(value);

    case 'currency':
      const num = parseFloat(value);
      return isNaN(num) ? String(value) : num.toFixed(2);

    case 'boolean':
      return value ? 'Yes' : 'No';

    default:
      return String(value);
  }
};

/**
 * Create Excel workbook from data
 * @param {Array} data - Array of objects to export
 * @param {Object} options - Export options
 * @returns {Promise<Buffer>} - Excel file buffer
 */
const toExcel = async (data, options = {}) => {
  const {
    columns,
    sheetName = 'Data',
    title = '',
    includeTimestamp = true,
  } = options;

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No data to export');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'African Business Suite';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  // Use provided columns or infer from first row
  const cols = columns || Object.keys(data[0]).map(key => ({ 
    key, 
    header: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  }));

  let startRow = 1;

  // Add title if provided
  if (title) {
    worksheet.mergeCells(1, 1, 1, cols.length);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };
    startRow = 2;

    // Add timestamp
    if (includeTimestamp) {
      worksheet.mergeCells(2, 1, 2, cols.length);
      const timestampCell = worksheet.getCell(2, 1);
      timestampCell.value = `Generated on ${new Date().toLocaleString()}`;
      timestampCell.font = { italic: true, size: 10 };
      timestampCell.alignment = { horizontal: 'center' };
      startRow = 4;
    }
  }

  // Set up columns
  worksheet.columns = cols.map((col, index) => ({
    header: col.header || col.key,
    key: col.key,
    width: col.width || Math.max(12, (col.header || col.key).length + 2),
  }));

  // Add header row at startRow
  if (startRow > 1) {
    // If we have title, we need to manually add header row
    const headerRow = worksheet.getRow(startRow);
    cols.forEach((col, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = col.header || col.key;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF166534' } // Primary green color
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });
    startRow++;
  } else {
    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF166534' }
    };
    headerRow.alignment = { horizontal: 'center' };
    startRow = 2;
  }

  // Add data rows
  data.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(startRow + rowIndex);
    cols.forEach((col, colIndex) => {
      const value = getNestedValue(row, col.key);
      const cell = excelRow.getCell(colIndex + 1);
      cell.value = formatExcelValue(value, col.type);
      
      // Apply number format for currency
      if (col.type === 'currency') {
        cell.numFmt = '#,##0.00';
      }
    });
    
    // Alternate row colors
    if (rowIndex % 2 === 1) {
      excelRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' }
      };
    }
  });

  // Add borders
  const lastRow = startRow + data.length - 1;
  const lastCol = cols.length;
  
  for (let row = startRow - 1; row <= lastRow; row++) {
    for (let col = 1; col <= lastCol; col++) {
      worksheet.getCell(row, col).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
  }

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: startRow - 1 }];

  // Generate buffer
  return await workbook.xlsx.writeBuffer();
};

/**
 * Format value for Excel
 * @param {any} value - Value to format
 * @param {string} type - Type hint
 * @returns {any} - Formatted value
 */
const formatExcelValue = (value, type) => {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'date':
    case 'datetime':
      if (value instanceof Date) {
        return value;
      }
      if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date;
      }
      return value;

    case 'currency':
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? value : num;

    case 'boolean':
      return value ? 'Yes' : 'No';

    default:
      return value;
  }
};

/**
 * Express middleware helper to send CSV response
 * @param {Object} res - Express response
 * @param {Array} data - Data to export
 * @param {string} filename - File name
 * @param {Array} columns - Column definitions
 */
const sendCSV = (res, data, filename, columns) => {
  const csv = toCSV(data, columns);
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
};

/**
 * Express middleware helper to send Excel response
 * @param {Object} res - Express response
 * @param {Array} data - Data to export
 * @param {string} filename - File name
 * @param {Object} options - Export options
 */
const sendExcel = async (res, data, filename, options = {}) => {
  const buffer = await toExcel(data, options);
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
};

/**
 * Standard column definitions for common entities
 */
const COLUMN_DEFINITIONS = {
  customers: [
    { key: 'name', header: 'Name' },
    { key: 'company', header: 'Company' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'address', header: 'Address' },
    { key: 'status', header: 'Status' },
    { key: 'source', header: 'Source' },
    { key: 'balance', header: 'Balance', type: 'currency' },
    { key: 'createdAt', header: 'Created', type: 'datetime' },
  ],
  products: [
    { key: 'name', header: 'Product Name' },
    { key: 'sku', header: 'SKU' },
    { key: 'category.name', header: 'Category' },
    { key: 'costPrice', header: 'Cost Price', type: 'currency' },
    { key: 'sellingPrice', header: 'Selling Price', type: 'currency' },
    { key: 'quantityOnHand', header: 'Stock', type: 'number' },
    { key: 'reorderLevel', header: 'Reorder Level', type: 'number' },
    { key: 'unit', header: 'Unit' },
    { key: 'isActive', header: 'Active', type: 'boolean' },
    // Same headers as the import template, so an export can be edited and imported elsewhere.
    { key: 'metadata.productCode', header: 'Product Code' },
    { key: 'barcode', header: 'Barcode' },
    { key: 'brand', header: 'Brand' },
    { key: 'wholesalePrice', header: 'Wholesale Price', type: 'currency' },
    { key: 'reorderQuantity', header: 'Reorder Quantity', type: 'number' },
    { key: 'trackStock', header: 'Track Stock', type: 'boolean' },
    { key: 'description', header: 'Description' },
  ],
  invoices: [
    { key: 'invoiceNumber', header: 'Invoice #' },
    { key: 'customer.name', header: 'Customer' },
    { key: 'invoiceDate', header: 'Date', type: 'date' },
    { key: 'dueDate', header: 'Due Date', type: 'date' },
    { key: 'subtotal', header: 'Subtotal', type: 'currency' },
    { key: 'tax', header: 'Tax', type: 'currency' },
    { key: 'total', header: 'Total', type: 'currency' },
    { key: 'amountPaid', header: 'Paid', type: 'currency' },
    { key: 'status', header: 'Status' },
  ],
  sales: [
    { key: 'saleNumber', header: 'Sale #' },
    { key: 'customer.name', header: 'Customer' },
    { key: 'createdAt', header: 'Date', type: 'datetime' },
    { key: 'subtotal', header: 'Subtotal', type: 'currency' },
    { key: 'discount', header: 'Discount', type: 'currency' },
    { key: 'tax', header: 'Tax', type: 'currency' },
    { key: 'total', header: 'Total', type: 'currency' },
    { key: 'paymentMethod', header: 'Payment' },
    { key: 'status', header: 'Status' },
  ],
  leads: [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'company', header: 'Company' },
    { key: 'source', header: 'Source' },
    { key: 'status', header: 'Status' },
    { key: 'assignee.name', header: 'Assigned To' },
    { key: 'estimatedValue', header: 'Value', type: 'currency' },
    { key: 'createdAt', header: 'Created', type: 'datetime' },
  ],
  expenses: [
    { key: 'expenseNumber', header: 'Expense #' },
    { key: 'vendor.name', header: 'Vendor' },
    { key: 'category', header: 'Category' },
    { key: 'description', header: 'Description' },
    { key: 'amount', header: 'Amount', type: 'currency' },
    { key: 'expenseDate', header: 'Date', type: 'date' },
    { key: 'status', header: 'Status' },
    { key: 'paymentMethod', header: 'Payment' },
  ],
  inventory: [
    { key: 'name', header: 'Item Name' },
    { key: 'sku', header: 'SKU' },
    { key: 'category.name', header: 'Category' },
    { key: 'quantityOnHand', header: 'Quantity', type: 'number' },
    { key: 'reorderLevel', header: 'Reorder Level', type: 'number' },
    { key: 'unit', header: 'Unit' },
    { key: 'unitCost', header: 'Unit Cost', type: 'currency' },
    { key: 'location', header: 'Location' },
    { key: 'preferredVendor.name', header: 'Vendor' },
  ],
  jobs: [
    { key: 'jobNumber', header: 'Job #' },
    { key: 'title', header: 'Title' },
    { key: 'customer.name', header: 'Customer' },
    { key: 'status', header: 'Status' },
    { key: 'priority', header: 'Priority' },
    { key: 'dueDate', header: 'Due Date', type: 'date' },
    { key: 'finalPrice', header: 'Amount', type: 'currency' },
    { key: 'assignedUser.name', header: 'Assigned To' },
    { key: 'createdAt', header: 'Created', type: 'datetime' },
  ],
  quotes: [
    { key: 'quoteNumber', header: 'Quote #' },
    { key: 'customer.name', header: 'Customer' },
    { key: 'title', header: 'Title' },
    { key: 'status', header: 'Status' },
    { key: 'validUntil', header: 'Valid Until', type: 'date' },
    { key: 'subtotal', header: 'Subtotal', type: 'currency' },
    { key: 'discountTotal', header: 'Discount', type: 'currency' },
    { key: 'totalAmount', header: 'Total', type: 'currency' },
    { key: 'createdAt', header: 'Created', type: 'datetime' },
  ],
  vendors: [
    { key: 'name', header: 'Name' },
    { key: 'company', header: 'Company' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'address', header: 'Address' },
    { key: 'category', header: 'Category' },
    { key: 'paymentTerms', header: 'Payment Terms' },
    { key: 'balance', header: 'Balance', type: 'currency' },
    { key: 'isActive', header: 'Active', type: 'boolean' },
    { key: 'createdAt', header: 'Created', type: 'datetime' },
  ],
  equipment: [
    { key: 'name', header: 'Name' },
    { key: 'serialNumber', header: 'Serial #' },
    { key: 'category.name', header: 'Category' },
    { key: 'vendor.name', header: 'Vendor' },
    { key: 'purchaseDate', header: 'Purchase Date', type: 'date' },
    { key: 'purchaseValue', header: 'Purchase Value', type: 'currency' },
    { key: 'location', header: 'Location' },
    { key: 'status', header: 'Status' },
    { key: 'isActive', header: 'Active', type: 'boolean' },
  ],
};

module.exports = {
  toCSV,
  toExcel,
  sendCSV,
  sendExcel,
  escapeCSVValue,
  getNestedValue,
  formatValue,
  COLUMN_DEFINITIONS,
};
