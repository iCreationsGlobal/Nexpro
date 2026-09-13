/**
 * Default till rectangle (~11% of frame). Walk-ins should miss this box.
 */
export const DEFAULT_TILL_ZONE = {
  name: 'counter',
  type: 'counter',
  x: 0.68,
  y: 0.52,
  w: 0.26,
  h: 0.42,
};

/**
 * Clamp a 0–1 till rectangle so it stays on the frame.
 * @param {object} zone
 * @returns {{ name: string, type: string, x: number, y: number, w: number, h: number }}
 */
export const clampTillZone = (zone = {}) => {
  const width = Math.min(1, Math.max(0.05, Number(zone.w) || DEFAULT_TILL_ZONE.w));
  const height = Math.min(1, Math.max(0.05, Number(zone.h) || DEFAULT_TILL_ZONE.h));
  const x = Math.min(1 - width, Math.max(0, Number(zone.x) || 0));
  const y = Math.min(1 - height, Math.max(0, Number(zone.y) || 0));
  return {
    name: 'counter',
    type: 'counter',
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
    w: Number(width.toFixed(3)),
    h: Number(height.toFixed(3)),
  };
};

/**
 * Rectangle from two normalized pointer points (draw on a still).
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @returns {ReturnType<typeof clampTillZone>}
 */
export const zoneFromDrag = (start, end) => {
  const x = Math.min(Number(start?.x) || 0, Number(end?.x) || 0);
  const y = Math.min(Number(start?.y) || 0, Number(end?.y) || 0);
  const w = Math.abs((Number(end?.x) || 0) - (Number(start?.x) || 0));
  const h = Math.abs((Number(end?.y) || 0) - (Number(start?.y) || 0));
  return clampTillZone({ x, y, w, h });
};

/**
 * Counter rectangle from a VisionCamera row, or the default till box.
 * @param {object|null} camera
 * @returns {ReturnType<typeof clampTillZone>}
 */
export const tillZoneFromCamera = (camera) => {
  const zones = Array.isArray(camera?.zones) ? camera.zones : [];
  const found = zones.find((zone) => zone && zone.type === 'counter');
  return found ? clampTillZone(found) : { ...DEFAULT_TILL_ZONE };
};
