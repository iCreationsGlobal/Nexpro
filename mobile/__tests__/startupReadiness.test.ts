import { isStartupDestinationReady as ready } from '@/utils/startupReadiness';
describe('startup overlay readiness', () => {
  it('dismisses on the grouped tabs index even though its pathname is slash', () => {
    expect(ready(true, false, false, ['(tabs)'])).toBe(true);
    expect(ready(true, false, false, ['(tabs)', 'index'])).toBe(true);
  });
  it('waits for the redirect from the root index', () => {
    expect(ready(true, false, false, [])).toBe(false);
    expect(ready(true, false, false, ['index'])).toBe(false);
  });
  it('allows login and onboarding while still gating unfinished initialization', () => {
    for (const route of ['login', 'onboarding', 'intro', 'deliveries']) {
      expect(ready(true, false, false, [route])).toBe(true);
      expect(ready(false, false, false, [route])).toBe(false);
      expect(ready(true, true, false, [route])).toBe(false);
      expect(ready(true, false, true, [route])).toBe(false);
    }
  });
});

describe('Simple Mode PIN startup', () => {
  it('reveals the PIN gate without waiting for a route mounted behind it', () => {
    expect(ready(true, false, false, [], true)).toBe(true);
    expect(ready(true, false, false, ['index'], true)).toBe(true);
  });
  it('still waits for fonts and session initialization', () => {
    expect(ready(false, false, false, ['index'], true)).toBe(false);
    expect(ready(true, true, false, ['index'], true)).toBe(false);
    expect(ready(true, false, true, ['index'], true)).toBe(false);
  });
});
