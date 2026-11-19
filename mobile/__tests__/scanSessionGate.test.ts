import { createScanSessionGate, SCAN_REPEAT_DELAY_MS } from '@/utils/scanSessionGate';
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

describe('keep-scanning repeat rule (selling)', () => {
  function gateAt() {
    let time = 0;
    const gate = createScanSessionGate({ continuous: true, now: () => time });
    gate.open();
    return {
      gate,
      at(ms: number, code: string) {
        time = ms;
        return gate.accept(code);
      },
      setTime(ms: number) { time = ms; },
    };
  }

  it('waits 1.5 seconds', () => {
    expect(SCAN_REPEAT_DELAY_MS).toBe(1500);
  });

  it('counts a label held under the camera once, however long it stays there', () => {
    const { at } = gateAt();
    let counted = 0;
    // The camera reports the same label every 200 ms for 6 seconds.
    for (let ms = 0; ms <= 6000; ms += 200) {
      if (at(ms, '8886304600137')) counted += 1;
    }
    expect(counted).toBe(1);
  });

  it('counts the same code again once it has been out of view for 1.5 s', () => {
    const { at } = gateAt();
    expect(at(0, 'A')).toBe(true);
    expect(at(400, 'A')).toBe(false); // still under the camera
    // Out of view from 400 ms; seen again 1.5 s after it was last seen.
    expect(at(1900, 'A')).toBe(true);
  });

  it('does not count it again when the gap is shorter than 1.5 s, and that sighting restarts the wait', () => {
    const { at } = gateAt();
    expect(at(0, 'A')).toBe(true);
    expect(at(1499, 'A')).toBe(false);
    expect(at(2000, 'A')).toBe(false); // only 501 ms since it was last seen
    expect(at(3500, 'A')).toBe(true);
  });

  it('accepts a different code at once', () => {
    const { at } = gateAt();
    expect(at(0, 'A')).toBe(true);
    expect(at(10, 'B')).toBe(true);
    expect(at(20, 'C')).toBe(true);
    expect(at(30, 'B')).toBe(false);
  });

  it('keeps counting after the first code (no one-scan limit)', () => {
    const { at } = gateAt();
    expect(at(0, 'A')).toBe(true);
    expect(at(2000, 'A')).toBe(true);
    expect(at(4000, 'A')).toBe(true);
  });

  it('remembers codes seen while counting is paused (size picker open)', () => {
    const { gate, at, setTime } = gateAt();
    expect(at(0, 'A')).toBe(true);
    setTime(1000); gate.observe('A');
    setTime(2400); gate.observe('A');
    // Picker closes; the label is still under the camera.
    expect(at(2600, 'A')).toBe(false);
    expect(at(4200, 'A')).toBe(true);
  });

  it('starts fresh on each opening and ignores scans after closing', () => {
    const { gate, at } = gateAt();
    expect(at(0, 'A')).toBe(true);
    gate.close();
    expect(at(5000, 'B')).toBe(false);
    gate.open();
    expect(at(5001, 'A')).toBe(true);
  });
});
