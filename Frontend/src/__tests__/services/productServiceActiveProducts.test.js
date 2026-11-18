import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../services/api';
import productService from '../../services/productService';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() }, postFormDataWithProgress: vi.fn() }));
vi.mock('../../utils/shopScope', () => ({
  withActiveShopScope: (params) => ({ ...params, shopId: 'shop-a' }),
  buildScopedQueryString: () => '',
}));

const page = (n, totalPages) => ({
  success: true,
  data: Array.from({ length: n === totalPages ? 7 : 100 }, (_, i) => ({ id: `p${n}-${i}`, name: `Product ${n}-${i}` })),
  pagination: { page: n, limit: 100, totalPages, total: (totalPages - 1) * 100 + 7 },
});

describe('getAllActiveProducts', () => {
  beforeEach(() => { api.get.mockReset(); });

  it('loads every page instead of stopping at the server limit of 100', async () => {
    api.get.mockImplementation(async (url) => page(Number(new URLSearchParams(url.split('?')[1]).get('page')), 3));
    const products = await productService.getAllActiveProducts();
    expect(products).toHaveLength(207);
    expect(api.get).toHaveBeenCalledTimes(3);
    const query = new URLSearchParams(api.get.mock.calls[0][0].split('?')[1]);
    expect(query.get('limit')).toBe('100');
    expect(query.get('isActive')).toBe('true');
    expect(query.get('shopId')).toBe('shop-a');
  });

  it('makes one request for small catalogs and keeps each product once', async () => {
    api.get.mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'a' }, { id: 'b' }], pagination: { totalPages: 1 } });
    expect(await productService.getAllActiveProducts()).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
