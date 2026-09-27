const { IMPORT_COLUMNS, getTemplateCSV, parseImportFile } = require('../../../utils/importParse');

describe('product import template', () => {
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
