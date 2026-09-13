import {
  drawPersonBoxes,
  findFrameAtTime,
  firstDetectionTime,
  hashTrackColor,
  personLegend,
} from '../../utils/watchDetectionsOverlay';

const FRAMES = [
  {
    t: 0,
    detections: [{ track_id: '7', bbox: [0.1, 0.2, 0.3, 0.8], confidence: 0.9 }],
  },
  {
    t: 2,
    detections: [
      { track_id: '7', bbox: [0.2, 0.2, 0.4, 0.8], confidence: 0.88 },
      { track_id: '12', bbox: [0.6, 0.3, 0.8, 0.9], confidence: 0.7 },
    ],
  },
  {
    t: 4,
    detections: [{ track_id: '12', bbox: [0.5, 0.3, 0.7, 0.9], confidence: 0.6 }],
  },
];

describe('watchDetectionsOverlay', () => {
  it('hashes track ids to distinct palette colors, not names', () => {
    expect(hashTrackColor('7')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(hashTrackColor('7')).toBe(hashTrackColor('7'));
    const colors = [hashTrackColor('7'), hashTrackColor('12'), hashTrackColor('99')];
    expect(new Set(colors).size).toBeGreaterThan(1);
    expect(colors.join(' ').toLowerCase()).not.toMatch(/person|name|face/);
  });

  it('labels first-seen tracks Person 1…N', () => {
    expect(personLegend(FRAMES).map((entry) => entry.label)).toEqual(['Person 1', 'Person 2']);
    expect(personLegend(FRAMES)[0].trackId).toBe('7');
    expect(personLegend(FRAMES)[1].trackId).toBe('12');
  });

  it('reports the first timestamp that has a person box', () => {
    expect(firstDetectionTime(FRAMES)).toBe(0);
    expect(firstDetectionTime([
      { t: 0, detections: [] },
      { t: 1.4, detections: [{ track_id: '1', bbox: [0, 0, 1, 1] }] },
    ])).toBe(1.4);
    expect(firstDetectionTime([])).toBeNull();
  });

  it('picks the nearest sampled frame for video.currentTime', () => {
    expect(findFrameAtTime(FRAMES, 0, 5).t).toBe(0);
    expect(findFrameAtTime(FRAMES, 2.1, 5).detections).toHaveLength(2);
    expect(findFrameAtTime(FRAMES, 2.1, 5).detections[1].track_id).toBe('12');
    expect(findFrameAtTime(FRAMES, 3.9, 5).t).toBe(4);
    expect(findFrameAtTime(FRAMES, 20, 5).detections).toEqual([]);
  });

  it('strokes boxes from normalized coordinates', () => {
    const calls = [];
    const ctx = {
      clearRect: vi.fn(),
      strokeRect: (...args) => calls.push(args),
    };
    drawPersonBoxes(
      ctx,
      { width: 100, height: 100 },
      [{ track_id: '7', bbox: [0.1, 0.2, 0.4, 0.8] }],
      new Map([['7', '#2563eb']])
    );
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.strokeStyle).toBe('#2563eb');
    expect(ctx.lineWidth).toBe(2);
    expect(calls[0]).toEqual([10, 20, 30, 60]);
  });
});
