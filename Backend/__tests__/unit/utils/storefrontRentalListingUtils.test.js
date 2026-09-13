const {
  resolveListingCommerceMode,
  resolveRentalRatePerDay,
  resolveRentalTerms,
  buildPublicRentalListingFields,
  buildPublicRentalPolicySummary,
  resolveListingPublicPriceFromProduct,
  buildSampleProductRentalFields,
} = require('../../../utils/storefrontRentalListingUtils');

describe('storefrontRentalListingUtils', () => {
  describe('resolveListingCommerceMode', () => {
    it('returns rent mode for rent-only products', () => {
      expect(resolveListingCommerceMode({ isRentable: true, isSalable: false })).toMatchObject({
        listingMode: 'rent',
        isRentable: true,
        isSalable: false,
      });
    });

    it('returns both mode when rentable and salable', () => {
      expect(resolveListingCommerceMode({ isRentable: true, isSalable: true })).toMatchObject({
        listingMode: 'both',
      });
    });
  });

  describe('resolveRentalRatePerDay', () => {
    it('prefers product rentalRatePerDay', () => {
      expect(resolveRentalRatePerDay({ rentalRatePerDay: 120 }, null)).toBe(120);
    });

    it('falls back to listing publicPrice for rent-only listings', () => {
      expect(resolveRentalRatePerDay(
        { isRentable: true, isSalable: false },
        { publicPrice: 85 },
      )).toBe(85);
    });
  });

  describe('resolveRentalTerms', () => {
    it('prefers product metadata terms', () => {
      expect(resolveRentalTerms(
        { metadata: { rentalTerms: 'No off-road use.' } },
        { metadata: { rentalTerms: 'Listing terms' } },
        'Store terms',
      )).toBe('No off-road use.');
    });

    it('falls back to store-level terms', () => {
      expect(resolveRentalTerms({ metadata: {} }, {}, 'Store terms')).toBe('Store terms');
    });
  });

  describe('buildPublicRentalListingFields', () => {
    it('maps rent-only inventory onto public listing payload fields', () => {
      const fields = buildPublicRentalListingFields(
        {
          isRentable: true,
          isSalable: false,
          rentalRatePerDay: 350,
          metadata: { rentalTerms: 'Licensed driver required.' },
        },
        { publicPrice: 350 },
      );
      expect(fields).toMatchObject({
        listingMode: 'rent',
        rentalRatePerDay: 350,
        rentalTerms: 'Licensed driver required.',
      });
    });
  });

  describe('buildPublicRentalPolicySummary', () => {
    it('builds deposit and late fee bullets', () => {
      const bullets = buildPublicRentalPolicySummary({
        defaultDepositPercent: 20,
        lateChargeRatePercent: 50,
        gracePeriodValue: 2,
        gracePeriodUnit: 'hours',
        requireIdVerification: true,
      });
      expect(bullets).toEqual(expect.arrayContaining([
        'Security deposit: 20% of rental total',
        expect.stringContaining('Late return fee: 50%'),
        'Valid ID required for rental pickup',
      ]));
    });
  });

  describe('resolveListingPublicPriceFromProduct', () => {
    it('uses rental rate for rent-only products without explicit publicPrice', () => {
      const price = resolveListingPublicPriceFromProduct(
        {},
        { isRentable: true, isSalable: false, rentalRatePerDay: 95 },
      );
      expect(price).toBe(95);
    });

    it('respects explicit publicPrice in body', () => {
      const price = resolveListingPublicPriceFromProduct(
        { publicPrice: 200 },
        { isRentable: true, isSalable: false, rentalRatePerDay: 95 },
      );
      expect(price).toBe(200);
    });
  });

  describe('buildSampleProductRentalFields', () => {
    it('defaults rental tenant samples to rent-only with daily rate', () => {
      const fields = buildSampleProductRentalFields(
        { publicPrice: 450, rentalTerms: 'Deposit required.' },
        { businessType: 'rental' },
      );
      expect(fields).toMatchObject({
        isRentable: true,
        isSalable: false,
        rentalRatePerDay: 450,
        sellingPrice: 0,
      });
      expect(fields.metadata.rentalTerms).toBe('Deposit required.');
    });

    it('keeps shop tenant samples salable', () => {
      const fields = buildSampleProductRentalFields(
        { publicPrice: 89 },
        { businessType: 'shop' },
      );
      expect(fields).toMatchObject({
        isRentable: false,
        isSalable: true,
        rentalRatePerDay: null,
        sellingPrice: 89,
      });
    });
  });
});
