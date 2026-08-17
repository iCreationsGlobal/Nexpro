import { describe, it, expect } from 'vitest';
import { detectAssistantPeriodKeyFromMessage } from '../../utils/assistantPeriod';
import { ASSISTANT_PERIOD_TO_DATE_FILTER } from '../../pages/reports/smart-report/smartReportConstants';

describe('Smart Report free-text period NLP', () => {
  it('detects this month and maps to DateRangePicker preset', () => {
    const key = detectAssistantPeriodKeyFromMessage(
      'How profitable were we this month compared to last?'
    );
    expect(key).toBe('month');
    expect(ASSISTANT_PERIOD_TO_DATE_FILTER[key]).toBe('thisMonth');
  });

  it('detects today, yesterday, this week, and this year', () => {
    expect(detectAssistantPeriodKeyFromMessage('Sales today')).toBe('today');
    expect(detectAssistantPeriodKeyFromMessage('What happened yesterday?')).toBe('yesterday');
    expect(detectAssistantPeriodKeyFromMessage('Cash this week')).toBe('week');
    expect(detectAssistantPeriodKeyFromMessage('Growth this year')).toBe('year');
  });

  it('returns null when no clear relative period is mentioned', () => {
    expect(detectAssistantPeriodKeyFromMessage('Where is margin leaking?')).toBeNull();
  });
});
