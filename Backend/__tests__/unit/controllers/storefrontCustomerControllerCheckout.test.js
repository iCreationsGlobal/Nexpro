jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
    where: jest.fn((left, right) => ({ left, right })),
    literal: jest.fn((value) => value),
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
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));

jest.mock('../../../services/emailService', () => ({
  sendPlatformMessage: jest.fn(),
}));

jest.mock('../../../services/emailTemplates', () => ({
  emailOtpCode: jest.fn(),
  passwordReset: jest.fn(),
}));

jest.mock('../../../services/notificationService', () => ({
  notifyOnlineStoreOrderReceived: jest.fn(),
}));

jest.mock('../../../services/paystackService', () => ({
  secretKey: 'sk_test_x',
  verifyTransaction: jest.fn(),
  initializeTransaction: jest.fn(),
  userFacingPaystackErrorMessage: jest.fn(() => null),
}));

jest.mock('../../../middleware/upload', () => ({
  baseUploadDir: '/tmp/uploads',
  ensureDirExists: jest.fn(),
}));

jest.mock('../../../services/tradeAssuranceService', () => ({
  markReleaseEligibleForSale: jest.fn(),
  openDisputeForSale: jest.fn(),
  recordHeldPaymentForSale: jest.fn(),
  recordDirectPaidPaymentForSale: jest.fn(),
}));

jest.mock('../../../services/storefrontReviewService', () => ({
  buildEligibilityResponse: jest.fn(),
  createOrUpdateVerifiedReview: jest.fn(),
  getOrderReviewActions: jest.fn(),
  getPublicReviewSummary: jest.fn(),
  parseConfirmationReviewPayload: jest.fn(),
  updateOwnReview: jest.fn(),
}));

const mockStore = {
  slug: 'demo-shop',
  displayName: 'Demo Shop',
  currency: 'GHS',
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryFee: 10,
  tenantId: 'tenant-1',
  shopId: null,
  metadata: {},
  tenant: { id: 'tenant-1', name: 'Demo Tenant', status: 'active' },
  reload: jest.fn(async function reload() {
    return this;
  }),
};

const mockListing = {
  id: 'listing-1',
  tenantId: 'tenant-1',
  shopId: null,
  productId: 'product-1',
  productVariantId: null,
  title: 'Sample Product',
  publicPrice: 25,
  images: ['https://example.com/image.jpg'],
  inventoryPolicy: 'deny',
  status: 'published',
};

const mockProduct = {
  id: 'product-1',
  tenantId: 'tenant-1',
  isActive: true,
  hasVariants: false,
  trackStock: true,
  quantityOnHand: 10,
  sku: 'SKU-1',
  imageUrl: null,
};

jest.mock('../../../models', () => ({
  Customer: {},
  OnlineProductListing: {
    findAll: jest.fn(),
  },
  OnlineStoreSettings: {
    findOne: jest.fn(),
  },
  Product: {
    findAll: jest.fn(),
  },
  ProductCategory: {},
  ProductVariant: {
    findAll: jest.fn(),
  },
  Sale: {
    findOne: jest.fn(),
  },
  SaleActivity: {
    create: jest.fn(),
  },
  SaleItem: {},
  StorefrontCustomer: {},
  StorefrontWishlistItem: {},
  MarketplaceDispute: {},
  Tenant: {},
  Shop: {},
}));

const crypto = require('crypto');
const {
  OnlineProductListing,
  OnlineStoreSettings,
  Product,
  ProductVariant,
  Sale,
  SaleActivity,
} = require('../../../models');
const { sequelize } = require('../../../config/database');
const paystackService = require('../../../services/paystackService');
const { recordDirectPaidPaymentForSale } = require('../../../services/tradeAssuranceService');
const { notifyOnlineStoreOrderReceived } = require('../../../services/notificationService');
const storefrontCustomerController = require('../../../controllers/storefrontCustomerController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('previewStorefrontCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OnlineStoreSettings.findOne.mockResolvedValue(mockStore);
    OnlineProductListing.findAll.mockResolvedValue([mockListing]);
    Product.findAll.mockResolvedValue([mockProduct]);
    ProductVariant.findAll.mockResolvedValue([]);
  });

  it('returns checkout preview without requiring a database transaction lock', async () => {
    const req = {
      storefrontCustomer: {
        id: 'shopper-1',
        email: 'shopper@example.com',
        name: 'Ama Shopper',
      },
      body: {
        storeSlug: 'demo-shop',
        items: [{ listingId: 'listing-1', quantity: 2 }],
        fulfillmentMethod: 'pickup',
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await storefrontCustomerController.previewStorefrontCheckout(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        subtotal: 50,
        deliveryFee: 0,
        total: 50,
        fulfillmentMethod: 'pickup',
        items: [
          expect.objectContaining({
            listingId: 'listing-1',
            quantity: 2,
            unitPrice: 25,
            subtotal: 50,
            available: true,
          }),
        ],
      }),
    }));
    expect(OnlineStoreSettings.findOne).toHaveBeenCalledWith(expect.objectContaining({
      transaction: null,
      lock: undefined,
    }));
    expect(Product.findAll).toHaveBeenCalledWith(expect.objectContaining({
      transaction: null,
      lock: undefined,
    }));
  });
});

describe('guest checkout', () => {
  const guestToken = 'guest-token-abc';
  const tokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
  let transaction;

  const pendingGuestSale = () => ({
    id: 'sale-1',
    tenantId: 'tenant-1',
    saleNumber: 'SALE-1',
    status: 'pending',
    orderStatus: 'received',
    subtotal: 50,
    deliveryFee: 0,
    total: 50,
    metadata: {
      source: 'online_store',
      commerceChannel: 'online_store',
      checkoutMode: 'guest',
      storefrontCustomerId: null,
      storeSlug: 'demo-shop',
      guestCheckout: { accessTokenHash: tokenHash },
      directPayment: { paymentStatus: 'awaiting_payment', paystackReference: 'REF-1' },
      tradeAssurance: { paymentStatus: 'awaiting_payment', paystackReference: 'REF-1' },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = {
      commit: jest.fn(),
      rollback: jest.fn(),
      finished: false,
      LOCK: { UPDATE: 'UPDATE' },
    };
    sequelize.transaction.mockResolvedValue(transaction);
    OnlineStoreSettings.findOne.mockResolvedValue(mockStore);
    OnlineProductListing.findAll.mockResolvedValue([mockListing]);
    Product.findAll.mockResolvedValue([mockProduct]);
    ProductVariant.findAll.mockResolvedValue([]);
    paystackService.verifyTransaction.mockResolvedValue({
      status: true,
      data: {
        status: 'success',
        reference: 'REF-1',
        amount: 5000,
        metadata: {
          type: 'online_store_order',
          commerceChannel: 'online_store',
          saleId: 'sale-1',
          storefrontCustomerId: null,
          checkoutMode: 'guest',
          storeSlug: 'demo-shop',
        },
      },
    });
    recordDirectPaidPaymentForSale.mockResolvedValue({});
    notifyOnlineStoreOrderReceived.mockResolvedValue(undefined);
    SaleActivity.create.mockResolvedValue({});
  });

  it('previews checkout without a shopper account', async () => {
    const req = {
      headers: {},
      body: {
        storeSlug: 'demo-shop',
        items: [{ listingId: 'listing-1', quantity: 1 }],
        fulfillmentMethod: 'delivery',
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await storefrontCustomerController.previewStorefrontCheckout(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('requires an account for Sabito marketplace checkout', async () => {
    const req = {
      headers: { 'x-storefront-channel': 'sabito_marketplace' },
      body: {
        commerceChannel: 'sabito_marketplace',
        storeSlug: 'demo-shop',
        items: [{ listingId: 'listing-1', quantity: 1 }],
        guest: { name: 'Ama Guest', email: 'ama@example.com', phone: '0240000000' },
      },
    };
    const res = mockRes();

    await storefrontCustomerController.initializeStorefrontOrderPaystack(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('rejects guest checkout without a valid email', async () => {
    const req = {
      headers: { 'x-storefront-channel': 'online_store' },
      body: {
        commerceChannel: 'online_store',
        storeSlug: 'demo-shop',
        items: [{ listingId: 'listing-1', quantity: 1 }],
        guest: { name: 'Ama Guest', email: 'not-an-email', phone: '0240000000' },
      },
    };
    const res = mockRes();

    await storefrontCustomerController.initializeStorefrontOrderPaystack(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'GUEST_CHECKOUT_EMAIL_REQUIRED' }));
  });

  it('confirms a guest payment when the access token matches', async () => {
    Sale.findOne.mockResolvedValue(pendingGuestSale());
    const req = { headers: {}, body: { reference: 'REF-1', guestToken }, query: {} };
    const res = mockRes();
    const next = jest.fn();

    await storefrontCustomerController.verifyStorefrontOrderPaystack(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(recordDirectPaidPaymentForSale).toHaveBeenCalledWith(expect.objectContaining({ shopper: null }));
    expect(transaction.commit).toHaveBeenCalled();
  });

  it('does not confirm a guest payment with the wrong access token', async () => {
    Sale.findOne.mockResolvedValue(pendingGuestSale());
    const req = { headers: {}, body: { reference: 'REF-1', guestToken: 'wrong-token' }, query: {} };
    const res = mockRes();

    await storefrontCustomerController.verifyStorefrontOrderPaystack(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(recordDirectPaidPaymentForSale).not.toHaveBeenCalled();
  });

  it('requires a guest token or account to verify payment', async () => {
    const req = { headers: {}, body: { reference: 'REF-1' }, query: {} };
    const res = mockRes();

    await storefrontCustomerController.verifyStorefrontOrderPaystack(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
  });
});
