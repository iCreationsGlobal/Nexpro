jest.mock('../../../models', () => ({ Product: { findOne: jest.fn() } }));
jest.mock('../../../middleware/upload', () => ({ baseUploadDir: require('os').tmpdir(), ensureDirExists: () => {} }));

const fs = require('fs');
const { Product } = require('../../../models');
const { photosOf, savePhotos } = require('../../../services/lynkPhotos');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 1)]);
const fetchOk = (type = 'image/png', body = PNG) => jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => type }, arrayBuffer: async () => body }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.LYNK_URL = 'https://www.lynkinfra.com';
  process.env.LYNK_PHOTO_HOSTS = 'files.lynkinfra.com';
  delete process.env.VERCEL;
});

describe('photos from Lynk AI\'s import', () => {
  it('takes only https photos from Lynk\'s own hosts, at most five', () => {
    const photos = photosOf({ photos: [
      { url: 'https://files.lynkinfra.com/p/1.png' },
      'https://www.lynkinfra.com/p/2.png',
      'http://files.lynkinfra.com/p/3.png',
      'https://evil.example/p/4.png',
      { url: 'https://169.254.169.254/latest' },
      'not a url',
    ] });
    expect(photos).toEqual(['https://files.lynkinfra.com/p/1.png', 'https://www.lynkinfra.com/p/2.png']);
    expect(photosOf({})).toEqual([]);
  });

  it('keeps ABS\'s own copy: the first is the product\'s photo, the rest its store photos', async () => {
    const product = { id: 'p1', metadata: { importBatchId: 'lynk-1' }, update: jest.fn() };
    Product.findOne.mockResolvedValue(product);
    const write = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const failed = await savePhotos({ tenantId: 't1', products: [{ id: 'p1', name: 'Kente', photos: ['https://files.lynkinfra.com/a.png', 'https://files.lynkinfra.com/b.png'] }] }, { fetchImpl: fetchOk() });
    expect(failed).toEqual([]);
    expect(write).toHaveBeenCalledTimes(2);
    const changes = product.update.mock.calls[0][0];
    expect(changes.imageUrl).toMatch(/^\/uploads\/products\/t1\/\d+-lynk-[0-9a-f]{8}\.png$/);
    expect(Object.keys(changes.metadata.storeImages)).toEqual(['B']);
    expect(changes.metadata.importBatchId).toBe('lynk-1');
    write.mockRestore();
  });

  it('a photo that isn\'t an image, or fails, is listed and never stops the rest', async () => {
    Product.findOne.mockResolvedValue({ id: 'p1', metadata: {}, update: jest.fn() });
    const failed = await savePhotos({ tenantId: 't1', products: [{ id: 'p1', name: 'Kente', photos: ['https://files.lynkinfra.com/a.html'] }] }, { fetchImpl: fetchOk('text/html') });
    expect(failed).toEqual([{ name: 'Kente', reason: 'A photo couldn\'t be kept: Not a photo' }]);
    expect(Product.findOne).not.toHaveBeenCalled();
  });
});
