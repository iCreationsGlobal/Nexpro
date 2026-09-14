import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useHardwareBarcodeScanner } from '../../hooks/useHardwareBarcodeScanner';

describe('useHardwareBarcodeScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const key = (value, target = document) => act(() => {
    vi.advanceTimersByTime(10);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  });
  it.each(['Enter', 'Tab'])('captures %s scans when an input stops bubbling', (suffix) => {
    const onScan = vi.fn();
    const { unmount } = renderHook(() => useHardwareBarcodeScanner(onScan));
    const input = document.createElement('input');
    document.body.append(input);
    input.addEventListener('keydown', event => event.stopPropagation());
    for (const value of ['Shift', 'A', 'Shift', 'B', '1', suffix]) key(value, input);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('AB1');
    unmount();
    input.remove();
  });
  it('consumes scan Enter before a focused toggle handles it, but preserves normal Enter', () => {
    const onScan = vi.fn();
    const onKeyDown = vi.fn();
    const { unmount } = renderHook(() => useHardwareBarcodeScanner(onScan));
    const toggle = document.createElement('button');
    toggle.setAttribute('role', 'switch');
    document.body.append(toggle);
    toggle.addEventListener('keydown', onKeyDown);
    toggle.focus();
    for (const value of '8886304600137') key(value, toggle);
    onKeyDown.mockClear();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => { toggle.dispatchEvent(enter); });
    expect(onScan).toHaveBeenCalledExactlyOnceWith('8886304600137');
    expect(enter.defaultPrevented).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
    key('Enter', toggle);
    expect(onKeyDown).toHaveBeenCalledOnce();
    unmount();
    toggle.remove();
  });
  it('reports disabled status and ignores input', () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareBarcodeScanner(onScan, { enabled: false }));
    for (const value of ['1', '2', '3', 'Enter']) key(value);
    expect(onScan).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[HardwareScanner] Listener status:', expect.stringContaining('disabled'));
  });
  it('reports delayed input without submitting a scan', () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareBarcodeScanner(onScan));
    for (const value of ['1', '2', '3']) key(value);
    vi.advanceTimersByTime(100);
    key('Enter');
    expect(onScan).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[HardwareScanner] Input rejected:', expect.objectContaining({ reason: 'terminator arrived too late' }));
  });
});
