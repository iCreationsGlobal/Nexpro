jest.mock('../../../config/database', () => ({
  sequelize: {},
}));

jest.mock('../../../models', () => {
  const userFindByPk = jest.fn();
  return {
    Setting: {
      findOne: jest.fn(),
      findOrCreate: jest.fn(),
    },
    User: {
      findByPk: userFindByPk,
      unscoped: () => ({ findByPk: userFindByPk }),
    },
    Tenant: {
      findByPk: jest.fn(),
    },
  };
});

jest.mock('../../../middleware/upload', () => ({
  baseUploadDir: '/tmp/uploads',
}));

jest.mock('../../../utils/tenantUtils', () => ({
  sanitizePayload: jest.fn((body = {}) => ({ ...body })),
  findTenantWithOptionalColumns: jest.fn(),
}));

jest.mock('../../../utils/taxConfig', () => ({
  normalizeTaxConfig: jest.fn((value) => value || {}),
  validateMergedTaxPayload: jest.fn(),
  warmTaxConfigCache: jest.fn(),
}));

jest.mock('../../../config/customerSourceOptions', () => ({
  getCustomerSourceOptions: jest.fn(() => []),
}));

jest.mock('../../../config/leadSourceOptions', () => ({
  getLeadSourceOptions: jest.fn(() => []),
}));

jest.mock('../../../services/platformAdminNotificationService', () => ({
  notifyDataDeletionRequested: jest.fn(),
}));

jest.mock('../../../utils/tenantClassification', () => ({
  DEFAULT_SHOP_TYPE: 'general',
  normalizeTenantClassification: jest.fn((tenant) => tenant),
  normalizeTenantInstanceForRequest: jest.fn((tenant) => tenant),
}));

jest.mock('../../../services/paystackService', () => ({
  secretKey: 'sk_test',
  createSubaccount: jest.fn(),
  userFacingPaystackErrorMessage: jest.fn(() => null),
  paystackResponseIsUnusableHtml: jest.fn(() => false),
  getMoMoBankCode: jest.fn(() => 'MOMO'),
}));

jest.mock('../../../services/emailService', () => ({
  sendPlatformMessage: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../services/tenantMomoCollectionService', () => ({
  getMtnCollectionPublicSummary: jest.fn(() => ({
    configured: false,
    merchantId: '',
    hasApiCredentials: false,
    environment: '',
    collectionApiUrl: '',
    callbackUrl: '',
    subscriptionKeyMasked: '',
    apiUserMasked: '',
    encryptionConfigured: false,
    platformFallbackAvailable: false,
    activeSource: 'none',
  })),
}));

jest.mock('../../../services/tenantHubtelCollectionService', () => ({
  getHubtelCollectionPublicSummary: jest.fn(() => ({
    configured: false,
    clientIdMasked: '',
    merchantAccountNumber: '',
    posSalesId: '',
    encryptionConfigured: false,
  })),
  saveTenantHubtelCollectionCredentials: jest.fn(),
  clearTenantHubtelCollectionCredentials: jest.fn(),
  testHubtelCredentials: jest.fn(),
  isEncryptionConfigured: jest.fn(() => true),
}));

jest.mock('../../../services/emailTemplates', () => ({
  emailOtpCode: jest.fn(() => ({ subject: 'OTP', html: '<p>OTP</p>', text: 'OTP' })),
  paystackBankLinkedEmail: jest.fn(() => ({ subject: 'Linked', html: '<p>Linked</p>', text: 'Linked' })),
  paystackMomoLinkedEmail: jest.fn(() => ({ subject: 'Linked', html: '<p>Linked</p>', text: 'Linked' })),
}));

const { Setting, User, Tenant } = require('../../../models');
const emailService = require('../../../services/emailService');
const paystackService = require('../../../services/paystackService');
const { findTenantWithOptionalColumns } = require('../../../utils/tenantUtils');
const settingsController = require('../../../controllers/settingsController');

describe('settingsController payment collection verification', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const googleUser = {
    id: 'user-1',
    email: 'owner@example.com',
    name: 'Owner',
    googleId: 'google-123',
    comparePassword: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    User.findByPk.mockResolvedValue(googleUser);
    Setting.findOne.mockResolvedValue(null);
    Setting.findOrCreate.mockResolvedValue([
      {
        value: null,
        save: jest.fn().mockResolvedValue(undefined),
      },
      true,
    ]);
    paystackService.createSubaccount.mockResolvedValue({
      data: { subaccount_code: 'ACCT_test123' },
    });
  });

  it('tells Google users to use OTP instead of password verification', async () => {
    const req = { user: { id: 'user-1' } };
    const res = mockRes();

    await settingsController.verifyPaymentCollectionPassword(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          passwordRequired: false,
          otpRequired: true,
          authMethod: 'otp',
        }),
      })
    );
    expect(googleUser.comparePassword).not.toHaveBeenCalled();
  });

  it('rejects Google payment collection linking without an OTP', async () => {
    const req = {
      user: { id: 'user-1' },
      tenantId: 'tenant-1',
      body: {
        settlement_type: 'bank',
        business_name: 'Test Shop',
        bank_code: '044',
        account_number: '0123456789',
      },
    };
    const res = mockRes();

    await settingsController.updatePaymentCollectionSettings(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Verification code (OTP) is required',
      })
    );
    expect(findTenantWithOptionalColumns).not.toHaveBeenCalled();
    expect(googleUser.comparePassword).not.toHaveBeenCalled();
  });

  it('links payment collection for Google users after verify-otp without resending OTP on save', async () => {
    const tenant = {
      id: 'tenant-1',
      metadata: {},
      paystackSubaccountCode: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    findTenantWithOptionalColumns.mockResolvedValue(tenant);
    Setting.findOne.mockResolvedValue({
      value: {
        otp: '123456',
        expiresAt: Date.now() + 60_000,
        verifiedAt: Date.now(),
        verifiedUntil: Date.now() + 15 * 60_000,
      },
      destroy: jest.fn().mockResolvedValue(undefined),
    });
    const req = {
      user: { id: 'user-1' },
      tenantId: 'tenant-1',
      body: {
        settlement_type: 'bank',
        business_name: 'Test Shop',
        bank_code: '044',
        bank_name: 'Test Bank',
        account_number: '0123456789',
      },
    };
    const res = mockRes();

    await settingsController.updatePaymentCollectionSettings(req, res, jest.fn());

    expect(paystackService.createSubaccount).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(googleUser.comparePassword).not.toHaveBeenCalled();
  });

  it('links payment collection for Google users with a valid OTP and no password', async () => {
    const tenant = {
      id: 'tenant-1',
      metadata: {},
      paystackSubaccountCode: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    findTenantWithOptionalColumns.mockResolvedValue(tenant);
    Setting.findOne.mockResolvedValue({
      value: { otp: '123456', expiresAt: Date.now() + 60_000 },
      destroy: jest.fn().mockResolvedValue(undefined),
    });
    const req = {
      user: { id: 'user-1' },
      tenantId: 'tenant-1',
      body: {
        otp: '123456',
        settlement_type: 'bank',
        business_name: 'Test Shop',
        bank_code: '044',
        bank_name: 'Test Bank',
        account_number: '0123456789',
      },
    };
    const res = mockRes();

    await settingsController.updatePaymentCollectionSettings(req, res, jest.fn());

    expect(paystackService.createSubaccount).toHaveBeenCalledWith(
      expect.objectContaining({
        business_name: 'Test Shop',
        bank_code: '044',
        account_number: '0123456789',
      })
    );
    expect(tenant.save).toHaveBeenCalledWith({ fields: ['metadata', 'paystackSubaccountCode'] });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(googleUser.comparePassword).not.toHaveBeenCalled();
  });

  it('sends payment collection OTP to the account email for Google users without requiring password', async () => {
    const req = {
      user: { id: 'user-1' },
      tenantId: 'tenant-1',
      body: {},
    };
    const res = mockRes();

    await settingsController.sendPaymentCollectionOtp(req, res, jest.fn());

    expect(emailService.sendPlatformMessage).toHaveBeenCalledWith(
      'owner@example.com',
      'OTP',
      '<p>OTP</p>',
      'OTP',
      [],
      expect.objectContaining({
        categories: ['payment-collection-otp'],
        context: expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          source: 'payment_collection_otp',
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(googleUser.comparePassword).not.toHaveBeenCalled();
  });

  it('returns an error when the payment collection OTP email provider fails', async () => {
    const storedOtp = { destroy: jest.fn().mockResolvedValue(undefined) };
    emailService.sendPlatformMessage.mockResolvedValueOnce({
      success: false,
      error: 'Platform email not configured',
    });
    Setting.findOne.mockResolvedValue(storedOtp);
    const req = {
      user: { id: 'user-1' },
      tenantId: 'tenant-1',
      body: {},
    };
    const res = mockRes();

    await settingsController.sendPaymentCollectionOtp(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Could not send verification code. Please contact support or try again later.',
      })
    );
    expect(storedOtp.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports payment collection as configured when paystack subaccount is linked', async () => {
    findTenantWithOptionalColumns.mockResolvedValue({
      id: 'tenant-1',
      paystackSubaccountCode: 'ACCT_linked123',
      metadata: {
        paymentCollection: {
          settlementType: 'bank',
          business_name: 'Test Shop',
          bank_code: '044',
          account_number: '0123456789',
        },
      },
    });

    const req = { tenantId: 'tenant-1' };
    const res = mockRes();

    await settingsController.getPaymentCollectionSettings(req, res, jest.fn());

    expect(findTenantWithOptionalColumns).toHaveBeenCalledWith('tenant-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          configured: true,
          hasSubaccount: true,
          settlement_type: 'bank',
          account_number_masked: '****6789',
          hubtel_collection: expect.objectContaining({ configured: false }),
        }),
      })
    );
  });

  it('reports payment collection as configured when Hubtel credentials are connected', async () => {
    const {
      getHubtelCollectionPublicSummary,
    } = require('../../../services/tenantHubtelCollectionService');
    getHubtelCollectionPublicSummary.mockReturnValueOnce({
      configured: true,
      clientIdMasked: '****ient',
      merchantAccountNumber: 'HM1',
      posSalesId: '',
      encryptionConfigured: true,
    });
    findTenantWithOptionalColumns.mockResolvedValue({
      id: 'tenant-1',
      paystackSubaccountCode: null,
      metadata: {},
    });

    const req = { tenantId: 'tenant-1' };
    const res = mockRes();

    await settingsController.getPaymentCollectionSettings(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          configured: true,
          hubtel_collection: expect.objectContaining({ configured: true }),
        }),
      })
    );
  });
});
