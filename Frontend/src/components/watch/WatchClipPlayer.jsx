import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { resolveImageUrl } from '../../utils/fileUtils';
import {
  drawPersonBoxes,
  findFrameAtTime,
  firstDetectionTime,
  personLegend,
} from '../../utils/watchDetectionsOverlay';

/**
 * Same-origin MP4 with person-box overlay synced to currentTime.
 *
 * @param {{
 *   url: string,
 *   title?: string,
 *   detections?: { fps?: number, frames?: object[] }|null,
 *   detectionsStatus?: 'idle'|'loading'|'ready'|'missing',
 *   overlayToggleId?: string,
 *   tillZone?: { x: number, y: number, w: number, h: number }|null,
 * }} props
 */
const WatchClipPlayer = ({
  url,
  title = 'Incident clip',
  detections = null,
  detectionsStatus = 'idle',
  overlayToggleId = 'watch-show-boxes',
  tillZone = null,
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [overlayOn, setOverlayOn] = useState(true);

  const frames = detections?.frames;
  const fps = detections?.fps;
  const legend = useMemo(() => personLegend(frames), [frames]);
  const colorsByTrack = useMemo(
    () => new Map(legend.map((entry) => [entry.trackId, entry.color])),
    [legend]
  );
  const hasSidecar = detectionsStatus === 'ready' && Array.isArray(frames);
  const hasTracks = hasSidecar && legend.length > 0;
  const boxesStartAt = useMemo(() => firstDetectionTime(frames), [frames]);

  const paint = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = Math.round(video.clientWidth || video.getBoundingClientRect().width || 0);
    const height = Math.round(video.clientHeight || video.getBoundingClientRect().height || 0);
    if (width < 2 || height < 2) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (!overlayOn || !hasTracks) {
      ctx.clearRect(0, 0, width, height);
      return;
    }
    const frame = findFrameAtTime(frames, video.currentTime || 0, fps);
    drawPersonBoxes(ctx, { width, height }, frame?.detections || [], colorsByTrack);
  }, [overlayOn, hasTracks, frames, fps, colorsByTrack]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let raf = 0;
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const tick = () => {
      paint();
      if (!video.paused && !video.ended) {
        raf = requestAnimationFrame(tick);
      }
    };
    const onTime = () => paint();
    const onPlay = () => {
      stop();
      raf = requestAnimationFrame(tick);
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', onTime);
    video.addEventListener('loadedmetadata', onTime);
    video.addEventListener('loadeddata', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onTime);
    const resize = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => paint())
      : null;
    resize?.observe(video);
    const kick = requestAnimationFrame(() => paint());
    paint();
    return () => {
      stop();
      cancelAnimationFrame(kick);
      resize?.disconnect();
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', onTime);
      video.removeEventListener('loadedmetadata', onTime);
      video.removeEventListener('loadeddata', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onTime);
    };
  }, [paint]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border border-gray-200">
        <video
          ref={videoRef}
          title={title}
          src={resolveImageUrl(url)}
          controls
          preload="metadata"
          className="aspect-video w-full bg-gray-100"
        />
        {hasTracks && (
          <canvas
            ref={canvasRef}
            data-testid="watch-person-overlay"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          />
        )}
        {tillZone && (
          <div
            data-testid="watch-till-zone"
            className="pointer-events-none absolute border-2 border-dashed border-[#166534]"
            style={{
              left: `${Number(tillZone.x) * 100}%`,
              top: `${Number(tillZone.y) * 100}%`,
              width: `${Number(tillZone.w) * 100}%`,
              height: `${Number(tillZone.h) * 100}%`,
            }}
            aria-hidden="true"
          />
        )}
      </div>
      {detectionsStatus === 'loading' && (
        <p className="text-xs text-gray-600">Loading detection boxes…</p>
      )}
      {hasTracks && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">
            Boxes show who the detector counted — not names.
            {boxesStartAt != null && boxesStartAt > 0.3
              ? ` Play or seek past ${boxesStartAt.toFixed(1)}s if the first frames are empty.`
              : ''}
          </p>
          <p className="text-xs text-gray-600">
            {legend.length === 1
              ? 'Person 1 is one unique person in this clip.'
              : `Person 1–${legend.length} are unique people in this clip. Visitors for this clip should match that count.`}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id={overlayToggleId}
                checked={overlayOn}
                onCheckedChange={(value) => setOverlayOn(value === true)}
              />
              <Label htmlFor={overlayToggleId} className="text-xs font-normal text-gray-700">
                Show person boxes
              </Label>
            </div>
            <ul className="flex flex-wrap gap-3 text-xs text-gray-700">
              {legend.map((entry) => (
                <li key={entry.trackId} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm border"
                    style={{ backgroundColor: entry.color, borderColor: entry.color }}
                    aria-hidden="true"
                  />
                  {entry.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {detectionsStatus === 'missing' && (
        <p className="text-xs text-gray-600">
          Detection boxes are not stored for this clip. Process an uploaded MP4 to store them.
        </p>
      )}
      {hasSidecar && !hasTracks && (
        <p className="text-xs text-gray-600">
          Detection ran, but no person boxes were stored in this sidecar.
        </p>
      )}
    </div>
  );
};

export default WatchClipPlayer;
