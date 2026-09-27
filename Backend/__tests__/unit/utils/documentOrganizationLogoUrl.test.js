jest.mock('../../../models', () => ({ Setting: {}, Tenant: {} }));
jest.mock('../../../utils/tenantLogo', () => ({ getTenantLogoUrl: jest.fn() }));

const { toPublicAssetUrl } = require('../../../utils/documentOrganizationUtils');

describe('toPublicAssetUrl (invoice logos)', () => {
  const originalEnv = process.env.API_PUBLIC_URL;
  beforeAll(() => { process.env.API_PUBLIC_URL = 'https://api.example.com'; });
  afterAll(() => { process.env.API_PUBLIC_URL = originalEnv; });

  it('builds a public URL for upload paths', () => {
    expect(toPublicAssetUrl('/uploads/logo.png')).toBe('https://api.example.com/uploads/logo.png');
  });

  it('decodes HTML-escaped stored paths instead of dropping the logo', () => {
    expect(toPublicAssetUrl('&#x2F;uploads&#x2F;logo.png')).toBe('https://api.example.com/uploads/logo.png');
  });

  it('accepts upload paths without a leading slash', () => {
    expect(toPublicAssetUrl('uploads/logo.png')).toBe('https://api.example.com/uploads/logo.png');
  });

  it('keeps absolute and data URLs as they are', () => {
    expect(toPublicAssetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(toPublicAssetUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
