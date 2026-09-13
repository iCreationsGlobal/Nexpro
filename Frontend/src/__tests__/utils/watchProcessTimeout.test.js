import { WATCH_PROCESS_TIMEOUT_MS } from '../../services/watchService';
import {
  WATCH_DETECTION_TIMEOUT_MESSAGE,
  isWatchProcessWaitError,
} from '../../utils/watchProcessClient';
import { getErrorMessage } from '../../utils/toast';

describe('Watch process timeouts', () => {
  it('waits at least 3 minutes on detect POSTs (not the 30s axios default)', () => {
    expect(WATCH_PROCESS_TIMEOUT_MS).toBeGreaterThanOrEqual(180000);
  });

  it('maps axios/proxy waits to detection copy, not offline internet', () => {
    const aborted = new Error('timeout of 300000ms exceeded');
    aborted.code = 'ECONNABORTED';
    expect(isWatchProcessWaitError(aborted)).toBe(true);
    expect(isWatchProcessWaitError(new Error('Network Error'))).toBe(true);
    expect(WATCH_DETECTION_TIMEOUT_MESSAGE).toMatch(/shorter clip/i);
    expect(WATCH_DETECTION_TIMEOUT_MESSAGE).not.toMatch(/internet/i);
  });
});

describe('getErrorMessage timeouts', () => {
  it('does not call a timeout "check your internet"', () => {
    const aborted = new Error('timeout of 30000ms exceeded');
    aborted.code = 'ECONNABORTED';
    expect(getErrorMessage(aborted)).not.toMatch(/internet/i);
    expect(getErrorMessage(aborted)).toMatch(/longer than expected/i);
  });
});
