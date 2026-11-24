const { cut, parts, toWhatsApp } = require('../../../utils/whatsappText');

describe('whatsappText', () => {
  it('turns Markdown into WhatsApp text', () => {
    expect(toWhatsApp('## Sales\n\n**GH₵8,420** today, up __40%__.\n\n- Coke\n* Fanta\n\n\n\nSee [invoices](/invoices).', (path) => `https://app${path}`))
      .toBe('*Sales*\n\n*GH₵8,420* today, up *40%*.\n\n• Coke\n• Fanta\n\nSee invoices: https://app/invoices.');
    expect(toWhatsApp('`x` ```js\ny\n```')).toBe('x y');
    expect(toWhatsApp('*already bold* and 5 * 3')).toBe('*already bold* and 5 * 3');
    expect(toWhatsApp(null)).toBe('');
  });

  it('cuts by characters people see, not halves of an emoji', () => {
    expect(cut('Compare with yesterday', 20)).toBe('Compare with yester…');
    expect(cut('🎉🎉🎉', 2)).toBe('🎉…');
    expect(cut('  short ', 20)).toBe('short');
  });

  it('splits long text at a line or a space', () => {
    expect(parts('one two three', 8)).toEqual(['one two', 'three']);
    expect(parts('a'.repeat(10), 4)).toEqual(['aaaa', 'aaaa', 'aa']);
    expect(parts('')).toEqual([]);
  });
});
