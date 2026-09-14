import { useEffect, useRef } from 'react';

// Scanner keystrokes land tens of ms apart; real typing is ~100ms+ per character.
// Gaps above this reset the buffer to reduce false positives from normal typing.
const MAX_INTERVAL_MS = 50;
const MIN_CODE_LENGTH = 3;

/**
 * Detects a USB/Bluetooth barcode scanner acting as a keyboard (keyboard-wedge): it types
 * the code's characters in a fast burst, then sends Enter or Tab. Calls onScan(code) when that
 * pattern is seen; uses timing to distinguish scans from normal typing.
 *
 * Does not require any input to be focused — listens at the document level, since a
 * physical scanner should work whenever the page is open, not just inside a specific field.
 *
 * @param {(code: string) => void} onScan
 * @param {{ enabled?: boolean }} [options]
 */
export function useHardwareBarcodeScanner(onScan, { enabled = true } = {}) {
  const bufferRef = useRef('');
  const lastTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    console.info('[HardwareScanner] Listener status:', enabled ? 'ready' : 'disabled — external scanners are not enabled');
    bufferRef.current = '';
    lastTimeRef.current = 0;
    if (!enabled) {
      bufferRef.current = '';
      return undefined;
    }

    const handleKeyDown = (event) => {
      // A modifier combo (Ctrl+C, Cmd+R, etc.) is never part of a scan — clear and ignore.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        bufferRef.current = '';
        return;
      }

      // Shift is emitted between characters by scanners sending uppercase or symbols.
      if (event.key === 'Shift') return;

      const now = Date.now();
      const elapsedSinceLastKey = now - lastTimeRef.current;

      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = bufferRef.current;
        bufferRef.current = '';
        if (code.length >= MIN_CODE_LENGTH && elapsedSinceLastKey <= MAX_INTERVAL_MS) {
          console.info('[HardwareScanner] Detected scan:', code);
          event.preventDefault();
          // Consume the suffix before focused controls or React handlers can act on it.
          event.stopPropagation();
          onScanRef.current?.(code);
        } else if (code) {
          console.info('[HardwareScanner] Input rejected:', {
            length: code.length,
            elapsedSinceLastKey,
            reason: code.length < MIN_CODE_LENGTH ? 'too short or interrupted' : 'terminator arrived too late',
          });
        }
        return;
      }

      // A single printable character (letters, digits, common barcode symbols like - . $).
      if (event.key.length === 1) {
        if (elapsedSinceLastKey > MAX_INTERVAL_MS) {
          // Gap too large to be a continuation of a scan burst — start over from this key.
          bufferRef.current = '';
        }
        bufferRef.current += event.key;
        lastTimeRef.current = now;
        return;
      }

      // Any other key (Backspace, Tab, arrows, etc.) interrupts a potential scan burst.
      bufferRef.current = '';
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
}
