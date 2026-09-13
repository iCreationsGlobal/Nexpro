import {
  HIRE_PAYMENT_CREDIT,
  HIRE_PAYMENT_FULL,
  HIRE_PAYMENT_PARTIAL,
  buildCreateRentalPayload,
  estimateHireDue,
  getTomorrowIsoDate,
  parseAvailabilityItems,
  unwrapCreatedRentalId,
  validateRentalCreateDraft,
  type RentalCreateDraft,
} from '@/utils/rentalCreate';
import {
  DAY_BILLING_END_OF_DAY,
  DAY_BILLING_OVERNIGHT,
  getEndDateFromDuration,
  getLocalIsoDate,
  getRentalDayCount,
} from '@/utils/rentalDayBilling';

function draft(overrides: Partial<RentalCreateDraft> = {}): RentalCreateDraft {
  return {
    customerId: 'cust-1',
    startDate: '2026-09-01',
    durationDays: 2,
    hirePaymentMode: HIRE_PAYMENT_CREDIT,
    promisedPaymentDate: getTomorrowIsoDate(),
    items: [{ productId: 'prod-1', quantity: 1, rentalRatePerDay: 100 }],
    ...overrides,
  };
}

describe('rentalDayBilling', () => {
  it('counts inclusive days for end-of-day (cars)', () => {
    expect(getRentalDayCount('2026-09-01', '2026-09-01', DAY_BILLING_END_OF_DAY)).toBe(1);
    expect(getRentalDayCount('2026-09-01', '2026-09-02', DAY_BILLING_END_OF_DAY)).toBe(2);
    expect(getEndDateFromDuration('2026-09-01', 2, DAY_BILLING_END_OF_DAY)).toBe('2026-09-02');
  });

  it('counts nights for overnight (equipment)', () => {
    expect(getRentalDayCount('2026-09-01', '2026-09-02', DAY_BILLING_OVERNIGHT)).toBe(1);
    expect(getEndDateFromDuration('2026-09-01', 1, DAY_BILLING_OVERNIGHT)).toBe('2026-09-02');
  });
});

describe('validateRentalCreateDraft', () => {
  it('requires customer, dates, and items', () => {
    expect(validateRentalCreateDraft(draft({ customerId: '' }))).toMatch(/customer/i);
    expect(validateRentalCreateDraft(draft({ items: [] }))).toMatch(/item/i);
    expect(validateRentalCreateDraft(draft({ startDate: 'not-a-date' }))).toMatch(/start date/i);
  });

  it('requires a promised date for credit and part payment', () => {
    expect(validateRentalCreateDraft(draft({
      hirePaymentMode: HIRE_PAYMENT_CREDIT,
      promisedPaymentDate: '',
    }))).toMatch(/promised payment date/i);

    expect(validateRentalCreateDraft(draft({
      hirePaymentMode: HIRE_PAYMENT_PARTIAL,
      hireAmountPaid: 50,
      promisedPaymentDate: '',
    }))).toMatch(/promised payment date/i);
  });

  it('rejects a promised date in the past', () => {
    expect(validateRentalCreateDraft(draft({
      hirePaymentMode: HIRE_PAYMENT_CREDIT,
      promisedPaymentDate: '2000-01-01',
    }))).toMatch(/cannot be in the past/i);
  });

  it('requires part payment to be below hire due', () => {
    expect(validateRentalCreateDraft(draft({
      hirePaymentMode: HIRE_PAYMENT_PARTIAL,
      hireAmountPaid: 200,
      promisedPaymentDate: '2026-09-10',
    }))).toMatch(/less than the hire due/i);

    expect(validateRentalCreateDraft(draft({
      hirePaymentMode: HIRE_PAYMENT_PARTIAL,
      hireAmountPaid: 50,
    }))).toBeNull();
  });

  it('accepts full payment without a promised date', () => {
    expect(validateRentalCreateDraft(draft({
      hirePaymentMode: HIRE_PAYMENT_FULL,
      promisedPaymentDate: '',
    }))).toBeNull();
  });
});

describe('buildCreateRentalPayload', () => {
  it('sends credit with zero paid and paymentMethod credit', () => {
    const promisedPaymentDate = getTomorrowIsoDate();
    expect(buildCreateRentalPayload(draft({
      hirePaymentMode: HIRE_PAYMENT_CREDIT,
      promisedPaymentDate,
      operationalLocation: 'Airport',
    }))).toMatchObject({
      customerId: 'cust-1',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      paymentMethod: 'credit',
      amountPaid: 0,
      promisedPaymentDate,
      operationalLocation: 'Airport',
      items: [{ productId: 'prod-1', quantity: 1, rentalRatePerDay: 100 }],
    });
  });

  it('sends full hire due when collecting in full', () => {
    const payload = buildCreateRentalPayload(draft({
      hirePaymentMode: HIRE_PAYMENT_FULL,
      paymentMethod: 'mobile_money',
    }));
    expect(payload.amountPaid).toBe(200);
    expect(payload.paymentMethod).toBe('mobile_money');
    expect(payload.promisedPaymentDate).toBeUndefined();
  });

  it('sends the part amount and keeps the promised date', () => {
    const payload = buildCreateRentalPayload(draft({
      hirePaymentMode: HIRE_PAYMENT_PARTIAL,
      hireAmountPaid: '75',
      paymentMethod: 'cash',
      promisedPaymentDate: getTomorrowIsoDate(),
      depositAmount: '20',
    }));
    expect(payload).toMatchObject({
      amountPaid: 75,
      paymentMethod: 'cash',
      promisedPaymentDate: getTomorrowIsoDate(),
      depositAmount: 20,
      depositPaid: true,
    });
  });

  it('estimates hire due from daily rate × billable days − discount', () => {
    expect(estimateHireDue(
      [{ productId: 'p1', quantity: 2, rentalRatePerDay: 50 }],
      '2026-09-01',
      '2026-09-03',
      10,
      DAY_BILLING_END_OF_DAY
    )).toBe(290);
  });
});

describe('create rental response helpers', () => {
  it('unwraps the created rental id', () => {
    expect(unwrapCreatedRentalId({ data: { id: 'rental-9' } })).toBe('rental-9');
    expect(unwrapCreatedRentalId({ success: true, data: { data: { id: 'nested' } } })).toBe('nested');
  });

  it('reads availability rows from the API envelope', () => {
    expect(parseAvailabilityItems({
      success: true,
      data: { items: [{ productId: 'p1', canFulfill: false, availableQty: 0 }] },
    })).toEqual([{ productId: 'p1', canFulfill: false, availableQty: 0 }]);
  });

  it('formats a local calendar date', () => {
    expect(getLocalIsoDate(new Date(2026, 8, 1))).toBe('2026-09-01');
  });
});
