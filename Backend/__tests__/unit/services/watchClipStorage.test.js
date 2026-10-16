const STORAGE_ENV = [
  'WATCH_STORAGE_BUCKET',
  'WATCH_STORAGE_ENDPOINT',
  'WATCH_STORAGE_REGION',
  'WATCH_STORAGE_ACCESS_KEY_ID',
  'WATCH_STORAGE_SECRET_ACCESS_KEY',
  'VERCEL',
];

const loadStorage = (env = {}) => {
  jest.resetModules();
  STORAGE_ENV.forEach((key) => delete process.env[key]);
  Object.assign(process.env, env);
  return require('../../../services/watchClipStorage');
};

const BUCKET_ENV = {
  WATCH_STORAGE_BUCKET: 'abs-watch-clips',
  WATCH_STORAGE_ENDPOINT: 'https://example-account.r2.cloudflarestorage.com',
  WATCH_STORAGE_ACCESS_KEY_ID: 'test-key-id',
  WATCH_STORAGE_SECRET_ACCESS_KEY: 'test-secret',
};

describe('watchClipStorage', () => {
  afterAll(() => {
    STORAGE_ENV.forEach((key) => delete process.env[key]);
  });

  it('uses the bucket when configured, the disk on servers that have one, and nothing on serverless', () => {
    expect(loadStorage(BUCKET_ENV).clipUploadMode()).toBe('presigned');
    expect(loadStorage({}).clipUploadMode()).toBe('direct');
    expect(loadStorage({ VERCEL: '1' }).clipUploadMode()).toBe('disabled');
  });

  it('signs a size-locked upload to a workspace-scoped key', async () => {
    const storage = loadStorage(BUCKET_ENV);
    const target = await storage.createClipUpload({ tenantId: 't1', cameraId: 'cam-1', contentType: 'video/mp4', sizeBytes: 2048 });

    expect(target.mode).toBe('presigned');
    expect(target.method).toBe('PUT');
    expect(target.clipReference).toMatch(/^storage:watch\/t1\/\d+-cam-1-[0-9a-f]{8}\.mp4$/);
    expect(target.headers).toEqual({ 'Content-Type': 'video/mp4', 'Content-Length': '2048' });
    const url = new URL(target.uploadUrl);
    expect(url.pathname).toContain('/abs-watch-clips/watch/t1/');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  });

  it('refuses missing or oversized clips', async () => {
    const storage = loadStorage(BUCKET_ENV);
    await expect(storage.createClipUpload({ tenantId: 't1', sizeBytes: 0 })).resolves.toHaveProperty('error');
    await expect(storage.createClipUpload({ tenantId: 't1', sizeBytes: 31 * 1024 * 1024 })).resolves.toHaveProperty('error');
  });

  it('turns stored clips into signed links and leaves other references alone', async () => {
    const storage = loadStorage(BUCKET_ENV);
    const url = await storage.resolveClipUrl('storage:watch/t1/1-cam-ab.mp4');
    expect(new URL(url).searchParams.get('X-Amz-Signature')).toBeTruthy();
    await expect(storage.resolveClipUrl('youtube:abcdefghijk')).resolves.toBe('youtube:abcdefghijk');
    await expect(storage.resolveClipUrl(null)).resolves.toBeNull();

    const noBucket = loadStorage({});
    await expect(noBucket.resolveClipUrl('storage:watch/t1/1-cam-ab.mp4')).resolves.toBeNull();
  });
});
