import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Eye, RefreshCw, Users, ShoppingCart, AlertTriangle, VideoOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import watchService from '../services/watchService';
import { showError, showSuccess } from '../utils/toast';
import { parseWatchClipSource, WATCH_CLIP_ACCEPT, WATCH_CLIP_MAX_BYTES, WATCH_CLIP_MAX_MB } from '../utils/watchClipSource';
import { buildWatchStreamCommand } from '../utils/watchStreamCommand';
import { DATE_FORMATS, QUERY_CACHE, WATCH_INCIDENT_KINDS, WATCH_INCIDENT_STATUSES, WATCH_REVIEW_DECISIONS } from '../constants';
import { EMPTY_STATES } from '../constants/microcopy';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Empty } from '@/components/ui/empty';
import TableSkeleton from '../components/TableSkeleton';
import WatchClipUploadCard from '../components/watch/WatchClipUploadCard';
import WatchIncidentClip from '../components/watch/WatchIncidentClip';
import WatchTillZoneEditor from '../components/watch/WatchTillZoneEditor';
import { clampTillZone, DEFAULT_TILL_ZONE, tillZoneFromCamera } from '../utils/watchTillZone';

const KIND_LABELS = {
  [WATCH_INCIDENT_KINDS.MATCHED]: 'Matched',
  [WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION]: 'Needs review',
  [WATCH_INCIDENT_KINDS.SALE_WITHOUT_EVENT]: 'Camera miss',
};

const STATUS_LABELS = {
  [WATCH_INCIDENT_STATUSES.PENDING]: 'Pending',
  [WATCH_INCIDENT_STATUSES.CONFIRMED]: 'Confirmed',
  [WATCH_INCIDENT_STATUSES.DISMISSED]: 'Dismissed',
  [WATCH_INCIDENT_STATUSES.NEEDS_CONTEXT]: 'Needs more context',
};

const Watch = () => {
  const { hasFeature, isManager } = useAuth();
  const { activeTenantId, activeShopId, scopeReady } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const canReview = isManager;

  const [kindFilter, setKindFilter] = useState('attention');
  const [reviewing, setReviewing] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [cameraRole, setCameraRole] = useState('counter');
  const [cameraStreamUrl, setCameraStreamUrl] = useState('');
  const [lastClipUrl, setLastClipUrl] = useState('');
  const [tillZone, setTillZone] = useState(DEFAULT_TILL_ZONE);
  const [zoneCameraId, setZoneCameraId] = useState('');

  const queryKey = useMemo(
    () => ['watch', activeTenantId, activeShopId, kindFilter],
    [activeTenantId, activeShopId, kindFilter]
  );

  const incidentParams = useMemo(() => {
    if (kindFilter === 'attention') {
      return { status: WATCH_INCIDENT_STATUSES.PENDING };
    }
    if (kindFilter === 'all') return {};
    if (Object.values(WATCH_INCIDENT_KINDS).includes(kindFilter)) {
      return { kind: kindFilter };
    }
    return { status: kindFilter };
  }, [kindFilter]);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['watch', 'summary', activeTenantId, activeShopId],
    queryFn: () => watchService.getSummary(),
    enabled: scopeReady && hasFeature('watch'),
    staleTime: QUERY_CACHE.STALE_TIME_VOLATILE,
  });

  const { data: incidentsData, isLoading: incidentsLoading } = useQuery({
    queryKey: [...queryKey, 'incidents'],
    queryFn: () => watchService.listIncidents(incidentParams),
    enabled: scopeReady && hasFeature('watch'),
    staleTime: QUERY_CACHE.STALE_TIME_VOLATILE,
  });

  const { data: camerasData } = useQuery({
    queryKey: ['watch', 'cameras', activeTenantId, activeShopId],
    queryFn: () => watchService.listCameras(),
    enabled: scopeReady && hasFeature('watch'),
    staleTime: QUERY_CACHE.STALE_TIME_STABLE,
  });

  const summary = summaryData?.data || {};
  const incidents = useMemo(() => incidentsData?.data || [], [incidentsData]);
  const cameras = useMemo(() => camerasData?.data || [], [camerasData]);
  const counterCameras = useMemo(
    () => cameras.filter((camera) => camera.role === 'counter'),
    [cameras]
  );

  useEffect(() => {
    if (zoneCameraId || !counterCameras.length) return undefined;
    setZoneCameraId(counterCameras[0].id);
    setTillZone(tillZoneFromCamera(counterCameras[0]));
    return undefined;
  }, [counterCameras, zoneCameraId]);
  const reviewClipSource = useMemo(
    () => (reviewing ? parseWatchClipSource(reviewing) : { type: 'none' }),
    [reviewing]
  );
  const streamCommand = useMemo(
    () => buildWatchStreamCommand({
      streamUrl: cameraStreamUrl.trim() || cameras.find((camera) => camera.streamUrl)?.streamUrl,
      apiOrigin: 'http://localhost:5000',
    }),
    [cameraStreamUrl, cameras]
  );

  const {
    data: detectionsData,
    error: detectionsError,
    isFetched: detectionsFetched,
    isFetching: detectionsFetching,
  } = useQuery({
    queryKey: ['watch', 'detections', reviewClipSource.url],
    queryFn: () => watchService.getClipDetections(reviewClipSource.url),
    enabled: !!reviewing && reviewClipSource.type === 'video' && !!reviewClipSource.url,
    retry: false,
    staleTime: QUERY_CACHE.STALE_TIME_STABLE,
  });

  const clipDetections = detectionsData?.data || null;
  const detectionsStatus = useMemo(() => {
    if (reviewClipSource.type !== 'video') return 'idle';
    if (detectionsFetching && !detectionsFetched) return 'loading';
    if (detectionsError) return 'missing';
    if (clipDetections?.frames) return 'ready';
    if (detectionsFetched) return 'missing';
    return 'idle';
  }, [
    reviewClipSource.type,
    detectionsFetching,
    detectionsFetched,
    detectionsError,
    clipDetections,
  ]);

  const invalidateWatch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['watch'] });
  }, [queryClient]);

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, note }) => watchService.reviewIncident(id, { decision, note }),
    onSuccess: () => {
      showSuccess('Review saved');
      setReviewing(null);
      setReviewNote('');
      invalidateWatch();
    },
    onError: (error) => showError(error, 'Failed to save review'),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => watchService.reconcile(),
    onSuccess: () => {
      showSuccess('Reconciliation updated');
      invalidateWatch();
    },
    onError: (error) => showError(error, 'Failed to reconcile'),
  });

  const attachClipMutation = useMutation({
    mutationFn: async (file) => {
      const uploaded = await watchService.uploadClip(file);
      const clipReference = uploaded?.data?.clipUrl || uploaded?.data?.clipReference;
      if (!clipReference || !reviewing?.id) {
        throw new Error('Clip uploaded but could not attach it to this incident');
      }
      const attached = await watchService.attachIncidentClip(reviewing.id, { clipReference });
      return { clipReference, attached };
    },
    onSuccess: ({ clipReference }) => {
      showSuccess('Clip attached');
      setReviewing((current) => (current ? { ...current, clipReference } : current));
      invalidateWatch();
    },
    onError: (error) => showError(error, 'Failed to attach clip'),
  });

  const handleAttachClip = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || attachClipMutation.isPending) return;
    if (file.size > WATCH_CLIP_MAX_BYTES) {
      showError(null, `Use a short clip up to ${WATCH_CLIP_MAX_MB} MB.`);
      return;
    }
    attachClipMutation.mutate(file);
  }, [attachClipMutation]);

  const cameraMutation = useMutation({
    mutationFn: (payload) => watchService.createCamera(payload),
    onSuccess: () => {
      showSuccess('Camera saved');
      setCameraName('');
      setCameraStreamUrl('');
      invalidateWatch();
    },
    onError: (error) => showError(error, 'Failed to save camera'),
  });

  const tillZoneMutation = useMutation({
    mutationFn: async () => {
      const zone = clampTillZone(tillZone);
      if (zoneCameraId) {
        const existing = cameras.find((camera) => camera.id === zoneCameraId);
        return watchService.updateCamera(zoneCameraId, {
          name: existing?.name || cameraName.trim() || 'Counter camera',
          role: existing?.role || 'counter',
          streamUrl: existing?.streamUrl,
          zones: [zone],
        });
      }
      if (!cameraName.trim()) {
        throw new Error('Name the camera first, then save the till zone.');
      }
      return watchService.createCamera({
        name: cameraName.trim(),
        role: 'counter',
        streamUrl: cameraStreamUrl.trim() || undefined,
        zones: [zone],
      });
    },
    onSuccess: () => {
      showSuccess('Till zone saved');
      invalidateWatch();
    },
    onError: (error) => showError(error, 'Failed to save till zone'),
  });

  const handleReview = useCallback((decision) => {
    if (!reviewing?.id) return;
    reviewMutation.mutate({
      id: reviewing.id,
      decision,
      note: reviewNote.trim() || undefined,
    });
  }, [reviewing, reviewNote, reviewMutation]);

  const handleSaveCamera = useCallback(() => {
    if (!cameraName.trim()) return;
    cameraMutation.mutate({
      name: cameraName.trim(),
      role: cameraRole,
      streamUrl: cameraStreamUrl.trim() || undefined,
      zones: cameraRole === 'counter' ? [clampTillZone(tillZone)] : [],
    });
  }, [cameraName, cameraRole, cameraStreamUrl, cameraMutation, tillZone]);

  const cards = useMemo(() => ([
    {
      label: 'Visitors',
      value: summary.visitors ?? 0,
      icon: Users,
      hint: (summary.visitors ?? 0) > 0
        ? "Unique people in today's clips — not each brief re-enter. Play the uploaded clip or Review a video incident to see boxes."
        : undefined,
    },
    { label: 'Counter interactions', value: summary.counterInteractions ?? 0, icon: Eye, hint: (summary.counterInteractions ?? 0) > 0 ? 'Till-zone lingers — not shop walk-ins. Owner still reviews unmatched time at the register.' : undefined },
    { label: 'Recorded sales', value: summary.recordedSales ?? 0, icon: ShoppingCart },
    { label: 'Needs review', value: summary.unmatchedInteractions ?? 0, icon: AlertTriangle },
    { label: 'Camera misses', value: summary.cameraMisses ?? 0, icon: VideoOff },
  ]), [summary]);

  if (!hasFeature('watch')) {
    return (
      <div className="p-6">
        <Empty description="ABS Watch is not included in this workspace." />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Watch</h1>
          <p className="mt-1 text-sm text-gray-600">
            Physical shop activity compared with recorded ABS sales. Review gaps — the system does not accuse staff.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => reconcileMutation.mutate()}
          disabled={reconcileMutation.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
          Re-check sales
        </Button>
      </div>

      {canReview && (
        <WatchClipUploadCard
          enabled={canReview}
          tillZone={tillZone}
          onProcessed={(url) => {
            if (url) setLastClipUrl(url);
            invalidateWatch();
          }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Icon className="h-4 w-4" />
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="h-8 w-12 animate-pulse rounded bg-gray-100" />
                ) : (
                  <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
                )}
                {card.hint && (
                  <p className="mt-1 text-xs text-gray-600">{card.hint}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {summary.attentionRequired > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {summary.unmatchedInteractions || 0} customer interaction{summary.unmatchedInteractions === 1 ? '' : 's'} may not have corresponding sales records.
          {summary.cameraMisses > 0 ? ` ${summary.cameraMisses} recorded sale${summary.cameraMisses === 1 ? '' : 's'} had no matching camera activity.` : ''}
        </div>
      )}

      <Card className="border border-gray-200">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Incidents</CardTitle>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attention">Attention required</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}>Unmatched interactions</SelectItem>
              <SelectItem value={WATCH_INCIDENT_KINDS.SALE_WITHOUT_EVENT}>Camera misses</SelectItem>
              <SelectItem value={WATCH_INCIDENT_KINDS.MATCHED}>Matched</SelectItem>
              <SelectItem value={WATCH_INCIDENT_STATUSES.CONFIRMED}>Confirmed</SelectItem>
              <SelectItem value={WATCH_INCIDENT_STATUSES.DISMISSED}>Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {incidentsLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : incidents.length === 0 ? (
            <Empty
              description={kindFilter === 'attention' || kindFilter === 'all'
                ? EMPTY_STATES.WATCH.description
                : EMPTY_STATES.WATCH_FILTERED.description}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>ABS sale</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell>{dayjs(incident.startedAt).format(DATE_FORMATS.DISPLAY_WITH_TIME)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="outline">{KIND_LABELS[incident.kind] || incident.kind}</Badge>
                        <p className="text-xs text-gray-600">{incident.copy}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {incident.sale?.saleNumber || (incident.saleId ? 'Sale recorded' : 'Not found')}
                    </TableCell>
                    <TableCell>
                      {incident.confidence != null ? `${Math.round(Number(incident.confidence) * 100)}%` : '—'}
                    </TableCell>
                    <TableCell>{STATUS_LABELS[incident.status] || incident.status}</TableCell>
                    <TableCell className="text-right">
                      {canReview && incident.status === WATCH_INCIDENT_STATUSES.PENDING ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setReviewing(incident);
                            setReviewNote(incident.reviewNote || '');
                          }}
                        >
                          Review
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle>Cameras and zones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Draw the till / register on a clip still. Walking into the shop is a visitor — lingering in this box is till time, not a confirmed sale.
          </p>
          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-sm text-gray-700">
              Always-on detection runs on this machine or a shop PC. ABS stores events and optional short clips — not a live video feed.
            </p>
            <p className="text-xs text-gray-600">
              From the Nexpro repo root:
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800">
              {streamCommand}
            </pre>
          </div>
          {cameras.length > 0 && (
            <ul className="space-y-2 text-sm">
              {cameras.map((camera) => (
                <li key={camera.id} className="rounded-md border border-gray-200 px-3 py-2">
                  <span className="font-medium">{camera.name}</span>
                  <span className="ml-2 text-gray-500">{camera.role}</span>
                  {camera.streamUrl && (
                    <p className="mt-1 truncate text-xs text-gray-500">{camera.streamUrl}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canReview && (
            <div className="space-y-4">
              {counterCameras.length > 0 && (
                <div className="space-y-2">
                  <Label>Apply till zone to</Label>
                  <Select
                    value={zoneCameraId}
                    onValueChange={(id) => {
                      setZoneCameraId(id);
                      const camera = cameras.find((row) => row.id === id);
                      if (camera) setTillZone(tillZoneFromCamera(camera));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Counter camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {counterCameras.map((camera) => (
                        <SelectItem key={camera.id} value={camera.id}>{camera.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <WatchTillZoneEditor
                clipUrl={lastClipUrl}
                zone={tillZone}
                onChange={setTillZone}
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => tillZoneMutation.mutate()}
                  disabled={tillZoneMutation.isPending || (!zoneCameraId && !cameraName.trim())}
                >
                  Save till zone
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_160px] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="watch-camera-name">Camera name</Label>
                  <Input
                    id="watch-camera-name"
                    value={cameraName}
                    onChange={(event) => setCameraName(event.target.value)}
                    placeholder="Counter camera"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={cameraRole} onValueChange={setCameraRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="counter">Counter</SelectItem>
                      <SelectItem value="entrance">Entrance</SelectItem>
                      <SelectItem value="floor">Shop floor</SelectItem>
                      <SelectItem value="exit">Exit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="watch-camera-stream">Stream URL (optional)</Label>
                <Input
                  id="watch-camera-stream"
                  value={cameraStreamUrl}
                  onChange={(event) => setCameraStreamUrl(event.target.value)}
                  placeholder="rtsp://192.168.1.20/stream"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveCamera} disabled={!cameraName.trim() || cameraMutation.isPending}>
                  Add camera
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="sm:w-[var(--modal-w-md)] sm:pt-6">
          <DialogHeader>
            <DialogTitle>Review incident</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <DialogBody>
              <div className="space-y-3 text-sm">
                <p>{reviewing.copy}</p>
                <p className="text-gray-600">
                  {dayjs(reviewing.startedAt).format(DATE_FORMATS.DISPLAY_WITH_TIME)}
                </p>
                <WatchIncidentClip
                  kind={reviewing.kind}
                  clipSource={reviewClipSource}
                  detections={clipDetections}
                  detectionsStatus={detectionsStatus}
                />
                <div className="space-y-2">
                  <Label htmlFor="watch-review-clip">Attach clip (optional)</Label>
                  <Input
                    id="watch-review-clip"
                    type="file"
                    accept={WATCH_CLIP_ACCEPT}
                    onChange={handleAttachClip}
                    disabled={attachClipMutation.isPending || reviewMutation.isPending}
                  />
                  {attachClipMutation.isPending && (
                    <p className="text-xs text-gray-600">Uploading clip…</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="watch-review-note">Note (optional)</Label>
                  <Textarea
                    id="watch-review-note"
                    rows={3}
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="What you saw in the clip"
                  />
                </div>
              </div>
            </DialogBody>
          )}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => handleReview(WATCH_REVIEW_DECISIONS.DISMISS)}
              disabled={reviewMutation.isPending}
            >
              Dismiss
            </Button>
            <Button
              variant="outline"
              onClick={() => handleReview(WATCH_REVIEW_DECISIONS.NEEDS_CONTEXT)}
              disabled={reviewMutation.isPending}
            >
              Needs more context
            </Button>
            <Button
              onClick={() => handleReview(WATCH_REVIEW_DECISIONS.CONFIRM)}
              disabled={reviewMutation.isPending}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Watch;
