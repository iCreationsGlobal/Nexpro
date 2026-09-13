import { clampTillZone, DEFAULT_TILL_ZONE, tillZoneFromCamera, zoneFromDrag } from '../../utils/watchTillZone';

describe('watchTillZone', () => {
  it('keeps the default till box around 11 percent of the frame', () => {
    expect(DEFAULT_TILL_ZONE.w * DEFAULT_TILL_ZONE.h).toBeGreaterThan(0.09);
    expect(DEFAULT_TILL_ZONE.w * DEFAULT_TILL_ZONE.h).toBeLessThan(0.16);
  });

  it('clamps a drawn rectangle onto the frame', () => {
    const zone = zoneFromDrag({ x: 0.9, y: 0.9 }, { x: 1.2, y: 1.4 });
    expect(zone.x + zone.w).toBeLessThanOrEqual(1);
    expect(zone.y + zone.h).toBeLessThanOrEqual(1);
    expect(zone.type).toBe('counter');
  });

  it('reads the counter rectangle from a camera row', () => {
    expect(tillZoneFromCamera({
      zones: [{ name: 'counter', type: 'counter', x: 0.7, y: 0.5, w: 0.2, h: 0.3 }],
    })).toEqual(clampTillZone({ x: 0.7, y: 0.5, w: 0.2, h: 0.3 }));
    expect(tillZoneFromCamera({ role: 'entrance', zones: [] })).toEqual(DEFAULT_TILL_ZONE);
  });
});
