import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WATCH_INCIDENT_KINDS } from '../../constants';
import WatchClipPlayer from './WatchClipPlayer';

/**
 * Compact empty copy — not a fake 16:9 player.
 * @param {{ children: import('react').ReactNode }} props
 */
const ClipEmpty = ({ children }) => (
  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
    {children}
  </div>
);

/**
 * In-dialog clip for Review incident. YouTube embed or same-origin / http(s) MP4.
 *
 * @param {{
 *   kind?: string,
 *   clipSource?: { type: string, videoId?: string, watchUrl?: string, url?: string },
 *   detections?: { fps?: number, frames?: object[] }|null,
 *   detectionsStatus?: 'idle'|'loading'|'ready'|'missing',
 * }} props
 */
const WatchIncidentClip = ({ kind, clipSource, detections = null, detectionsStatus = 'idle' }) => {
  if (clipSource?.type === 'video' && clipSource.url) {
    return (
      <WatchClipPlayer
        url={clipSource.url}
        title="Incident clip"
        detections={detections}
        detectionsStatus={detectionsStatus}
        overlayToggleId="watch-review-show-boxes"
      />
    );
  }

  if (clipSource?.type === 'youtube' && clipSource.videoId) {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-md border border-gray-200">
          <iframe
            title="Incident clip"
            src={`https://www.youtube-nocookie.com/embed/${clipSource.videoId}`}
            className="aspect-video w-full bg-gray-100"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-xs text-gray-600">
          Person boxes are not drawn on YouTube embeds. Upload a short MP4 to see rectangles.
        </p>
        {clipSource.watchUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={clipSource.watchUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open on YouTube
            </a>
          </Button>
        )}
      </div>
    );
  }

  if (kind === WATCH_INCIDENT_KINDS.SALE_WITHOUT_EVENT) {
    return (
      <ClipEmpty>
        No camera clip for this sale. The camera may have missed the interaction.
      </ClipEmpty>
    );
  }

  return (
    <ClipEmpty>
      Clip is not stored in ABS. Shop cameras do not send video here.
    </ClipEmpty>
  );
};

export default WatchIncidentClip;
