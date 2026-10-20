const ExcelJS = require('exceljs');
const { IMPORT_COLUMNS, getTemplateCSV, parseImportFile } = require('../../../utils/importParse');

describe('product import template', () => {
  it('downloads only selected fields and always includes Product Name', () => {
    expect(getTemplateCSV('products', ['barcode', 'sellingPrice', 'barcode', 'unknown']))
      .toBe('Product Name,Selling Price,Barcode\n');
    expect(getTemplateCSV('products', [])).toBe('Product Name\n');
  });

  it('includes every supported product column', () => {
    expect(getTemplateCSV('products').trim().split(',')).toEqual(
      IMPORT_COLUMNS.products.map((column) => column.header)
    );
  });

  it('parses the full template while preserving codes, zero prices and false switches', async () => {
    const values = {
      'Product Name': 'Bottled water', SKU: '000123', Barcode: '06034000181142',
      'Product Code': '000456', 'Selling Price': '5', 'Cost Price': '2', Stock: '12',
      'Wholesale Price': '0', 'Reorder Level': '3', 'Reorder Quantity': '24',
      Brand: 'Example', Supplier: 'Supplier', 'Track Stock': 'No', Active: 'No',
      'Expiry Date': '2027-09-27', 'Batch Number': '0007', Rentable: 'Yes',
      Salable: 'No', 'Rental Rate Per Day': '4', Unit: 'pcs', Category: 'Drinks',
      Description: 'Water',
    };
    const csv = getTemplateCSV('products') + IMPORT_COLUMNS.products.map((c) => values[c.header] || '').join(',');
    const result = await parseImportFile(Buffer.from(csv), '.csv', 'products');
    expect(result.errors).toEqual([]);
    expect(result.mapped[0]).toMatchObject({
      sku: '000123', barcode: '06034000181142', productCode: '000456',
      wholesalePrice: 0, reorderQuantity: 24, trackStock: false, isActive: false,
      expiryDate: '2027-09-27', batchNumber: '0007', isRentable: true,
      isSalable: false, rentalRatePerDay: 4, brand: 'Example', supplier: 'Supplier',
    });
  });

  it('still accepts the old three-column template', async () => {
    const result = await parseImportFile(Buffer.from('Product Name,Selling Price,Stock\nWater,5,12'), '.csv', 'products');
    expect(result.errors).toEqual([]);
    expect(result.mapped).toEqual([{ name: 'Water', sellingPrice: 5, quantityOnHand: 12 }]);
  });

  it('rejects negative wholesale prices', async () => {
    const result = await parseImportFile(Buffer.from('Product Name,Wholesale Price\nWater,-1'), '.csv', 'products');
    expect(result.errors).toEqual([{ row: 2, message: 'Wholesale Price cannot be negative' }]);
  });
});

describe('reading an import file', () => {
  it('keeps each kept row\'s spreadsheet row number, past skipped and invalid rows', async () => {
    const csv = 'Product Name,Selling Price\nRice,10\n,\nOil,-1\nBeans,4';
    const result = await parseImportFile(Buffer.from(csv), '.csv', 'products');
    expect(result.mapped.map((m) => m.name)).toEqual(['Rice', 'Beans']);
    expect(result.rowNumbers).toEqual([2, 5]);
    expect(result.errors).toEqual([{ row: 4, message: 'Selling Price cannot be negative' }]);
  });

  it('allows a larger file when asked', async () => {
    const csv = ['Product Name', ...Array.from({ length: 600 }, (_, i) => `Item ${i}`)].join('\n');
    expect((await parseImportFile(Buffer.from(csv), '.csv', 'products')).errors[0].message).toBe('Maximum 500 rows allowed per file');
    expect((await parseImportFile(Buffer.from(csv), '.csv', 'products', { maxRows: 2000 })).mapped).toHaveLength(600);
  });

  it('reads Excel formulas, dates and rich text as their values', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Stock');
    sheet.addRow(['Product Name', 'Cost Price', 'Selling Price', 'Expiry Date']);
    sheet.addRow([{ richText: [{ text: 'Milo ' }, { text: '400g' }] }, 10, { formula: 'B2*1.5', result: 15 }, new Date('2027-01-31')]);
    const buffer = await workbook.xlsx.writeBuffer();

    const result = await parseImportFile(Buffer.from(buffer), '.xlsx', 'products');
    expect(result.mapped).toEqual([{ name: 'Milo 400g', costPrice: 10, sellingPrice: 15, expiryDate: '2027-01-31' }]);
  });
});
