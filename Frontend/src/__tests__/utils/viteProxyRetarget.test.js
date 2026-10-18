import {
  isTransientProxyError,
  shouldRetargetAfterProxyError,
} from '../../../scripts/resolveLocalBackendUrl.mjs';

describe('Vite proxy retarget', () => {
  it('does not retarget on a transient hang-up', () => {
    expect(isTransientProxyError(new Error('socket hang up'))).toBe(true);
    expect(shouldRetargetAfterProxyError({
      err: new Error('socket hang up'),
    })).toBe(false);
  });

  it('still retargets when the backend connection is refused', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:5001');
    err.code = 'ECONNREFUSED';
    expect(shouldRetargetAfterProxyError({ err })).toBe(true);
  });
});
