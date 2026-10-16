import { useCallback, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { resolveImageUrl } from '../../utils/fileUtils';
import { DATE_FORMATS } from '../../constants';
import { clampTillZone, zoneFromDrag } from '../../utils/watchTillZone';

const DEFAULT_ASPECT = 16 / 9;

/**
 * Draw or slide a till rectangle on the camera's picture (or a clip still, or an empty 16:9).
 * The surface takes the picture's own shape, so the box lines up with what the camera sees
 * on 4:3 CCTV as well as 16:9. Dashed overlay, no shadow.
 *
 * @param {{
 *   imageUrl?: string,
 *   capturedAt?: string|null,
 *   clipUrl?: string,
 *   zone: { x: number, y: number, w: number, h: number },
 *   onChange: (zone: object) => void,
 * }} props
 */
const WatchTillZoneEditor = ({ imageUrl = '', capturedAt = null, clipUrl = '', zone, onChange }) => {
  const surfaceRef = useRef(null);
  const dragStart = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const till = clampTillZone(zone);
  const still = imageUrl ? 'image' : clipUrl ? 'video' : null;
  const source = imageUrl || clipUrl || '';
  // Shape of the picture it was measured from, so a new picture never inherits an old shape
  const [shape, setShape] = useState({ source: '', aspect: DEFAULT_ASPECT });
  const aspect = shape.source === source ? shape.aspect : DEFAULT_ASPECT;

  const takeShape = (width, height) => {
    if (width > 0 && height > 0) setShape({ source, aspect: width / height });
  };

  const pointFromEvent = useCallback((event) => {
    const node = surfaceRef.current;
    if (!node) return { x: 0, y: 0 };
    const box = node.getBoundingClientRect();
    const width = box.width || 1;
    const height = box.height || 1;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / height)),
    };
  }, []);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    dragStart.current = pointFromEvent(event);
    setDrawing(true);
  }, [pointFromEvent]);

  const handlePointerMove = useCallback((event) => {
    if (!drawing || !dragStart.current) return;
    onChange(zoneFromDrag(dragStart.current, pointFromEvent(event)));
  }, [drawing, onChange, pointFromEvent]);

  const handlePointerUp = useCallback((event) => {
    if (!drawing || !dragStart.current) return;
    onChange(zoneFromDrag(dragStart.current, pointFromEvent(event)));
    dragStart.current = null;
    setDrawing(false);
  }, [drawing, onChange, pointFromEvent]);

  const patch = useCallback((key, raw) => {
    onChange(clampTillZone({ ...till, [key]: Number(raw) }));
  }, [onChange, till]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Draw a box around the till on the picture, or use the numbers below. People who only walk through the shop
        should miss this box.
      </p>
      <div
        ref={surfaceRef}
        role="presentation"
        data-testid="watch-till-editor"
        className="relative w-full cursor-crosshair touch-none overflow-hidden rounded-md border border-gray-200 bg-gray-100"
        style={{ aspectRatio: aspect }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {still === 'image' && (
          <img
            src={imageUrl}
            alt="What the camera sees"
            draggable={false}
            onLoad={(event) => takeShape(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            className="pointer-events-none h-full w-full select-none object-fill"
          />
        )}
        {still === 'video' && (
          <video
            title="Till zone still"
            src={resolveImageUrl(clipUrl)}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => takeShape(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
            className="pointer-events-none h-full w-full object-fill"
          />
        )}
        {!still && (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-gray-500">
            The camera&apos;s picture appears here once its Watch device is running. You can also upload a short clip.
          </div>
        )}
        <div
          data-testid="watch-till-zone"
          className="pointer-events-none absolute border-2 border-dashed border-[#166534]"
          style={{
            left: `${till.x * 100}%`,
            top: `${till.y * 100}%`,
            width: `${till.w * 100}%`,
            height: `${till.h * 100}%`,
          }}
        />
      </div>
      {still === 'image' && capturedAt && (
        <p className="text-xs text-gray-500">
          Picture from {dayjs(capturedAt).format(DATE_FORMATS.DISPLAY_WITH_TIME)}. It refreshes every few minutes.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['x', 'Left'],
          ['y', 'Top'],
          ['w', 'Width'],
          ['h', 'Height'],
        ].map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`watch-till-${key}`}>{label}</Label>
            <Input
              id={`watch-till-${key}`}
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={till[key]}
              onChange={(event) => patch(key, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WatchTillZoneEditor;
