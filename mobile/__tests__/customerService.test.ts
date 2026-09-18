jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));
jest.mock('@/utils/shopScope', () => ({ buildScopedQueryString: jest.fn(async () => 'page=1&limit=20&shopId=shop-a'), withActiveShopScope: jest.fn() }));
import { api } from '@/services/api';
import { customerService } from '@/services/customerService';
import { buildScopedQueryString } from '@/utils/shopScope';
describe('customer list request controls', () => {
 beforeEach(() => jest.clearAllMocks());
 it('passes cancellation and a bounded timeout without changing scope or response shape', async () => {
  const controller = new AbortController();
  const response = { success: true, data: [{id:'customer-a'}] };
  (api.get as jest.Mock).mockResolvedValue({data:response});
  expect(await customerService.getCustomers({page:1,limit:20}, {signal:controller.signal,timeout:15000})).toBe(response);
  expect(buildScopedQueryString).toHaveBeenCalledWith({page:1,limit:20});
  expect(api.get).toHaveBeenCalledWith('/customers?page=1&limit=20&shopId=shop-a',{signal:controller.signal,timeout:15000});
 });
 it('preserves existing callers without request options', async () => {
  (api.get as jest.Mock).mockResolvedValue({data:{data:[]}});
  await customerService.getCustomers();
  expect(api.get).toHaveBeenCalledWith(expect.any(String),{});
 });
});
