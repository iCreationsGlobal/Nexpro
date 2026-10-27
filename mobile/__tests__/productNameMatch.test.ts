import { duplicateNameConflict, productNameKey } from '@/utils/productNameMatch';

describe('productNameKey', () => {
  it('compares names trimmed, with single spaces, ignoring case', () => {
    expect(productNameKey('  MacBook   M4 ')).toBe('macbook m4');
    expect(productNameKey(undefined)).toBe('');
  });
});

describe('duplicateNameConflict', () => {
  const macbook = { id: 'p1', name: 'MacBook M4', quantityOnHand: 12 };

  it('reads the existing product from a 409 for the name', () => {
    const error = { response: { status: 409, data: { code: 'DUPLICATE_PRODUCT_NAME', data: macbook } } };
    expect(duplicateNameConflict(error)).toEqual(macbook);
  });

  it('ignores other errors', () => {
    expect(duplicateNameConflict({ response: { status: 409, data: { code: 'OTHER', data: macbook } } })).toBeNull();
    expect(duplicateNameConflict({ response: { status: 400, data: { code: 'DUPLICATE_PRODUCT_NAME', data: macbook } } })).toBeNull();
    expect(duplicateNameConflict(new Error('Network Error'))).toBeNull();
    expect(duplicateNameConflict(null)).toBeNull();
  });
});
