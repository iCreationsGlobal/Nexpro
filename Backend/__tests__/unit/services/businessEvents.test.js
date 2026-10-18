const { BUSINESS_EVENT_TYPES, emitBusinessEvent } = require('../../../services/businessEvents');

describe('businessEvents', () => {
  it('lists the event contract shared with Lynk', () => {
    expect(BUSINESS_EVENT_TYPES).toEqual([
      'sale.completed',
      'order.created',
      'order.status_changed',
      'invoice.sent',
      'invoice.paid',
      'payment.received',
      'quote.sent',
      'quote.accepted',
      'job.created',
      'job.assigned',
      'job.completed',
      'lead.created',
      'lead.assigned',
      'customer.created',
      'stock.low',
      'stock.out',
      'task.assigned',
      'rental.created',
      'rental.checked_out',
      'rental.returned',
      'rental.cancelled',
    ]);
  });

  it('cannot be changed at runtime', () => {
    expect(Object.isFrozen(BUSINESS_EVENT_TYPES)).toBe(true);
  });

  it('returns immediately without throwing for valid, unknown and malformed input', () => {
    expect(emitBusinessEvent('tenant-1', 'sale.completed', { saleId: 'sale-1' })).toBeUndefined();
    expect(() => emitBusinessEvent('tenant-1', 'not.an.event')).not.toThrow();
    expect(() => emitBusinessEvent(null, 'sale.completed')).not.toThrow();
    expect(() => emitBusinessEvent(undefined, undefined, undefined)).not.toThrow();
    expect(() => emitBusinessEvent('tenant-1', { type: 'sale.completed' }, null)).not.toThrow();
  });
});
