jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/utils/shopScope', () => ({
  buildScopedQueryString: jest.fn(async () => 'page=1&limit=20'),
  withActiveShopScope: jest.fn(async (data) => data),
}));

import { api } from '@/services/api';
import { productService } from '@/services/productService';

describe('productService.adjustStock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts receive stock adjustments to the adjust-stock endpoint', async () => {
    jest.mocked(api.post).mockResolvedValue({ data: { success: true } });

    await productService.adjustStock('product-1', 6, 'delta', 'Receive stock');

    expect(api.post).toHaveBeenCalledWith('/products/product-1/adjust-stock', {
      quantity: 6,
      mode: 'delta',
      reason: 'Receive stock',
      type: 'receive',
    });
  });

  it('includes variantId when restocking a variant', async () => {
    jest.mocked(api.post).mockResolvedValue({ data: { success: true } });

    await productService.adjustStock('product-1', 2, 'delta', 'Receive stock', {
      variantId: 'variant-1',
      type: 'receive',
    });

    expect(api.post).toHaveBeenCalledWith('/products/product-1/adjust-stock', {
      quantity: 2,
      mode: 'delta',
      reason: 'Receive stock',
      type: 'receive',
      variantId: 'variant-1',
    });
  });
});

describe('productService.deleteProductVariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls DELETE /products/variants/:variantId', async () => {
    jest.mocked(api.delete).mockResolvedValue({
      data: { success: true, message: 'Variant deleted successfully' },
    });

    const result = await productService.deleteProductVariant('variant-1');

    expect(api.delete).toHaveBeenCalledWith('/products/variants/variant-1');
    expect(result).toEqual({ success: true, message: 'Variant deleted successfully' });
  });
});

describe('productService.createProductVariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts a new variant under the product', async () => {
    jest.mocked(api.post).mockResolvedValue({
      data: { success: true, data: { id: 'variant-2', name: 'Medium' } },
    });

    const result = await productService.createProductVariant('product-1', {
      name: 'Medium',
      sellingPrice: 40,
      quantityOnHand: 3,
      attributes: { size: 'M' },
    });

    expect(api.post).toHaveBeenCalledWith('/products/product-1/variants', {
      name: 'Medium',
      sellingPrice: 40,
      quantityOnHand: 3,
      attributes: { size: 'M' },
    });
    expect(result).toEqual({ success: true, data: { id: 'variant-2', name: 'Medium' } });
  });
});

describe('productService.getProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nulls inline product images after parse', async () => {
    const inline = 'data:image/jpeg;base64,abc';
    jest.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 'p1', name: 'Banner', imageUrl: inline }],
      },
    });

    const result = await productService.getProducts({ page: 1, limit: 20 });
    expect(result.data[0].imageUrl).toBeNull();
    expect(result.data[0].name).toBe('Banner');
  });

  it('nulls oversized inline product images after parse', async () => {
    const huge = `data:image/jpeg;base64,${'x'.repeat(200_001)}`;
    jest.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 'p1', name: 'Banner', imageUrl: huge }],
      },
    });

    const result = await productService.getProducts({ page: 1, limit: 20 });
    expect(result.data[0].imageUrl).toBeNull();
    expect(result.data[0].name).toBe('Banner');
  });
});
