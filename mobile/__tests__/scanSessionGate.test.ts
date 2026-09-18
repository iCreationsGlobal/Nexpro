import { createScanSessionGate } from '@/utils/scanSessionGate';
describe('one camera result per scanner opening', () => {
  it('accepts only one callback even before React could render again', () => {
    const gate = createScanSessionGate();
    const addToCart = jest.fn();
    gate.open();
    for (const code of ['8886304600137', '8886304600137', 'other-code']) {
      if (gate.accept(code)) addToCart(code);
    }
    expect(addToCart).toHaveBeenCalledTimes(1);
  });
  it('allows the same item again when the scanner is reopened', () => {
    const gate = createScanSessionGate();
    gate.open(); expect(gate.accept('123')).toBe(true);
    gate.close(); expect(gate.accept('123')).toBe(false);
    gate.open(); expect(gate.accept('123')).toBe(true);
  });
  it('ignores blank results and late callbacks after cancellation', () => {
    const gate = createScanSessionGate();
    gate.open(); expect(gate.accept('  ')).toBe(false);
    expect(gate.accept('123')).toBe(true);
    gate.open(); gate.close(); expect(gate.accept('456')).toBe(false);
  });
});
