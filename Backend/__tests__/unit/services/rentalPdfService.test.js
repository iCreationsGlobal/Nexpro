jest.mock('../../../models', () => ({
  Rental: { findOne: jest.fn() },
  RentalItem: {},
  Product: {},
  Customer: {},
  Shop: { findByPk: jest.fn() },
  LateCharge: {},
  DamageReport: {},
  RentalExtension: {},
}));

jest.mock('../../../utils/documentOrganizationUtils', () => ({
  resolveDocumentOrganization: jest.fn(),
}));

jest.mock('../../../services/rentalSettingsService', () => ({
  getRentalSettings: jest.fn(),
}));

jest.mock('../../../services/rentalDepositService', () => ({
  getRentalDeposit: jest.fn(() => ({
    amount: 100,
    paid: 100,
    status: 'held',
  })),
}));

const { Rental, Shop } = require('../../../models');
const { resolveDocumentOrganization } = require('../../../utils/documentOrganizationUtils');
const { getRentalSettings } = require('../../../services/rentalSettingsService');
const {
  buildRentalDocumentNumber,
  buildRentalAgreementDocument,
  buildRentalReturnInspectionDocument,
  resolveAgreementTerms,
} = require('../../../services/rentalPdfService');

const rentalId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const tenantId = '11111111-2222-3333-4444-555555555555';

const baseRental = {
  get: jest.fn(() => baseRental),
  id: rentalId,
  tenantId,
  branchId: 'branch-1',
  status: 'active',
  startDate: '2026-03-01',
  endDate: '2026-03-05',
  actualReturnDate: null,
  rentalDurationDays: 4,
  paymentMethod: 'cash',
  amount: 400,
  discountAmount: 0,
  amountPaid: 0,
  totalDue: 400,
  notes: 'Handle with care',
  metadata: {
    handover: { handedOverAt: '2026-03-01T10:00:00.000Z', notes: 'Keys provided' },
  },
  items: [{
    id: 'item-1',
    productId: 'prod-1',
    quantity: 1,
    rentalRatePerDay: 100,
    subtotal: 400,
    product: { id: 'prod-1', name: 'Mini Bus', metadata: { rentalTerms: 'No off-road use.' } },
  }],
  customer: { id: 'cust-1', name: 'Jane Doe', phone: '0240000000' },
  lateCharges: [],
  damageReports: [],
  extensions: [],
};

const makeRentalMock = (overrides = {}) => {
  const data = {
    ...baseRental,
    ...overrides,
  };
  return {
    ...data,
    get: jest.fn(() => data),
  };
};

describe('rentalPdfService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveDocumentOrganization.mockResolvedValue({
      name: 'Test Rentals Ltd',
      logoUrl: '/uploads/logo.png',
      defaultTermsAndConditions: 'Payment due on return.',
    });
    getRentalSettings.mockResolvedValue({ lateChargeRatePercent: 50 });
    Shop.findByPk.mockResolvedValue({ id: 'branch-1', name: 'Main Branch' });
  });

  it('buildRentalDocumentNumber formats a compact reference', () => {
    expect(buildRentalDocumentNumber(rentalId)).toBe('RNT-AAAAAAAA');
  });

  it('resolveAgreementTerms merges product and organization terms', () => {
    const terms = resolveAgreementTerms(baseRental, { defaultTermsAndConditions: 'Org terms.' });
    expect(terms).toContain('Mini Bus');
    expect(terms).toContain('No off-road use.');
    expect(terms).toContain('Org terms.');
    expect(terms).toContain('Handle with care');
  });

  it('buildRentalAgreementDocument returns branded agreement payload', async () => {
    Rental.findOne.mockResolvedValue(makeRentalMock());

    const document = await buildRentalAgreementDocument(tenantId, rentalId);

    expect(document.documentType).toBe('agreement');
    expect(document.documentNumber).toBe('RNT-AAAAAAAA');
    expect(document.organization.name).toBe('Test Rentals Ltd');
    expect(document.rental.customer.name).toBe('Jane Doe');
    expect(document.financials.amount).toBe(400);
    expect(document.handover.notes).toBe('Keys provided');
  });

  it('buildRentalAgreementDocument rejects cancelled rentals', async () => {
    Rental.findOne.mockResolvedValue(makeRentalMock({ status: 'cancelled' }));

    await expect(buildRentalAgreementDocument(tenantId, rentalId))
      .rejects
      .toMatchObject({ statusCode: 400 });
  });

  it('buildRentalReturnInspectionDocument requires a return', async () => {
    Rental.findOne.mockResolvedValue(makeRentalMock());

    await expect(buildRentalReturnInspectionDocument(tenantId, rentalId))
      .rejects
      .toMatchObject({ statusCode: 400 });
  });

  it('buildRentalReturnInspectionDocument includes inspection and charges', async () => {
    Rental.findOne.mockResolvedValue(makeRentalMock({
      status: 'returned',
      actualReturnDate: '2026-03-06',
      metadata: {
        return: {
          returnedAt: '2026-03-06T14:00:00.000Z',
          inspectionNotes: 'Minor scratch on bumper',
          daysLate: 1,
        },
      },
      lateCharges: [{
        id: 'lc-1',
        daysLate: 1,
        chargePerDay: 50,
        totalCharge: 50,
        status: 'pending',
      }],
      damageReports: [{
        id: 'dmg-1',
        damageType: 'scratch',
        severity: 'minor',
        description: 'Bumper scratch',
        estimatedRepairCost: 80,
        actualRepairCost: 80,
        product: { name: 'Mini Bus' },
      }],
    }));

    const document = await buildRentalReturnInspectionDocument(tenantId, rentalId);

    expect(document.documentType).toBe('return_inspection');
    expect(document.documentNumber).toBe('RNT-AAAAAAAA-RET');
    expect(document.returnInfo.inspectionNotes).toBe('Minor scratch on bumper');
    expect(document.lateChargesSummary).toHaveLength(1);
    expect(document.damageReports).toHaveLength(1);
    expect(document.financials.lateChargeTotal).toBe(50);
    expect(document.financials.damageTotal).toBe(80);
  });
});
