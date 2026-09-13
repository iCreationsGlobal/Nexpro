const {
  buildSourceLink,
  SOURCE_EVENT_REASON
} = require('../../../services/taskAutomationService');

describe('taskAutomationService helpers', () => {
  test('buildSourceLink returns deep links', () => {
    expect(buildSourceLink('invoice', 'inv-1')).toBe('/invoices?openInvoiceId=inv-1');
    expect(buildSourceLink('lead', 'lead-1')).toBe('/leads?openLeadId=lead-1');
    expect(buildSourceLink('quote', 'q-1')).toBe('/quotes?openQuoteId=q-1');
    expect(buildSourceLink('stock', 's-1')).toBe('/materials?openItemId=s-1');
    expect(buildSourceLink('unknown', 'x')).toBeNull();
  });

  test('SOURCE_EVENT_REASON covers automation events', () => {
    expect(SOURCE_EVENT_REASON.overdue_follow_up).toMatch(/overdue/i);
    expect(SOURCE_EVENT_REASON.follow_up).toBeTruthy();
  });
});
