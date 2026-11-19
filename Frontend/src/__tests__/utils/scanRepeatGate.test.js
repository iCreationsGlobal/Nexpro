import { describe, it, expect } from 'vitest';
import { createScanRepeatGate, SAME_CODE_PAUSE_MS } from '../../utils/scanRepeatGate';

describe('scanning several items in a row', () => {
  it('counts a label held under the camera once', () => {
    const gate = createScanRepeatGate();
    const seen = [0, 100, 700, 1400, 2100, 2800].map((t) => gate.accept('111', t));
    expect(seen).toEqual([true, false, false, false, false, false]);
  });
  it('counts the same code again once it was out of view for 1.5 s', () => {
    const gate = createScanRepeatGate();
    expect(gate.accept('111', 0)).toBe(true);
    expect(gate.accept('111', SAME_CODE_PAUSE_MS - 1)).toBe(false);
    expect(gate.accept('111', 2 * SAME_CODE_PAUSE_MS)).toBe(true);
  });
  it('counts a different code at once, and ignores empty reads', () => {
    const gate = createScanRepeatGate();
    expect(gate.accept('111', 0)).toBe(true);
    expect(gate.accept('222', 10)).toBe(true);
    expect(gate.accept('  ', 30)).toBe(false);
  });
  it('counts two labels in view together once each, however the camera flips between them', () => {
    const gate = createScanRepeatGate();
    const seen = [['111', 0], ['222', 60], ['111', 120], ['222', 180], ['111', 240]].map(([code, t]) => gate.accept(code, t));
    expect(seen).toEqual([true, true, false, false, false]);
    expect(gate.accept('111', 240 + SAME_CODE_PAUSE_MS)).toBe(true);
  });
});
