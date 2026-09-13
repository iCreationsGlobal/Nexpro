import { useCallback, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { resolveImageUrl } from '../../utils/fileUtils';
import { clampTillZone, zoneFromDrag } from '../../utils/watchTillZone';

/**
 * Draw or slide a till rectangle on a clip still (or empty 16:9). Dashed overlay, no shadow.
 *
 * @param {{
 *   clipUrl?: string,
 *   zone: { x: number, y: number, w: number, h: number },
 *   onChange: (zone: object) => void,
 * }} props
 */
const WatchTillZoneEditor = ({ clipUrl = '', zone, onChange }) => {
  const surfaceRef = useRef(null);
  const dragStart = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const till = clampTillZone(zone);

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
        Draw the till / register on the clip still, or use the sliders. People who only walk through the shop should miss this box.
      </p>
      <div
        ref={surfaceRef}
        role="presentation"
        data-testid="watch-till-editor"
        className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-md border border-gray-200 bg-gray-100"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {clipUrl ? (
          <video
            title="Till zone still"
            src={resolveImageUrl(clipUrl)}
            muted
            playsInline
            preload="metadata"
            className="pointer-events-none h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-500">
            Upload a short clip to see a still, or set 0–1 values below.
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
