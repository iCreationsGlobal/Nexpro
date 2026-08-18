type AnalyticsEvent = {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
};

const listeners: Array<(event: AnalyticsEvent) => void> = [];

export const analytics = {
  track: (name: string, properties?: AnalyticsEvent['properties']) => {
    const event = { name, properties };
    if (__DEV__) {
      console.log('[analytics]', event);
    }
    listeners.forEach((listener) => listener(event));
  },
  subscribe: (listener: (event: AnalyticsEvent) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  },
};

export const trackScreen = (screen: string) => analytics.track('screen_view', { screen });
