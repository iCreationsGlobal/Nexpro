jest.mock('@/services/api', () => ({
  API_BASE_URL: 'http://localhost:5001',
}));

import { buildMoreMenuSections } from '@/utils/moreMenuItems';
import {
  formatWatchConfidence,
  parseWatchClipSource,
  watchDayParam,
  watchIncidentParams,
} from '@/utils/watch';

describe('watchIncidentParams', () => {
  it('maps filters the same way as the web Watch page', () => {
    expect(watchIncidentParams('attention')).toEqual({ status: 'pending' });
    expect(watchIncidentParams('all')).toEqual({});
    expect(watchIncidentParams('unmatched_interaction')).toEqual({ kind: 'unmatched_interaction' });
    expect(watchIncidentParams('sale_without_event')).toEqual({ kind: 'sale_without_event' });
    expect(watchIncidentParams('confirmed')).toEqual({ status: 'confirmed' });
  });
});

describe('formatWatchConfidence', () => {
  it('shows a percentage or a dash', () => {
    expect(formatWatchConfidence(0.824)).toBe('82%');
    expect(formatWatchConfidence('0.5')).toBe('50%');
    expect(formatWatchConfidence(null)).toBe('—');
    expect(formatWatchConfidence('n/a')).toBe('—');
  });
});

describe('watchDayParam', () => {
  it('gives the local day as YYYY-MM-DD', () => {
    const now = new Date(2026, 0, 1, 9, 30);
    expect(watchDayParam(0, now)).toBe('2026-01-01');
    expect(watchDayParam(1, now)).toBe('2025-12-31');
  });
});

describe('parseWatchClipSource', () => {
  it('reads YouTube clips in every saved form', () => {
    const expected = { type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
    expect(parseWatchClipSource({ id: '1', clipReference: 'youtube:dQw4w9WgXcQ' })).toEqual(expected);
    expect(parseWatchClipSource({ id: '1', clipReference: 'dQw4w9WgXcQ' })).toEqual(expected);
    expect(parseWatchClipSource({ id: '1', clipReference: 'https://youtu.be/dQw4w9WgXcQ' })).toEqual(expected);
    expect(
      parseWatchClipSource({ id: '1', event: { metadata: { watchUrl: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ' } } })
    ).toEqual(expected);
  });

  it('opens uploaded clips from the API and ignores paths on the detection PC', () => {
    const uploaded = parseWatchClipSource({ id: '1', clipReference: '/uploads/watch/t1/clip.mp4' });
    expect(uploaded.type).toBe('video');
    expect(uploaded).toEqual({ type: 'video', url: 'http://localhost:5001/uploads/watch/t1/clip.mp4' });

    expect(parseWatchClipSource({ id: '1', clipReference: 'C:\\clips\\till.mp4' })).toEqual({ type: 'none' });
    expect(parseWatchClipSource({ id: '1' })).toEqual({ type: 'none' });
    expect(parseWatchClipSource(null)).toEqual({ type: 'none' });
  });
});

describe('More menu', () => {
  it('shows Watch only when the workspace has it', () => {
    const withWatch = buildMoreMenuSections({
      isDriver: false,
      businessType: 'shop',
      hasFeature: (feature) => feature === 'watch',
      hasStoreSettings: false,
    });
    const without = buildMoreMenuSections({
      isDriver: false,
      businessType: 'shop',
      hasFeature: () => false,
      hasStoreSettings: false,
    });
    const routes = (sections: ReturnType<typeof buildMoreMenuSections>) =>
      sections.flatMap((section) => section.items.map((item) => item.route));

    expect(routes(withWatch)).toContain('/(tabs)/watch');
    expect(routes(without)).not.toContain('/(tabs)/watch');
  });
});
