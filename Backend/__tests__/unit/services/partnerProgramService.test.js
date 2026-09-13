/**
 * @jest-environment node
 */

jest.mock('../../../models', () => ({
  PartnerProgramSettings: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  PartnerProgramService: {},
  PartnershipApplication: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Partnership: {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Marketer: {},
  Tenant: { findByPk: jest.fn() },
  Product: {},
  PricingTemplate: {},
  OnlineServiceListing: {},
}));

const {
  PartnerProgramSettings,
  Partnership,
  PartnershipApplication,
  Tenant,
} = require('../../../models');
const { Op } = require('sequelize');
const {
  applyToPartner,
  approveApplication,
  listPublicPartners,
  updateSettings,
  getOrCreateSettings,
} = require('../../../services/partnerProgramService');

describe('partnerProgramService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listPublicPartners returns empty when none listed', async () => {
    PartnerProgramSettings.findAll.mockResolvedValue([]);
    const rows = await listPublicPartners();
    expect(rows).toEqual([]);
  });

  test('applyToPartner blocks when slots full', async () => {
    PartnerProgramSettings.findOne.mockResolvedValue({
      tenantId: 't1',
      enabled: true,
      listed: true,
      maxMarketers: 1,
    });
    Partnership.count.mockResolvedValue(1);
    await expect(
      applyToPartner({ marketerId: 'm1', tenantId: 't1', pitch: 'hi' })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'PARTNER_SLOTS_FULL' });
  });

  test('approveApplication creates partnership with referral code', async () => {
    PartnershipApplication.findOne.mockResolvedValue({
      id: 'app1',
      tenantId: 't1',
      marketerId: 'm1',
      status: 'pending',
      update: jest.fn(),
    });
    Tenant.findByPk.mockResolvedValue({ id: 't1', name: 'Biz' });
    PartnerProgramSettings.findOne.mockResolvedValueOnce({
      id: 'set1',
      tenantId: 't1',
      firstClientRatePercent: 10,
      returningClientRatePercent: 5,
      attributionMonths: 12,
      maxMarketers: 5,
    });
    Partnership.count.mockResolvedValue(0);
    Partnership.findOne.mockResolvedValue(null);
    Partnership.create.mockResolvedValue({
      id: 'part1',
      referralCode: 'SP-ABCD1234',
    });

    const result = await approveApplication({
      tenantId: 't1',
      applicationId: 'app1',
      reviewedBy: 'u1',
    });

    expect(Partnership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        marketerId: 'm1',
        status: 'active',
        firstClientRatePercent: 10,
        returningClientRatePercent: 5,
      })
    );
    expect(result.partnership).toBeTruthy();
  });

  test('listPublicPartners maps stored category id to label', async () => {
    PartnerProgramSettings.findAll.mockResolvedValue([
      {
        id: 'set1',
        tenantId: 't1',
        slug: 'amc',
        displayName: 'AMC Sales and Rentals',
        category: 'vehicle_rental',
        maxMarketers: 10,
        firstClientRatePercent: 10,
        returningClientRatePercent: 5,
        attributionMonths: 12,
        services: [],
      },
    ]);
    Partnership.count.mockResolvedValue(0);
    const rows = await listPublicPartners();
    expect(rows[0].category).toBe('Vehicle rental');
  });

  test('listPublicPartners filters by category group', async () => {
    PartnerProgramSettings.findAll.mockResolvedValue([]);
    await listPublicPartners({ category: 'Rental' });
    const where = PartnerProgramSettings.findAll.mock.calls[0][0].where;
    expect(where.moderationStatus).toBe('approved');
    expect(where.enabled).toBe(true);
    expect(where.listed).toBe(true);
    expect(where.category[Op.in]).toEqual(
      expect.arrayContaining(['vehicle_rental', 'Vehicle rental', 'equipment_rental'])
    );
  });

  test('updateSettings persists category id and rejects a type mismatch', async () => {
    Tenant.findByPk.mockResolvedValue({
      id: 't1',
      businessType: 'rental',
      metadata: { businessSubType: 'vehicle_rental' },
    });
    const settingsRow = {
      id: 'set1',
      tenantId: 't1',
      listed: false,
      enabled: false,
      category: null,
      setupCompletedAt: null,
      moderationStatus: 'draft',
      update: jest.fn(),
    };
    PartnerProgramSettings.findOne.mockResolvedValue(settingsRow);
    PartnerProgramSettings.findByPk.mockResolvedValue(settingsRow);

    await updateSettings('t1', { category: 'Vehicle rental' });
    expect(settingsRow.update).toHaveBeenCalledWith(expect.objectContaining({ category: 'vehicle_rental' }));

    await expect(updateSettings('t1', { category: 'printing_press' })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_PARTNER_CATEGORY',
    });
  });

  test('updateSettings requires category when enabling a listing', async () => {
    Tenant.findByPk.mockResolvedValue({ id: 't1', businessType: 'rental', metadata: {} });
    PartnerProgramSettings.findOne.mockResolvedValue({
      id: 'set1',
      tenantId: 't1',
      listed: false,
      enabled: false,
      category: null,
      setupCompletedAt: null,
      moderationStatus: 'draft',
      update: jest.fn(),
    });

    await expect(updateSettings('t1', { enabled: true, listed: true })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'PARTNER_CATEGORY_REQUIRED',
    });
  });

  test('getOrCreateSettings defaults category from tenant subtype', async () => {
    PartnerProgramSettings.findOne.mockResolvedValue(null);
    Tenant.findByPk.mockResolvedValue({
      id: 't1',
      name: 'AMC Sales and Rentals',
      businessType: 'rental',
      metadata: { businessSubType: 'vehicle_rental' },
    });
    PartnerProgramSettings.create.mockResolvedValue({ id: 'set1' });

    await getOrCreateSettings('t1');
    expect(PartnerProgramSettings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'vehicle_rental',
        displayName: 'AMC Sales and Rentals',
        moderationStatus: 'draft',
      })
    );
  });

  test('updateSettings submits a new listing for review instead of going live', async () => {
    Tenant.findByPk.mockResolvedValue({ id: 't1', businessType: 'rental', metadata: {} });
    const settingsRow = {
      id: 'set1',
      tenantId: 't1',
      listed: false,
      enabled: false,
      category: 'vehicle_rental',
      setupCompletedAt: null,
      moderationStatus: 'draft',
      update: jest.fn(),
    };
    PartnerProgramSettings.findOne.mockResolvedValue(settingsRow);
    PartnerProgramSettings.findByPk.mockResolvedValue(settingsRow);

    await updateSettings('t1', { enabled: true, listed: true });
    expect(settingsRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        listed: true,
        moderationStatus: 'pending',
      })
    );
  });

  test('updateSettings keeps an approved listing live when only max marketers change', async () => {
    Tenant.findByPk.mockResolvedValue({ id: 't1', businessType: 'rental', metadata: {} });
    const settingsRow = {
      id: 'set1',
      tenantId: 't1',
      listed: true,
      enabled: true,
      category: 'vehicle_rental',
      setupCompletedAt: new Date(),
      moderationStatus: 'approved',
      maxMarketers: 10,
      update: jest.fn(),
    };
    PartnerProgramSettings.findOne.mockResolvedValue(settingsRow);
    PartnerProgramSettings.findByPk.mockResolvedValue(settingsRow);

    await updateSettings('t1', { maxMarketers: 12 });
    expect(settingsRow.update).toHaveBeenCalledWith(
      expect.objectContaining({ maxMarketers: 12 })
    );
    expect(settingsRow.update.mock.calls[0][0].moderationStatus).toBeUndefined();
  });

  test('updateSettings sends material listing edits back to pending review', async () => {
    Tenant.findByPk.mockResolvedValue({ id: 't1', businessType: 'rental', metadata: {} });
    const settingsRow = {
      id: 'set1',
      tenantId: 't1',
      listed: true,
      enabled: true,
      category: 'vehicle_rental',
      pitch: 'Old pitch',
      setupCompletedAt: new Date(),
      moderationStatus: 'approved',
      update: jest.fn(),
    };
    PartnerProgramSettings.findOne.mockResolvedValue(settingsRow);
    PartnerProgramSettings.findByPk.mockResolvedValue(settingsRow);

    await updateSettings('t1', { pitch: 'New pitch' });
    expect(settingsRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pitch: 'New pitch',
        moderationStatus: 'pending',
      })
    );
  });
});
