import { describe, expect, it } from 'vitest';
import {
  buildAssistantReportHtml,
  formatOrganizationAddress,
} from '../../utils/buildAssistantReportHtml';

describe('buildAssistantReportHtml', () => {
  it('formats nested organization addresses', () => {
    expect(
      formatOrganizationAddress({
        line1: '12 High St',
        city: 'Accra',
        country: 'Ghana',
      })
    ).toBe('12 High St, Accra, Ghana');
  });

  it('includes company branding, question, and period', () => {
    const html = buildAssistantReportHtml({
      content: 'You sold **₵1,200** today.',
      question: 'How much did I sell today?',
      periodLabel: 'Today',
      organization: {
        name: 'Acme Shop',
        phone: '0200000000',
        email: 'hello@acme.test',
        website: 'https://acme.test',
        address: { line1: '12 High St', city: 'Accra', country: 'Ghana' },
        tax: { vatNumber: 'VAT-1', tin: 'TIN-2' },
        logoUrl: 'https://cdn.example.com/logo.png',
      },
      generatedAt: new Date('2026-08-06T10:00:00Z'),
    });

    expect(html).toContain('Acme Shop');
    expect(html).toContain('0200000000');
    expect(html).toContain('hello@acme.test');
    expect(html).toContain('Ayebia Insight Report');
    expect(html).toContain('Today');
    expect(html).toContain('How much did I sell today?');
    expect(html).toContain('https://cdn.example.com/logo.png');
    expect(html).toContain('VAT: VAT-1');
    expect(html).toContain('₵1,200');
  });

  it('escapes unsafe organization fields', () => {
    const html = buildAssistantReportHtml({
      content: 'Safe answer',
      organization: { name: '<script>alert(1)</script>' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
