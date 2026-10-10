import { Fragment, type ReactNode } from 'react';
import { requireOptionalNativeModule } from 'expo';
import type * as ExpoObserve from 'expo-observe';

/**
 * EAS Observe, only when its native modules are in the binary. Expo Go (and builds made before
 * expo-observe was added) lack them, and importing expo-observe there throws at startup, so
 * those runtimes get no-op stand-ins instead.
 */
const hasNativeObserve =
  requireOptionalNativeModule('ExpoObserve') != null &&
  requireOptionalNativeModule('ExpoAppMetrics') != null;

type ObserveRootProps = {
  children: ReactNode;
  errorBoundaryFallback?: ExpoObserve.ObserveErrorBoundaryProps['fallback'];
};

const noopMarkInteractive = () => {};

const observe: Pick<typeof ExpoObserve, 'Observe' | 'useObserve'> & {
  ObserveRoot: (props: ObserveRootProps) => ReactNode;
} = hasNativeObserve
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-observe') as typeof ExpoObserve)
  : {
      Observe: {
        configure: () => {},
        reportError: () => {},
      } as unknown as typeof ExpoObserve.Observe,
      ObserveRoot: ({ children }: ObserveRootProps) => <Fragment>{children}</Fragment>,
      useObserve: () => ({ markInteractive: noopMarkInteractive }),
    };

export const { Observe, ObserveRoot, useObserve } = observe;
export type { ObserveErrorBoundaryFallbackProps } from 'expo-observe';
