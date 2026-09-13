const PERSON_COLORS = [
  '#2563eb',
  '#dc2626',
  '#ca8a04',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#ea580c',
  '#4f46e5',
];

/**
 * Stable stroke color from a detector track id (not a person name).
 * @param {string|number} trackId
 * @returns {string}
 */
export const hashTrackColor = (trackId) => {
  const text = String(trackId ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
};

/**
 * First-seen tracks labeled Person 1…N. Boxes are detector counts, not names.
 * @param {object[]} frames
 * @returns {{ trackId: string, label: string, color: string }[]}
 */
export const personLegend = (frames) => {
  const legend = [];
  const seen = new Set();
  (Array.isArray(frames) ? frames : []).forEach((frame) => {
    (Array.isArray(frame?.detections) ? frame.detections : []).forEach((detection) => {
      const trackId = String(detection?.track_id ?? detection?.trackId ?? '');
      if (!trackId || seen.has(trackId)) return;
      seen.add(trackId);
      legend.push({
        trackId,
        label: `Person ${legend.length + 1}`,
        color: hashTrackColor(trackId),
      });
    });
  });
  return legend;
};

/**
 * Seconds of the first frame that has a person box.
 * @param {object[]} frames
 * @returns {number|null}
 */
export const firstDetectionTime = (frames) => {
  const list = Array.isArray(frames) ? frames : [];
  for (let index = 0; index < list.length; index += 1) {
    const detections = list[index]?.detections;
    if (Array.isArray(detections) && detections.length > 0) {
      return Number(list[index].t) || 0;
    }
  }
  return null;
};

/**
 * Nearest sampled frame to video.currentTime.
 * @param {object[]} frames
 * @param {number} currentTime
 * @param {number} [fps=5]
 * @returns {{ t: number, detections: object[] }|null}
 */
export const findFrameAtTime = (frames, currentTime, fps = 5) => {
  const list = Array.isArray(frames) ? frames : [];
  if (!list.length) return null;
  const t = Number(currentTime) || 0;
  let best = list[0];
  let bestDist = Math.abs((Number(best?.t) || 0) - t);
  for (let index = 1; index < list.length; index += 1) {
    const frame = list[index];
    const dist = Math.abs((Number(frame?.t) || 0) - t);
    if (dist < bestDist) {
      best = frame;
      bestDist = dist;
    }
  }
  const maxGap = Math.max(0.5, 1 / (Number(fps) || 5));
  if (bestDist > maxGap) {
    return { t: Number(best?.t) || 0, detections: [] };
  }
  return {
    t: Number(best?.t) || 0,
    detections: Array.isArray(best?.detections) ? best.detections : [],
  };
};

/**
 * Stroke person boxes onto a canvas sized to the video element.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ width: number, height: number }} size
 * @param {object[]} detections
 * @param {Map<string, string>|Record<string, string>} colorsByTrack
 */
export const drawPersonBoxes = (ctx, size, detections, colorsByTrack) => {
  if (!ctx || !size?.width || !size?.height) return;
  ctx.clearRect(0, 0, size.width, size.height);
  (Array.isArray(detections) ? detections : []).forEach((detection) => {
    const bbox = detection?.bbox;
    if (!Array.isArray(bbox) || bbox.length < 4) return;
    const trackId = String(detection.track_id ?? detection.trackId ?? '');
    const color = (colorsByTrack instanceof Map
      ? colorsByTrack.get(trackId)
      : colorsByTrack?.[trackId]) || hashTrackColor(trackId);
    const x1 = Number(bbox[0]) * size.width;
    const y1 = Number(bbox[1]) * size.height;
    const x2 = Number(bbox[2]) * size.width;
    const y2 = Number(bbox[3]) * size.height;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  });
};
