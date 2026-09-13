import {
  isLongWatchProxyPath,
  isTransientProxyError,
  shouldRetargetAfterProxyError,
} from '../../../scripts/resolveLocalBackendUrl.mjs';

describe('Vite Watch proxy retarget', () => {
  it('does not flap ports on clips/process hang-up', () => {
    expect(isLongWatchProxyPath('/api/watch/clips/process')).toBe(true);
    expect(isLongWatchProxyPath('/watch/clips/process')).toBe(true);
    expect(shouldRetargetAfterProxyError({
      err: new Error('socket hang up'),
      reqUrl: '/api/watch/clips/process',
    })).toBe(false);
  });

  it('does not retarget on transient hang-up of other routes if classified transient', () => {
    expect(isTransientProxyError(new Error('socket hang up'))).toBe(true);
    expect(shouldRetargetAfterProxyError({
      err: new Error('socket hang up'),
      reqUrl: '/api/notifications/summary',
    })).toBe(false);
  });

  it('still retargets when the backend connection is refused', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:5001');
    err.code = 'ECONNREFUSED';
    expect(shouldRetargetAfterProxyError({
      err,
      reqUrl: '/api/notifications/summary',
    })).toBe(true);
  });
});
