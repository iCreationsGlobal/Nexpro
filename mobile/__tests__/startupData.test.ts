import { canRevealStartupData, STARTUP_DATA_WAIT_MS } from '../utils/startupData';

describe('startup data readiness', () => {
  it('waits for the opening screen request to register and finish', () => {
    expect(canRevealStartupData()).toBe(false);
    expect(canRevealStartupData({ status: 'pending', fetchStatus: 'fetching' })).toBe(false);
  });
  it('reveals cached data during background refresh', () => {
    expect(canRevealStartupData({ data: { summary: {} }, status: 'success', fetchStatus: 'fetching' })).toBe(true);
  });
  it('keeps missing data behind startup on errors and offline pauses', () => {
    expect(canRevealStartupData({ status: 'error', fetchStatus: 'idle' })).toBe(false);
    expect(canRevealStartupData({ status: 'pending', fetchStatus: 'paused' })).toBe(false);
  });
  it('offers recovery after a bounded wait', () => {
    expect(STARTUP_DATA_WAIT_MS).toBe(15000);
  });
});
