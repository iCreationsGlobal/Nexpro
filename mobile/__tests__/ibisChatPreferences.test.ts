import { IBIS_CHAT_PERIOD_OPTIONS, parseIbisChatPreferences } from '@/utils/ibisChatPreferences';

describe('parseIbisChatPreferences', () => {
  it('returns defaults for empty or invalid input', () => {
    expect(parseIbisChatPreferences(null)).toEqual({
      defaultPeriod: 'month',
      showSuggestionChips: true,
    });
    expect(parseIbisChatPreferences('not-json')).toEqual({
      defaultPeriod: 'month',
      showSuggestionChips: true,
    });
  });

  it('accepts today, week, and month and rejects other periods', () => {
    expect(parseIbisChatPreferences({ defaultPeriod: 'today' }).defaultPeriod).toBe('today');
    expect(parseIbisChatPreferences({ defaultPeriod: 'week' }).defaultPeriod).toBe('week');
    expect(parseIbisChatPreferences({ defaultPeriod: 'quarter' }).defaultPeriod).toBe('month');
    expect(IBIS_CHAT_PERIOD_OPTIONS.map((option) => option.key)).toEqual(['today', 'week', 'month']);
  });

  it('treats missing chips as on', () => {
    expect(parseIbisChatPreferences({ showSuggestionChips: false }).showSuggestionChips).toBe(false);
    expect(parseIbisChatPreferences({}).showSuggestionChips).toBe(true);
  });
});
