/**
 * Bulk import parsing: CSV/Excel to entity rows.
 * Templates are CSV only; no image columns.
 */

const ExcelJS = require('exceljs');

const MAX_ROWS = 500;

/**
 * Column definitions for import (header label -> key, type, required).
 * No image/imageUrl columns.
 */
const IMPORT_COLUMNS = {
  products: [
    { header: 'Product Name', key: 'name', type: 'string', required: true },
    { header: 'SKU', key: 'sku', type: 'string', required: false },
    { header: 'Category', key: 'categoryName', type: 'string', required: false },
    { header: 'Cost Price', key: 'costPrice', type: 'currency', required: false },
    { header: 'Selling Price', key: 'sellingPrice', type: 'currency', required: false },
    { header: 'Stock', key: 'quantityOnHand', type: 'number', required: false },
    { header: 'Reorder Level', key: 'reorderLevel', type: 'number', required: false },
    { header: 'Unit', key: 'unit', type: 'string', required: false },
    { header: 'Active', key: 'isActive', type: 'boolean', required: false },
    { header: 'Description', key: 'description', type: 'string', required: false },
    { header: 'Barcode', key: 'barcode', type: 'string', required: false },
    { header: 'Product Code', key: 'productCode', type: 'string', required: false },
    { header: 'Wholesale Price', key: 'wholesalePrice', type: 'currency', required: false },
    { header: 'Reorder Quantity', key: 'reorderQuantity', type: 'number', required: false },
    { header: 'Brand', key: 'brand', type: 'string', required: false },
    { header: 'Supplier', key: 'supplier', type: 'string', required: false },
    { header: 'Track Stock', key: 'trackStock', type: 'boolean', required: false },
    { header: 'Expiry Date', key: 'expiryDate', type: 'date', required: false },
    { header: 'Batch Number', key: 'batchNumber', type: 'string', required: false },
    { header: 'Rentable', key: 'isRentable', type: 'boolean', required: false },
    { header: 'Salable', key: 'isSalable', type: 'boolean', required: false },
    { header: 'Rental Rate Per Day', key: 'rentalRatePerDay', type: 'currency', required: false },
  ],
  materials: [
    { header: 'Name', key: 'name', type: 'string', required: true },
    { header: 'SKU', key: 'sku', type: 'string', required: false },
    { header: 'Category', key: 'categoryName', type: 'string', required: false },
    { header: 'Unit', key: 'unit', type: 'string', required: false },
    { header: 'Quantity On Hand', key: 'quantityOnHand', type: 'number', required: false },
    { header: 'Reorder Level', key: 'reorderLevel', type: 'number', required: false },
    { header: 'Unit Cost', key: 'unitCost', type: 'currency', required: false },
    { header: 'Location', key: 'location', type: 'string', required: false },
    { header: 'Active', key: 'isActive', type: 'boolean', required: false },
    { header: 'Description', key: 'description', type: 'string', required: false },
  ],
  equipment: [
    { header: 'Name', key: 'name', type: 'string', required: true },
    { header: 'Description', key: 'description', type: 'string', required: false },
    { header: 'Category', key: 'categoryName', type: 'string', required: false },
    { header: 'Purchase Date', key: 'purchaseDate', type: 'date', required: false },
    { header: 'Purchase Value', key: 'purchaseValue', type: 'currency', required: false },
    { header: 'Location', key: 'location', type: 'string', required: false },
    { header: 'Serial Number', key: 'serialNumber', type: 'string', required: false },
    { header: 'Status', key: 'status', type: 'string', required: false },
    { header: 'Notes', key: 'notes', type: 'string', required: false },
    { header: 'Active', key: 'isActive', type: 'boolean', required: false },
  ],
  customers: [
    { header: 'Name', key: 'name', type: 'string', required: true },
    { header: 'Phone', key: 'phone', type: 'string', required: false },
    { header: 'Email', key: 'email', type: 'string', required: false },
    { header: 'Company', key: 'company', type: 'string', required: false },
    { header: 'Address', key: 'address', type: 'string', required: false },
    { header: 'City', key: 'city', type: 'string', required: false },
    { header: 'Notes', key: 'notes', type: 'string', required: false },
  ],
  leads: [
    { header: 'Name', key: 'name', type: 'string', required: true },
    { header: 'Phone', key: 'phone', type: 'string', required: false },
    { header: 'Email', key: 'email', type: 'string', required: false },
    { header: 'Company', key: 'company', type: 'string', required: false },
    { header: 'Source', key: 'source', type: 'string', required: false },
    { header: 'Notes', key: 'notes', type: 'string', required: false },
  ],
};

const TEMPLATE_COLUMNS = {
  customers: ['Name', 'Phone'],
  leads: ['Name', 'Phone'],
};

/**
 * Get CSV template (header row only) for an entity.
 * @param {'products'|'materials'|'equipment'|'customers'|'leads'} entity
 * @returns {string}
 */
function getTemplateCSV(entity) {
  const cols = IMPORT_COLUMNS[entity];
  if (!cols) return '';
  const templateHeaders = TEMPLATE_COLUMNS[entity];
  const headers = (templateHeaders || cols.map((c) => c.header)).map(escapeCSV);
  return headers.join(',') + '\n';
}

function escapeCSV(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Parse CSV buffer or string to array of row objects (first row = headers).
 * @param {Buffer|string} input
 * @returns {{ headers: string[], rows: Array<Record<string, string>> }}
 */
function parseCSV(input) {
  const text = Buffer.isBuffer(input) ? input.toString('utf-8') : String(input);
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      current += c;
    } else if ((c === '\n' && !inQuotes) || (c === '\r' && !inQuotes)) {
      if (current.trim()) lines.push(current);
      current = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += c;
    }
  }
  if (current.trim()) lines.push(current);

  const rows = [];
  for (const line of lines) {
    const fields = parseCSVLine(line);
    rows.push(fields);
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h).trim());
  const dataRows = rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] != null ? String(cells[i]).trim() : '';
    });
    return obj;
  });
  return { headers, rows: dataRows };
}

function parseCSVLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((c === ',' && !inQuotes) || (c === '\n' && !inQuotes)) {
      out.push(current);
      current = '';
      if (c === '\n') break;
    } else {
      current += c;
    }
  }
  out.push(current);
  return out;
}

/**
 * Parse Excel buffer; first row = headers.
 * @param {Buffer} buffer
 * @returns {Promise<{ headers: string[], rows: Array<Record<string, string>> }>}
 */
async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = cell.value;
      cells[colNumber - 1] = v != null ? String(v).trim() : '';
    });
    rows.push(cells);
  });
  if (rows.length === 0) return { headers: [], rows: [] };
  const headerCells = rows[0];
  const maxCol = Math.max(...rows.map((r) => r.length), headerCells.length);
  const headers = [];
  for (let c = 0; c < maxCol; c++) {
    headers.push(headerCells[c] != null ? String(headerCells[c]).trim() : `Column${c + 1}`);
  }
  const dataRows = rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] != null ? String(cells[i]).trim() : '';
    });
    return obj;
  });
  return { headers, rows: dataRows };
}

function coerceValue(raw, type) {
  const s = raw == null ? '' : String(raw).trim();
  if (s === '') return type === 'string' ? '' : null;
  switch (type) {
    case 'number': {
      const n = parseFloat(s.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'currency': {
      const n = parseFloat(s.replace(/,/g, '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return /^(1|true|yes|y)$/i.test(s);
    case 'date': {
      if (!s) return null;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    default:
      return s;
  }
}

/**
 * Map raw row (header -> value) to entity object using IMPORT_COLUMNS.
 * @param {Record<string, string>} row - keys are header labels
 * @param {'products'|'materials'|'equipment'|'customers'|'leads'} entity
 * @returns {Record<string, any>}
 */
function mapRowToEntity(row, entity) {
  const cols = IMPORT_COLUMNS[entity];
  if (!cols) return {};
  const out = {};
  for (const col of cols) {
    const raw = row[col.header] ?? row[col.key] ?? '';
    const val = coerceValue(raw, col.type);
    if (val !== null && val !== '') {
      out[col.key] = val;
    }
  }
  return out;
}

/**
 * Validate product row (required fields, non-negative numbers).
 */
function validateProductRow(mapped) {
  if (!mapped.name || String(mapped.name).trim() === '') {
    return { valid: false, error: 'Product Name is required' };
  }
  const cost = parseFloat(mapped.costPrice);
  const selling = parseFloat(mapped.sellingPrice);
  const qty = parseFloat(mapped.quantityOnHand);
  if (Number.isFinite(cost) && cost < 0) return { valid: false, error: 'Cost Price cannot be negative' };
  if (Number.isFinite(selling) && selling < 0) return { valid: false, error: 'Selling Price cannot be negative' };
  if (Number.isFinite(qty) && qty < 0) return { valid: false, error: 'Stock cannot be negative' };
  for (const key of ['wholesalePrice', 'reorderLevel', 'reorderQuantity', 'rentalRatePerDay']) {
    if (mapped[key] != null && mapped[key] < 0) {
      const column = IMPORT_COLUMNS.products.find((col) => col.key === key);
      return { valid: false, error: `${column.header} cannot be negative` };
    }
  }
  return { valid: true };
}

/**
 * Validate material row.
 */
function validateMaterialRow(mapped) {
  if (!mapped.name || String(mapped.name).trim() === '') {
    return { valid: false, error: 'Name is required' };
  }
  const qty = parseFloat(mapped.quantityOnHand);
  const cost = parseFloat(mapped.unitCost);
  if (Number.isFinite(qty) && qty < 0) return { valid: false, error: 'Quantity On Hand cannot be negative' };
  if (Number.isFinite(cost) && cost < 0) return { valid: false, error: 'Unit Cost cannot be negative' };
  return { valid: true };
}

/**
 * Validate equipment row.
 */
function validateEquipmentRow(mapped) {
  if (!mapped.name || String(mapped.name).trim() === '') {
    return { valid: false, error: 'Name is required' };
  }
  const val = parseFloat(mapped.purchaseValue);
  if (Number.isFinite(val) && val < 0) return { valid: false, error: 'Purchase Value cannot be negative' };
  const status = mapped.status ? String(mapped.status).toLowerCase() : '';
  if (status && !['active', 'disposed', 'sold'].includes(status)) {
    return { valid: false, error: 'Status must be active, disposed, or sold' };
  }
  return { valid: true };
}

/**
 * Validate customer/lead contact row.
 */
function validateContactRow(mapped) {
  if (!mapped.name || String(mapped.name).trim() === '') {
    return { valid: false, error: 'Name is required' };
  }
  return { valid: true };
}

/**
 * Parse file (CSV or Excel) and map to entity rows with validation.
 * @param {Buffer} buffer
 * @param {string} mimeTypeOrExt - e.g. 'text/csv', '.csv', 'application/vnd.openxmlformats...'
 * @param {'products'|'materials'|'equipment'|'customers'|'leads'} entity
 * @returns {Promise<{ mapped: Array<Record<string, any>>, errors: Array<{ row: number, message: string }> }>}
 */
async function parseImportFile(buffer, mimeTypeOrExt, entity) {
  const isExcel =
    mimeTypeOrExt &&
    (mimeTypeOrExt.includes('spreadsheet') ||
      mimeTypeOrExt.includes('excel') ||
      String(mimeTypeOrExt).toLowerCase().endsWith('.xlsx'));
  let headers;
  let rows;
  if (isExcel) {
    const parsed = await parseExcel(buffer);
    headers = parsed.headers;
    rows = parsed.rows;
  } else {
    const parsed = parseCSV(buffer);
    headers = parsed.headers;
    rows = parsed.rows;
  }

  if (rows.length > MAX_ROWS) {
    return {
      mapped: [],
      errors: [{ row: 0, message: `Maximum ${MAX_ROWS} rows allowed per file` }],
    };
  }

  const cols = IMPORT_COLUMNS[entity];
  if (!cols) {
    return {
      mapped: [],
      errors: [{ row: 0, message: `Unknown import entity: ${entity}` }],
    };
  }

  const validator =
    entity === 'products'
      ? validateProductRow
      : entity === 'materials'
        ? validateMaterialRow
        : entity === 'equipment'
          ? validateEquipmentRow
          : validateContactRow;

  const mapped = [];
  const errors = [];
  rows.forEach((row, index) => {
    const rowNum = index + 2; // 1-based + header
    const m = mapRowToEntity(row, entity);
    if (Object.keys(m).length === 0) return; // skip empty row
    const v = validator(m);
    if (!v.valid) {
      errors.push({ row: rowNum, message: v.error });
      return;
    }
    mapped.push(m);
  });

  return { mapped, errors };
}

module.exports = {
  IMPORT_COLUMNS,
  getTemplateCSV,
  parseCSV,
  parseExcel,
  mapRowToEntity,
  parseImportFile,
  validateProductRow,
  validateMaterialRow,
  validateEquipmentRow,
  validateContactRow,
  MAX_ROWS,
};
