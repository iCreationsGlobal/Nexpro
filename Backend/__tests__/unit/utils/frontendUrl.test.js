const {
  getFrontendBaseUrlFromEnv,
  getFrontendBaseUrl,
  buildInvoicePaymentLink,
  buildInvoicePaymentPathParam,
  PRODUCTION_FRONTEND_DEFAULT,
} = require('../../../utils/frontendUrl');

describe('frontendUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses FRONTEND_URL when set outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.FRONTEND_URL = 'https://app.example.com/';
    expect(getFrontendBaseUrlFromEnv()).toBe('https://app.example.com');
  });

  it('falls back to localhost only in non-production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.FRONTEND_URL;
    expect(getFrontendBaseUrlFromEnv()).toBe('http://localhost:3000');
  });

  it('never uses localhost in production when FRONTEND_URL is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;
    expect(getFrontendBaseUrlFromEnv()).toBe(PRODUCTION_FRONTEND_DEFAULT);
  });

  it('ignores localhost FRONTEND_URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    expect(getFrontendBaseUrlFromEnv()).toBe(PRODUCTION_FRONTEND_DEFAULT);
  });

  it('prefers allowed request origin over env', () => {
    process.env.FRONTEND_URL = 'https://myapp.africanbusinesssuite.com';
    const req = { headers: { origin: 'https://demo.africanbusinesssuite.com' } };
    expect(getFrontendBaseUrl(req)).toBe('https://demo.africanbusinesssuite.com');
  });

  it('builds invoice payment links from paymentToken', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;
    expect(buildInvoicePaymentLink({ paymentToken: 'abc123' })).toBe(
      `${PRODUCTION_FRONTEND_DEFAULT}/pay-invoice/abc123`
    );
  });

  it('builds WhatsApp Pay now path param from paymentToken', () => {
    expect(buildInvoicePaymentPathParam({ paymentToken: 'abc123' })).toBe('pay-invoice/abc123');
    expect(buildInvoicePaymentPathParam({ id: 'inv-1' })).toBe('invoices/inv-1');
    expect(buildInvoicePaymentPathParam({})).toBeNull();
  });
});
