import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Modal: 'Modal',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
  useColorScheme: () => 'light',
}));
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ seekTo: () => Promise.resolve(), play: jest.fn() }),
}));
jest.mock('@/assets/sounds/scan-beep.wav', () => 1);
jest.mock('@/components/AppIcon', () => ({ AppIcon: 'AppIcon' }));

import { BarcodeScanner } from '@/components/BarcodeScanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

type Props = React.ComponentProps<typeof BarcodeScanner>;

/** Mimics a screen: onClose hides the scanner. */
function renderScanner(props: Partial<Props>) {
  const onScan = jest.fn();
  const onClose = jest.fn();
  let renderer: ReactTestRenderer;
  let current: Props = { visible: true, onScan, onClose, ...props };
  const render = () => React.createElement(BarcodeScanner, current);
  onClose.mockImplementation(() => {
    current = { ...current, visible: false };
    act(() => { renderer.update(render()); });
  });
  act(() => { renderer = TestRenderer.create(render()); });
  const camera = () => renderer.root.findAllByType('CameraView' as never)[0];
  return {
    onScan,
    onClose,
    camera,
    /** What the camera does when it sees a code. */
    see(data: string) {
      const cam = camera();
      const handler = cam?.props.onBarcodeScanned;
      if (handler) act(() => { handler({ data }); });
    },
    update(next: Partial<Props>) {
      current = { ...current, ...next };
      act(() => { renderer.update(render()); });
    },
    renderer: () => renderer,
  };
}

describe('BarcodeScanner one-scan uses (product barcode box, search box camera)', () => {
  it('passes on one scan and closes', () => {
    const scanner = renderScanner({});
    scanner.see('8886304600137');
    expect(scanner.onScan).toHaveBeenCalledTimes(1);
    expect(scanner.onScan).toHaveBeenCalledWith('8886304600137');
    expect(scanner.onClose).toHaveBeenCalledTimes(1);
    expect(scanner.camera()).toBeUndefined();
  });

  it('ignores repeat callbacks that arrive before it has closed', () => {
    const onScan = jest.fn();
    const onClose = jest.fn(); // the screen has not hidden it yet
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(BarcodeScanner, { visible: true, onScan, onClose }));
    });
    const handler = renderer!.root.findAllByType('CameraView' as never)[0].props.onBarcodeScanned;
    act(() => {
      handler({ data: 'A' });
      handler({ data: 'A' });
      handler({ data: 'B' });
    });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BarcodeScanner keep-scanning mode (selling)', () => {
  let now = 0;
  beforeEach(() => {
    now = 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  it('stays open and passes on each new code', () => {
    const scanner = renderScanner({ continuous: true, footer: React.createElement('Text', null, 'strip') });
    scanner.see('A');
    now += 50;
    scanner.see('B');
    expect(scanner.onScan.mock.calls).toEqual([['A'], ['B']]);
    expect(scanner.onClose).not.toHaveBeenCalled();
    expect(scanner.camera()).toBeDefined();
    expect(scanner.renderer().root.findAll((node) => node.props.children === 'strip').length).toBeGreaterThan(0);
  });

  it('counts a held label once and the same code again after 1.5 s out of view', () => {
    const scanner = renderScanner({ continuous: true });
    for (let i = 0; i < 10; i += 1) {
      scanner.see('A');
      now += 200;
    }
    expect(scanner.onScan).toHaveBeenCalledTimes(1);
    now += 1500;
    scanner.see('A');
    expect(scanner.onScan).toHaveBeenCalledTimes(2);
  });

  it('does not count codes while paused, and remembers them', () => {
    const scanner = renderScanner({ continuous: true, paused: true });
    scanner.see('A');
    expect(scanner.onScan).not.toHaveBeenCalled();
    scanner.update({ paused: false });
    now += 500;
    scanner.see('A'); // still under the camera from before
    expect(scanner.onScan).not.toHaveBeenCalled();
    now += 1500;
    scanner.see('A');
    expect(scanner.onScan).toHaveBeenCalledTimes(1);
  });

  it('closes only from the close button', () => {
    const scanner = renderScanner({ continuous: true });
    scanner.see('A');
    const close = scanner.renderer().root.findAll(
      (node) => node.props.accessibilityLabel === 'Close camera' && typeof node.props.onPress === 'function'
    )[0];
    act(() => { close.props.onPress(); });
    expect(scanner.onClose).toHaveBeenCalledTimes(1);
  });
});
