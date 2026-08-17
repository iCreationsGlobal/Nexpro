jest.mock('../../../models', () => ({
  Setting: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../../../utils/taxConfig', () => ({
  getTaxConfigForTenant: jest.fn(),
  normalizeTaxConfig: jest.fn((tax = {}) => ({
    enabled: false,
    tin: '',
    vatNumber: '',
    ghanaCardPin: '',
    defaultRatePercent: 0,
    levies: [],
    eVat: {},
    ...tax,
  })),
  invalidateTaxConfigCache: jest.fn(),
  warmTaxConfigCache: jest.fn(),
}));

jest.mock('../../../utils/secretCrypto', () => ({
  encryptSecret: jest.fn((value) => `enc:${value}`),
  decryptSecret: jest.fn(),
  isEncryptedSecret: jest.fn(() => false),
  hasKey: jest.fn(() => false),
}));

const { Setting } = require('../../../models');
const { getTaxConfigForTenant } = require('../../../utils/taxConfig');
const {
  stampDocumentIfEnabled,
  updateEvatSettings,
} = require('../../../services/evatService');

describe('evatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('stampDocumentIfEnabled', () => {
    it('skips stamping when e-VAT is off even if the customer has a TIN', async () => {
      getTaxConfigForTenant.mockResolvedValue({
        tin: 'C0000000001',
        eVat: { enabled: false, consentAcceptedAt: '2026-01-01T00:00:00.000Z' },
      });

      const result = await stampDocumentIfEnabled('tenant-1', {
        customer: { taxId: 'C0000000001', ghanaCardPin: 'GHA-123456789-1' },
        total: 100,
      });

      expect(result).toBeNull();
    });

    it('skips stamping when enabled but consent has not been accepted', async () => {
      getTaxConfigForTenant.mockResolvedValue({
        eVat: { enabled: true, consentAcceptedAt: null },
      });

      const result = await stampDocumentIfEnabled('tenant-1', {
        customer: { taxId: 'C0000000001' },
        total: 100,
      });

      expect(result).toBeNull();
    });

    it('stamps in sandbox when e-VAT is on and consented', async () => {
      getTaxConfigForTenant.mockResolvedValue({
        tin: 'P0000000001',
        eVat: {
          enabled: true,
          mode: 'sandbox',
          consentAcceptedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = await stampDocumentIfEnabled('tenant-1', {
        customer: { name: 'Buyer', taxId: 'C0000000001', ghanaCardPin: 'GHA-123' },
        saleNumber: 'S-1',
        total: 100,
      });

      expect(result).toBeTruthy();
      expect(result.graStamp.irn).toMatch(/^SBX-/);
      expect(result.graStamp.mode).toBe('sandbox');
    });
  });

  describe('updateEvatSettings', () => {
    it('enables e-VAT from the customer form using consentAccepted without an API key', async () => {
      const row = {
        value: { tax: { eVat: { enabled: false, mode: 'sandbox' } } },
        update: jest.fn().mockResolvedValue(undefined),
      };
      Setting.findOne.mockResolvedValue(row);
      getTaxConfigForTenant.mockResolvedValue({
        eVat: {
          enabled: true,
          mode: 'sandbox',
          consentAcceptedAt: '2026-08-17T12:00:00.000Z',
        },
      });

      const status = await updateEvatSettings(
        'tenant-1',
        { enabled: true, consentAccepted: true },
        { userId: 'mgr-1' }
      );

      expect(row.update).toHaveBeenCalledTimes(1);
      const saved = row.update.mock.calls[0][0].value.tax.eVat;
      expect(saved.enabled).toBe(true);
      expect(saved.mode).toBe('sandbox');
      expect(saved.consentAcceptedAt).toBeTruthy();
      expect(saved.consentAcceptedBy).toBe('mgr-1');
      expect(saved.apiKeyEncrypted).toBeFalsy();
      expect(status.enabled).toBe(true);
    });
  });
});
