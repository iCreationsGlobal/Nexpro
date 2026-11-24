jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
    where: jest.fn((left, right) => ({ left, right })),
    json: jest.fn((path) => path),
    literal: jest.fn((sql) => sql),
  },
}));

jest.mock('../../../config/config', () => ({
  jwt: {
    secret: 'test-secret',
    expire: '1h',
  },
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'storefront.jwt'),
  verify: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-otp'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/emailService', () => ({
  sendPlatformMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
}));

jest.mock('../../../services/emailTemplates', () => ({
  passwordReset: jest.fn(() => ({ subject: 'Reset', html: '<p>Reset</p>', text: 'Reset' })),
  emailOtpCode: jest.fn(() => ({ subject: 'OTP', html: '<p>OTP</p>', text: 'OTP' })),
}));

jest.mock('../../../models', () => ({
  Customer: {},
  OnlineProductListing: {},
  OnlineStoreSettings: {
    findAll: jest.fn(),
  },
  Product: {},
  ProductVariant: {},
  Sale: {
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
  },
  SaleActivity: {},
  SaleItem: {},
  StorefrontCustomer: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOrCreate: jest.fn(),
  },
  User: { findOne: jest.fn() },
  Tenant: {},
  Shop: {},
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('../../../services/emailService');
const { sequelize } = require('../../../config/database');
const { OnlineStoreSettings, Sale, StorefrontCustomer, User } = require('../../../models');
const storefrontCustomerController = require('../../../controllers/storefrontCustomerController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeCustomer = (overrides = {}) => {
  const customer = {
    id: 'customer-1',
    name: 'Ama Shopper',
    email: 'ama@example.com',
    phone: '0240000000',
    isActive: false,
    emailVerifiedAt: null,
    metadata: {},
    comparePassword: jest.fn().mockResolvedValue(true),
    update: jest.fn(async (payload) => {
      Object.assign(customer, payload);
      return customer;
    }),
    ...overrides,
  };
  return customer;
};

describe('storefrontCustomerController shopper auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendPlatformMessage.mockResolvedValue({ success: true, messageId: 'msg-1' });
    bcrypt.compare.mockResolvedValue(true);
    OnlineStoreSettings.findAll.mockResolvedValue([]);
    Sale.findAndCountAll.mockReset();
    Sale.findOne.mockReset();
    User.findOne.mockReset().mockResolvedValue(null);
  });

  it('reactivates a legacy inactive unverified shopper on register and issues a session token', async () => {
    const existing = makeCustomer({
      isActive: false,
      emailVerifiedAt: null,
      metadata: { source: 'storefront_signup' },
    });
    StorefrontCustomer.findOne.mockResolvedValue(existing);
    const req = {
      body: {
        name: 'Ama Shopper',
        email: 'ama@example.com',
        phone: '0240000000',
        password: 'strongpass',
      },
    };
    const res = mockRes();

    await storefrontCustomerController.registerStorefrontCustomer(req, res, jest.fn());

    expect(StorefrontCustomer.create).not.toHaveBeenCalled();
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ama Shopper',
      phone: '0240000000',
      password: 'strongpass',
      isActive: true,
      emailVerifiedAt: null,
      metadata: expect.objectContaining({
        reactivatedFromLegacyPendingAt: expect.any(String),
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        token: 'storefront.jwt',
        verificationRequired: true,
      }),
    }));
  });

  it('blocks register for admin-disabled inactive shoppers', async () => {
    const existing = makeCustomer({
      isActive: false,
      emailVerifiedAt: new Date(),
      metadata: { disabledByAdmin: true },
    });
    StorefrontCustomer.findOne.mockResolvedValue(existing);
    const req = {
      body: {
        name: 'Ama Shopper',
        email: 'ama@example.com',
        phone: '0240000000',
        password: 'strongpass',
      },
    };
    const res = mockRes();

    await storefrontCustomerController.registerStorefrontCustomer(req, res, jest.fn());

    expect(existing.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'STOREFRONT_ACCOUNT_INACTIVE',
    }));
  });

  it('requires phone number when registering a storefront shopper', async () => {
    const req = {
      body: {
        name: 'Ama Shopper',
        email: 'ama@example.com',
        phone: '   ',
        password: 'strongpass',
      },
    };
    const res = mockRes();

    await storefrontCustomerController.registerStorefrontCustomer(req, res, jest.fn());

    expect(StorefrontCustomer.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Phone number is required.',
    }));
  });

  it('registers an active unverified shopper, sends an OTP, and issues a session token', async () => {
    const customer = makeCustomer({ isActive: true });
    StorefrontCustomer.findOne.mockResolvedValue(null);
    StorefrontCustomer.create.mockResolvedValue(customer);
    const req = {
      body: {
        name: 'Ama Shopper',
        email: 'AMA@example.com',
        phone: ' 0240000000 ',
        password: 'strongpass',
      },
    };
    const res = mockRes();

    await storefrontCustomerController.registerStorefrontCustomer(req, res, jest.fn());

    expect(StorefrontCustomer.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ama@example.com',
      isActive: true,
      emailVerifiedAt: null,
    }));
    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        emailVerification: expect.objectContaining({
          otpHash: 'hashed-otp',
          attempts: 0,
        }),
      }),
    }));
    expect(emailService.sendPlatformMessage).toHaveBeenCalledWith(
      'ama@example.com',
      'OTP',
      '<p>OTP</p>',
      'OTP',
      [],
      expect.objectContaining({ categories: ['transactional', 'storefront-signup'] })
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: 'customer-1', type: 'storefront_customer' },
      'test-secret',
      { expiresIn: '1h' }
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        token: 'storefront.jwt',
        verificationRequired: true,
        verificationEmailSent: true,
        customer: expect.objectContaining({
          email: 'ama@example.com',
          isEmailVerified: false,
        }),
      }),
    }));
  });

  it('verifies an active shopper and returns a storefront customer token after OTP verification', async () => {
    const customer = makeCustomer({
      isActive: true,
      metadata: {
        emailVerification: {
          otpHash: 'hashed-otp',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          attempts: 0,
        },
      },
    });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const req = { body: { email: 'ama@example.com', otp: '123456' } };
    const res = mockRes();

    await storefrontCustomerController.verifyStorefrontCustomerEmail(req, res, jest.fn());

    expect(bcrypt.compare).toHaveBeenCalledWith('123456', 'hashed-otp');
    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      emailVerifiedAt: expect.any(Date),
      lastLoginAt: expect.any(Date),
      metadata: {},
    }));
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: 'customer-1', type: 'storefront_customer' },
      'test-secret',
      { expiresIn: '1h' }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        token: 'storefront.jwt',
        customer: expect.objectContaining({ isEmailVerified: true }),
      }),
    }));
  });

  it('allows active unverified shoppers to sign in with password', async () => {
    const customer = makeCustomer({ isActive: true });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const req = { body: { email: 'ama@example.com', password: 'strongpass' } };
    const res = mockRes();

    await storefrontCustomerController.loginStorefrontCustomer(req, res, jest.fn());

    expect(customer.comparePassword).toHaveBeenCalledWith('strongpass');
    expect(customer.update).toHaveBeenCalledWith({ lastLoginAt: expect.any(Date) });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        token: 'storefront.jwt',
        customer: expect.objectContaining({ isEmailVerified: false }),
      }),
    }));
  });

  it('reactivates legacy inactive unverified shoppers on password login', async () => {
    const customer = makeCustomer({
      isActive: false,
      emailVerifiedAt: null,
      metadata: { source: 'storefront_signup' },
    });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const req = { body: { email: 'ama@example.com', password: 'strongpass' } };
    const res = mockRes();

    await storefrontCustomerController.loginStorefrontCustomer(req, res, jest.fn());

    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
      metadata: expect.objectContaining({
        reactivatedFromLegacyPendingAt: expect.any(String),
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('blocks inactive shoppers from password login', async () => {
    const customer = makeCustomer({
      isActive: false,
      emailVerifiedAt: new Date(),
      metadata: { disabledByAdmin: true },
    });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const req = { body: { email: 'ama@example.com', password: 'strongpass' } };
    const res = mockRes();

    await storefrontCustomerController.loginStorefrontCustomer(req, res, jest.fn());

    expect(customer.comparePassword).toHaveBeenCalledWith('strongpass');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'STOREFRONT_ACCOUNT_INACTIVE',
    }));
  });

  it('sends a login OTP for verified shoppers and signs in after OTP verification', async () => {
    const customer = makeCustomer({
      isActive: true,
      emailVerifiedAt: new Date(),
    });
    StorefrontCustomer.findOne.mockResolvedValue(customer);

    const sendReq = { body: { email: 'ama@example.com' } };
    const sendRes = mockRes();
    await storefrontCustomerController.sendStorefrontLoginOtp(sendReq, sendRes, jest.fn());

    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        loginOtp: expect.objectContaining({
          otpHash: 'hashed-otp',
          attempts: 0,
        }),
      }),
    }));
    expect(sendRes.status).toHaveBeenCalledWith(200);

    customer.metadata = {
      loginOtp: {
        otpHash: 'hashed-otp',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        attempts: 0,
      },
    };
    const verifyReq = { body: { email: 'ama@example.com', otp: '123456' } };
    const verifyRes = mockRes();
    await storefrontCustomerController.verifyStorefrontLoginOtp(verifyReq, verifyRes, jest.fn());

    expect(bcrypt.compare).toHaveBeenCalledWith('123456', 'hashed-otp');
    expect(verifyRes.status).toHaveBeenCalledWith(200);
    expect(verifyRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ token: 'storefront.jwt' }),
    }));
  });

  it('resets a storefront shopper password with a metadata reset token', async () => {
    const customer = makeCustomer({
      isActive: true,
      emailVerifiedAt: new Date(),
      metadata: {
        passwordReset: {
          tokenHash: 'token-hash',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const req = { body: { token: 'reset-token', newPassword: 'newstrongpass' } };
    const res = mockRes();

    await storefrontCustomerController.resetStorefrontPassword(req, res, jest.fn());

    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      password: 'newstrongpass',
      metadata: {},
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updates only safe shopper profile fields', async () => {
    const customer = makeCustomer({
      isActive: true,
      emailVerifiedAt: new Date(),
    });
    const req = {
      storefrontCustomer: customer,
      body: {
        name: 'Ama Updated',
        phone: '0550000000',
        email: 'other@example.com',
        isActive: false,
      },
    };
    const res = mockRes();

    await storefrontCustomerController.updateStorefrontCustomerProfile(req, res, jest.fn());

    expect(customer.update).toHaveBeenCalledWith({
      name: 'Ama Updated',
      phone: '0550000000',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customer: expect.objectContaining({ email: 'ama@example.com' }),
      }),
    }));
  });

  it('requires phone number when updating a storefront shopper profile', async () => {
    const customer = makeCustomer({
      isActive: true,
      emailVerifiedAt: new Date(),
    });
    const req = {
      storefrontCustomer: customer,
      body: {
        name: 'Ama Updated',
        phone: '',
      },
    };
    const res = mockRes();

    await storefrontCustomerController.updateStorefrontCustomerProfile(req, res, jest.fn());

    expect(customer.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Phone number is required.',
    }));
  });

  it('lists only orders owned by the authenticated storefront shopper', async () => {
    Sale.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [{
        get: () => ({
          id: 'sale-1',
          tenantId: 'tenant-1',
          saleNumber: 'SALE-1',
          status: 'pending',
          orderStatus: 'received',
          deliveryStatus: null,
          subtotal: '25.00',
          deliveryFee: '5.00',
          total: '30.00',
          amountPaid: '0.00',
          deliveryRequired: true,
          metadata: {
            source: 'online_store',
            storefrontCustomerId: 'customer-1',
            storeSlug: 'ama-shop',
          },
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          shop: { name: 'Fallback shop' },
        }),
      }],
    });
    OnlineStoreSettings.findAll.mockResolvedValue([{
      get: () => ({
        tenantId: 'tenant-1',
        slug: 'ama-shop',
        displayName: 'Ama Shop',
        currency: 'GHS',
      }),
    }]);

    const req = {
      storefrontCustomer: makeCustomer({ id: 'customer-1', isActive: true, emailVerifiedAt: new Date() }),
      query: {},
    };
    const res = mockRes();

    await storefrontCustomerController.listStorefrontCustomerOrders(req, res, jest.fn());

    expect(Sale.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.any(Object),
      limit: 20,
      offset: 0,
      order: [['createdAt', 'DESC']],
    }));
    expect(sequelize.literal).toHaveBeenCalledWith('"Sale"."metadata"->>\'source\'');
    expect(sequelize.literal).toHaveBeenCalledWith('"Sale"."metadata"->>\'storefrontCustomerId\'');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        orders: [expect.objectContaining({
          id: 'sale-1',
          storeName: 'Ama Shop',
          total: 30,
        })],
      }),
    }));
  });

  it('saves and marks the first delivery address as default', async () => {
    const customer = makeCustomer({
      id: 'customer-1',
      isActive: true,
      emailVerifiedAt: new Date(),
      metadata: {},
    });
    const req = {
      storefrontCustomer: customer,
      body: {
        label: 'Home',
        recipientName: 'Ama Shopper',
        phone: '0240000000',
        line1: '12 Market Street',
        city: 'Accra',
      },
    };
    const res = mockRes();

    await storefrontCustomerController.createStorefrontDeliveryAddress(req, res, jest.fn());

    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        defaultDeliveryAddressId: expect.any(String),
        savedDeliveryAddresses: [expect.objectContaining({
          label: 'Home',
          isDefault: true,
        })],
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('ABS credentials for shoppers', () => {
  let absUser;
  const login = async (body = {}) => {
    const res = mockRes();
    const next = jest.fn();
    await storefrontCustomerController.loginStorefrontCustomer({
      body: { email: 'AMA@example.com', password: 'abs-password', ...body },
    }, res, next);
    expect(next).not.toHaveBeenCalled();
    return res;
  };
  const existingShopper = (overrides = {}) => makeCustomer({
    isActive: true,
    comparePassword: jest.fn().mockResolvedValue(false),
    ...overrides,
  });
  const linkClaims = (overrides = {}) => ({
    type: 'storefront_abs_link', absUserId: 'abs-user-1', shopperId: 'customer-1',
    email: 'ama@example.com', ...overrides,
  });
  const pendingShopper = () => existingShopper({ metadata: {
    loginOtp: { otpHash: 'hashed-otp', expiresAt: new Date(Date.now() + 60000).toISOString(), attempts: 0 },
  } });
  const verifyLink = async (body = {}) => {
    const res = mockRes();
    const next = jest.fn();
    await storefrontCustomerController.verifyStorefrontLoginOtp({
      body: { email: 'ama@example.com', otp: '123456', absLinkToken: 'abs-link.jwt', ...body },
    }, res, next);
    expect(next).not.toHaveBeenCalled();
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    absUser = {
      id: 'abs-user-1', name: 'Ama ABS', email: 'ama@example.com', isActive: true,
      comparePassword: jest.fn().mockResolvedValue(true),
      isLocked: jest.fn().mockReturnValue(false),
      incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(), clearLockout: jest.fn(),
    };
    User.findOne.mockReset().mockResolvedValue(absUser);
    StorefrontCustomer.findOne.mockReset().mockResolvedValue(null);
    StorefrontCustomer.findOrCreate.mockReset().mockImplementation(async ({ defaults }) => [existingShopper(defaults), true]);
    StorefrontCustomer.create.mockReset();
    OnlineStoreSettings.findAll.mockResolvedValue([]);
    emailService.sendPlatformMessage.mockResolvedValue({ success: true });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockImplementation((claims) => claims.type === 'storefront_abs_link' ? 'abs-link.jwt' : 'storefront.jwt');
    jwt.verify.mockReset().mockReturnValue(linkClaims());
  });

  it('keeps native shopper sign-in independent of ABS accounts', async () => {
    StorefrontCustomer.findOne.mockResolvedValue(makeCustomer({ isActive: true }));
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('creates one shopper profile after validating ABS credentials and issues only a shopper token', async () => {
    const res = await login();
    expect(User.findOne).toHaveBeenCalledWith({
      where: { email: 'ama@example.com' },
      attributes: { include: ['failedLoginAttempts', 'lockoutUntil'] },
    });
    expect(absUser.comparePassword).toHaveBeenCalledWith('abs-password');
    expect(absUser.clearLockout).toHaveBeenCalled();
    expect(absUser.resetFailedAttempts).not.toHaveBeenCalled(); // would record an ABS login
    expect(res.status).toHaveBeenCalledWith(200);
    const { defaults } = StorefrontCustomer.findOrCreate.mock.calls[0][0];
    expect(defaults.metadata.absAccount.userId).toBe(absUser.id);
    expect(defaults.password).not.toBe('abs-password');
    expect(jwt.sign).toHaveBeenCalledWith({ id: 'customer-1', type: 'storefront_customer' }, 'test-secret', { expiresIn: '1h' });
    const payload = res.json.mock.calls[0][0].data;
    expect(payload.customer.id).toBe('customer-1');
    expect(payload.customer).not.toHaveProperty('metadata');
    expect(payload.customer).not.toHaveProperty('password');
  });

  it('reuses a linked shopper and checks the current ABS password each time', async () => {
    StorefrontCustomer.findOne.mockResolvedValue(existingShopper({ metadata: { absAccount: { userId: absUser.id } } }));
    const res = await login({ password: 'changed-abs-password' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(absUser.comparePassword).toHaveBeenCalledWith('changed-abs-password');
    expect(StorefrontCustomer.findOrCreate).not.toHaveBeenCalled();
    expect(emailService.sendPlatformMessage).not.toHaveBeenCalled();
  });

  it('requires email proof before linking an existing shopper and does not overwrite their profile', async () => {
    const customer = existingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ errorCode: 'STOREFRONT_ABS_LINK_REQUIRED', data: { absLinkToken: 'abs-link.jwt' } });
    expect(jwt.sign).toHaveBeenCalledWith(linkClaims(), 'test-secret', { expiresIn: '10m' });
    expect(customer.metadata.absAccount).toBeUndefined();
    expect(customer.name).toBe('Ama Shopper');
    expect(customer.phone).toBe('0240000000');
    expect(customer.update.mock.calls.every(([update]) => !('password' in update))).toBe(true);
    expect(res.json.mock.calls[0][0].data.token).toBeUndefined();
  });

  it('does not skip verification when a shopper profile is created during a concurrent first sign-in', async () => {
    StorefrontCustomer.findOrCreate.mockResolvedValue([existingShopper(), false]);
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].errorCode).toBe('STOREFRONT_ABS_LINK_REQUIRED');
  });

  it('rejects invalid ABS passwords and increments the ABS lockout counter', async () => {
    absUser.comparePassword.mockResolvedValue(false);
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(absUser.incrementFailedAttempts).toHaveBeenCalled();
    expect(absUser.clearLockout).not.toHaveBeenCalled();
    expect(StorefrontCustomer.findOrCreate).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('rejects unknown users without creating a shopper', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(StorefrontCustomer.findOrCreate).not.toHaveBeenCalled();
  });

  it.each(['locked', 'inactive', 'newly locked'])('rejects an %s ABS account', async (state) => {
    if (state === 'locked') absUser.isLocked.mockReturnValue(true);
    if (state === 'inactive') absUser.isActive = false;
    if (state === 'newly locked') {
      absUser.comparePassword.mockResolvedValue(false);
      absUser.isLocked.mockReturnValueOnce(false).mockReturnValue(true);
    }
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(state === 'inactive' ? 401 : 423);
    expect(StorefrontCustomer.findOrCreate).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it.each([
    ['verified then deactivated', { emailVerifiedAt: new Date('2026-01-01') }],
    ['disabled by an admin', { metadata: { disabledByAdmin: true } }],
    ['disabled by an admin after linking', { metadata: { disabledByAdmin: true, absAccount: { userId: 'abs-user-1' } } }],
  ])('does not reactivate a shopper %s through ABS sign-in', async (_, overrides) => {
    const customer = existingShopper({ isActive: false, ...overrides });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].errorCode).toBe('STOREFRONT_ACCOUNT_INACTIVE');
    expect(customer.isActive).toBe(false);
    expect(emailService.sendPlatformMessage).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('lets an ABS user finish a shopper signup that never verified its email, after the email code', async () => {
    const customer = existingShopper({ isActive: false });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const challenge = await login();
    expect(challenge.status).toHaveBeenCalledWith(403);
    expect(challenge.json.mock.calls[0][0].errorCode).toBe('STOREFRONT_ABS_LINK_REQUIRED');
    expect(customer.metadata.absAccount).toBeUndefined();
    expect(customer.metadata.reactivatedFromLegacyPendingAt).toBeTruthy();
    const verified = await verifyLink();
    expect(verified.status).toHaveBeenCalledWith(200);
    expect(customer.emailVerifiedAt).toBeInstanceOf(Date);
    expect(customer.metadata.absAccount.userId).toBe(absUser.id);
  });

  it('disconnects ABS sign-in when the shopper password is reset, so reconnecting needs an email code', async () => {
    const customer = existingShopper({ metadata: {
      absAccount: { userId: absUser.id },
      passwordReset: { tokenHash: 'hash', expiresAt: new Date(Date.now() + 60000).toISOString() },
    } });
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const reset = mockRes();
    const next = jest.fn();
    await storefrontCustomerController.resetStorefrontPassword({
      body: { token: 'reset-token', newPassword: 'owner-new-password' },
    }, reset, next);
    expect(next).not.toHaveBeenCalled();
    expect(reset.status).toHaveBeenCalledWith(200);
    expect(customer.metadata.absAccount).toBeUndefined();
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].errorCode).toBe('STOREFRONT_ABS_LINK_REQUIRED');
  });

  it('still checks ABS credentials on databases without the lockout columns', async () => {
    const missingColumn = Object.assign(new Error('column "failed_login_attempts" does not exist'), { original: { code: '42703' } });
    User.findOne.mockRejectedValueOnce(missingColumn);
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(User.findOne).toHaveBeenLastCalledWith({ where: { email: 'ama@example.com' } });
  });

  it('does not hide other database errors during ABS sign-in', async () => {
    const failure = new Error('connection lost');
    User.findOne.mockRejectedValue(failure);
    const next = jest.fn();
    await storefrontCustomerController.loginStorefrontCustomer({
      body: { email: 'ama@example.com', password: 'abs-password' },
    }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(failure);
  });

  it('links only after both the ABS challenge and shopper email code are verified', async () => {
    const customer = pendingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const res = await verifyLink();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(jwt.verify).toHaveBeenCalledWith('abs-link.jwt', 'test-secret');
    expect(User.findOne).toHaveBeenCalledWith({
      where: { id: absUser.id, email: customer.email, isActive: true },
      attributes: { include: expect.arrayContaining(['lockoutUntil']) },
    });
    expect(bcrypt.compare).toHaveBeenCalledWith('123456', 'hashed-otp');
    expect(customer.metadata.absAccount.userId).toBe(absUser.id);
    expect(customer.metadata.loginOtp).toBeUndefined();
    expect(customer.emailVerifiedAt).toBeInstanceOf(Date);
    const replay = await verifyLink();
    expect(replay.status).toHaveBeenCalledWith(400);
  });

  it.each([
    { type: 'storefront_customer' }, { email: 'other@example.com' },
    { shopperId: 'other-shopper' }, { absUserId: null },
  ])('rejects a mismatched linking challenge: %j', async (overrides) => {
    const customer = pendingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    jwt.verify.mockReturnValue(linkClaims(overrides));
    const res = await verifyLink();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(customer.metadata.absAccount).toBeUndefined();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('rejects expired or forged challenge tokens', async () => {
    StorefrontCustomer.findOne.mockResolvedValue(pendingShopper());
    jwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });
    const res = await verifyLink();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it.each(['inactive', 'locked', 'missing'])('does not link an ABS account that became %s', async (state) => {
    const customer = pendingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    if (state === 'inactive') absUser.isActive = false;
    if (state === 'locked') absUser.isLocked.mockReturnValue(true);
    if (state === 'missing') User.findOne.mockResolvedValue(null);
    const res = await verifyLink();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(customer.metadata.absAccount).toBeUndefined();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('rejects an invalid email code without linking or issuing a session', async () => {
    const customer = pendingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    bcrypt.compare.mockResolvedValue(false);
    const res = await verifyLink();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(customer.metadata.loginOtp.attempts).toBe(1);
    expect(customer.metadata.absAccount).toBeUndefined();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('keeps real ABS linking tokens distinct from shopper sessions', async () => {
    const realJwt = jest.requireActual('jsonwebtoken');
    jwt.sign.mockImplementation(realJwt.sign);
    jwt.verify.mockImplementation(realJwt.verify);
    const customer = existingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const challenge = await login();
    const { absLinkToken } = challenge.json.mock.calls[0][0].data;
    expect(realJwt.verify(absLinkToken, 'test-secret')).toMatchObject(linkClaims());

    const { requireStorefrontCustomer } = require('../../../middleware/storefrontAuth');
    const rejected = mockRes();
    const next = jest.fn();
    await requireStorefrontCustomer({ headers: { authorization: `Bearer ${absLinkToken}` } }, rejected, next);
    expect(rejected.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    const verified = await verifyLink({ absLinkToken });
    const sessionToken = verified.json.mock.calls[0][0].data.token;
    expect(realJwt.verify(sessionToken, 'test-secret')).toMatchObject({ type: 'storefront_customer', id: customer.id });
    expect(customer.metadata.absAccount.userId).toBe(absUser.id);
  });

  it('normal email-code sign-in does not silently link an ABS account', async () => {
    const customer = pendingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const res = await verifyLink({ absLinkToken: undefined });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(customer.metadata.absAccount).toBeUndefined();
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it.each(['expired', 'locked'])('rejects an %s email code during account linking', async (state) => {
    const customer = pendingShopper();
    if (state === 'expired') customer.metadata.loginOtp.expiresAt = new Date(Date.now() - 1000).toISOString();
    else customer.metadata.loginOtp.attempts = 5;
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    const res = await verifyLink();
    expect(res.status).toHaveBeenCalledWith(state === 'expired' ? 400 : 429);
    expect(customer.metadata.absAccount).toBeUndefined();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('handles email delivery failure without returning a challenge or session', async () => {
    const customer = existingShopper();
    StorefrontCustomer.findOne.mockResolvedValue(customer);
    emailService.sendPlatformMessage.mockResolvedValue({ success: false });
    const res = await login();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(customer.metadata.loginOtp).toBeUndefined();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  describe('email recovery for ABS users without a shopper profile', () => {
    const call = async (handler, body) => {
      const res = mockRes();
      const next = jest.fn();
      await storefrontCustomerController[handler]({ body }, res, next);
      await new Promise((resolve) => setImmediate(resolve));
      expect(next).not.toHaveBeenCalled();
      return res;
    };

    it.each([
      ['sign-in code', 'sendStorefrontLoginOtp'],
      ['password reset link', 'requestStorefrontPasswordReset'],
    ])('sends a %s, with an unlinked profile', async (_, handler) => {
      const res = await call(handler, { email: 'AMA@example.com' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(emailService.sendPlatformMessage).toHaveBeenCalledTimes(1);
      expect(emailService.sendPlatformMessage.mock.calls[0][0]).toBe('ama@example.com');
      const { defaults } = StorefrontCustomer.findOrCreate.mock.calls[0][0];
      expect(defaults.metadata).toEqual({ source: 'abs_signin' });
      expect(defaults.emailVerifiedAt).toBeNull();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it.each(['sendStorefrontLoginOtp', 'requestStorefrontPasswordReset'])('%s creates nothing for an unknown or deactivated ABS email', async (handler) => {
      User.findOne.mockImplementation(async ({ where }) => (where.isActive === true ? null : { ...absUser, isActive: false }));
      const res = await call(handler, { email: 'ama@example.com' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(StorefrontCustomer.findOrCreate).not.toHaveBeenCalled();
      expect(emailService.sendPlatformMessage).not.toHaveBeenCalled();
    });

    it('does not look at ABS when a shopper profile exists, and leaves a disabled one alone', async () => {
      StorefrontCustomer.findOne.mockResolvedValue(existingShopper({ isActive: false, metadata: { disabledByAdmin: true } }));
      await call('sendStorefrontLoginOtp', { email: 'ama@example.com' });
      await call('requestStorefrontPasswordReset', { email: 'ama@example.com' });
      expect(User.findOne).not.toHaveBeenCalled();
      expect(emailService.sendPlatformMessage).not.toHaveBeenCalled();
    });
  });

  it('does not let a deactivated ABS account block a new shopper account', async () => {
    User.findOne.mockImplementation(async ({ where }) => (where.isActive === true ? null : { ...absUser, isActive: false }));
    StorefrontCustomer.create.mockResolvedValue(makeCustomer({ isActive: true }));
    const res = mockRes();
    const next = jest.fn();
    await storefrontCustomerController.registerStorefrontCustomer({ body: {
      name: 'Ama', email: 'ama@example.com', phone: '0240000000', password: 'new-password',
    } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each(['ABS', 'shopper'])('guides an existing %s account from registration to sign-in', async (type) => {
    if (type === 'shopper') StorefrontCustomer.findOne.mockResolvedValue(existingShopper());
    const res = mockRes();
    const next = jest.fn();
    await storefrontCustomerController.registerStorefrontCustomer({ body: {
      name: 'Ama', email: 'AMA@example.com', phone: '0240000000', password: 'new-password',
    } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].errorCode).toBe('STOREFRONT_ACCOUNT_EXISTS');
    expect(StorefrontCustomer.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});
