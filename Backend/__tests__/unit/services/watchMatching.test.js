const {
  clampMatchWindowMinutes,
  matchWindowMs,
  isCounterEventType,
  isMatchableSaleStatus,
  findBestSaleMatch,
  classifyIncidentKind,
  copyForKind,
} = require('../../../services/watchMatching');
const { INCIDENT_KINDS } = require('../../../config/watchConstants');

describe('watchMatching', () => {
  it('clamps the sale match window to 3–10 minutes', () => {
    expect(clampMatchWindowMinutes()).toBe(5);
    expect(clampMatchWindowMinutes(1)).toBe(3);
    expect(clampMatchWindowMinutes(30)).toBe(10);
    expect(clampMatchWindowMinutes('7')).toBe(7);
    expect(matchWindowMs(5)).toBe(5 * 60 * 1000);
  });

  it('treats till linger as a match candidate, not zone-enter', () => {
    expect(isCounterEventType('counter_interaction')).toBe(true);
    expect(isCounterEventType('person_entered_counter_zone')).toBe(false);
    expect(isCounterEventType('transaction_candidate')).toBe(false);
    expect(isCounterEventType('person_entered')).toBe(false);
  });

  it('matches against completed POS sales and ignores cancelled ones', () => {
    expect(isMatchableSaleStatus('completed')).toBe(true);
    expect(isMatchableSaleStatus('cancelled')).toBe(false);
  });

  it('picks the closest unused sale within the window', () => {
    const eventTime = '2026-08-30T10:35:03.000Z';
    const sales = [
      { id: 'far', createdAt: '2026-08-30T10:50:00.000Z', status: 'completed' },
      { id: 'near', createdAt: '2026-08-30T10:35:07.000Z', status: 'completed' },
      { id: 'used', createdAt: '2026-08-30T10:35:04.000Z', status: 'completed' },
    ];

    const match = findBestSaleMatch({
      eventTime,
      sales,
      windowMs: 5 * 60 * 1000,
      usedSaleIds: new Set(['used']),
    });

    expect(match.sale.id).toBe('near');
    expect(match.deltaMs).toBe(4000);
  });

  it('returns no match when no sale is in the window', () => {
    const match = findBestSaleMatch({
      eventTime: '2026-08-30T10:35:03.000Z',
      sales: [{ id: 'late', createdAt: '2026-08-30T11:00:00.000Z', status: 'completed' }],
      windowMs: 5 * 60 * 1000,
    });
    expect(match).toBeNull();
    expect(classifyIncidentKind({ sale: null })).toBe(INCIDENT_KINDS.UNMATCHED_INTERACTION);
    expect(copyForKind(INCIDENT_KINDS.UNMATCHED_INTERACTION)).toMatch(/till zone/i);
    expect(copyForKind(INCIDENT_KINDS.UNMATCHED_INTERACTION)).toMatch(/Review required/);
    expect(copyForKind(INCIDENT_KINDS.UNMATCHED_INTERACTION)).not.toMatch(/stole/i);
  });
});
