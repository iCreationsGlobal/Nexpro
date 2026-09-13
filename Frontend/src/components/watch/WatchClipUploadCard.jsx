import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import watchService from '../../services/watchService';
import { showError, showSuccess } from '../../utils/toast';
import { WATCH_CLIP_ACCEPT, WATCH_CLIP_MAX_BYTES, WATCH_CLIP_MAX_MB } from '../../utils/watchClipSource';
import {
  WATCH_DETECTION_TIMEOUT_MESSAGE,
  isWatchProcessWaitError,
} from '../../utils/watchProcessClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QUERY_CACHE } from '../../constants';
import WatchClipPlayer from './WatchClipPlayer';

/**
 * @param {{ visitors?: number, counterInteractions?: number, created?: number, eventCount?: number }} data
 * @returns {string}
 */
export const uploadedClipProcessMessage = (data = {}) => {
  const visitors = Number(data.visitors) || 0;
  const interactions = Number(data.counterInteractions) || 0;
  const created = Number(data.created) || 0;
  if (!visitors && !interactions && !created) {
    return 'Clip processed. No one lingered in the till zone long enough to count as a counter interaction.';
  }
  const people = visitors === 1 ? '1 unique person' : `${visitors} unique people`;
  const counters = interactions === 1 ? '1 till-zone linger' : `${interactions} till-zone lingers`;
  return `Clip processed. ${people}, ${counters} compared with recorded sales.`;
};

/**
 * Upload a short shop MP4/WebM, then run local person detection (not product SKUs).
 *
 * @param {{ enabled?: boolean, onProcessed?: (clipUrl: string) => void, tillZone?: object|null }} props
 */
const WatchClipUploadCard = ({ enabled = true, onProcessed, tillZone = null }) => {
  const [file, setFile] = useState(null);
  const [clipUrl, setClipUrl] = useState('');

  const {
    data: detectionsData,
    error: detectionsError,
    isFetched: detectionsFetched,
    isFetching: detectionsFetching,
  } = useQuery({
    queryKey: ['watch', 'detections', clipUrl],
    queryFn: () => watchService.getClipDetections(clipUrl),
    enabled: !!clipUrl,
    retry: false,
    staleTime: QUERY_CACHE.STALE_TIME_STABLE,
  });

  const clipDetections = detectionsData?.data || null;
  const detectionsStatus = useMemo(() => {
    if (!clipUrl) return 'idle';
    if (detectionsFetching && !detectionsFetched) return 'loading';
    if (detectionsError) return 'missing';
    if (clipDetections?.frames) return 'ready';
    if (detectionsFetched) return 'missing';
    return 'idle';
  }, [
    clipUrl,
    detectionsFetching,
    detectionsFetched,
    detectionsError,
    clipDetections,
  ]);

  const mutation = useMutation({
    mutationFn: async (nextFile) => {
      const uploaded = await watchService.uploadClip(nextFile);
      const url = uploaded?.data?.clipUrl || uploaded?.data?.clipReference;
      if (!url) {
        throw new Error('Clip uploaded but no URL was returned');
      }
      const processed = await watchService.processUploadedClip({
        clipUrl: url,
        maxSeconds: 30,
      });
      return { url, processed };
    },
    onSuccess: ({ url, processed }) => {
      setClipUrl(url);
      showSuccess(uploadedClipProcessMessage(processed?.data || processed));
      onProcessed?.(url);
    },
    onError: (error) => {
      if (isWatchProcessWaitError(error)) {
        showError(WATCH_DETECTION_TIMEOUT_MESSAGE);
        return;
      }
      showError(error, 'Failed to detect people in the clip');
    },
  });

  const handleFileChange = useCallback((event) => {
    const next = event.target.files?.[0] || null;
    setFile(next);
  }, []);

  const handleUpload = useCallback(() => {
    if (!file || mutation.isPending) return;
    if (file.size > WATCH_CLIP_MAX_BYTES) {
      showError(null, `Use a short clip up to ${WATCH_CLIP_MAX_MB} MB.`);
      return;
    }
    mutation.mutate(file);
  }, [file, mutation]);

  if (!enabled) return null;

  return (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload a short clip
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Upload a short shop snippet (about 10–30 seconds). ABS detects people and counter time on this computer,
          then compares with recorded sales. Product names still come from POS, not from the camera.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="watch-clip-file">Short clip</Label>
            <Input
              id="watch-clip-file"
              type="file"
              accept={WATCH_CLIP_ACCEPT}
              onChange={handleFileChange}
              disabled={mutation.isPending}
            />
          </div>
          <Button onClick={handleUpload} disabled={!file || mutation.isPending}>
            {mutation.isPending ? 'Detecting people locally…' : 'Upload and detect'}
          </Button>
        </div>
        {mutation.isPending && (
          <p className="text-sm text-gray-600">
            Detecting people locally… about a minute. Frames stay on this computer.
          </p>
        )}
        {clipUrl && (
          <WatchClipPlayer
            url={clipUrl}
            title="Uploaded shop clip"
            detections={clipDetections}
            detectionsStatus={detectionsStatus}
            overlayToggleId="watch-upload-show-boxes"
            tillZone={tillZone}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default WatchClipUploadCard;
