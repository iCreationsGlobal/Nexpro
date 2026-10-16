import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Eye, RefreshCw, Users, ShoppingCart, AlertTriangle, VideoOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import watchService from '../services/watchService';
import { showError, showSuccess } from '../utils/toast';
import { parseWatchClipSource, WATCH_CLIP_ACCEPT, WATCH_CLIP_MAX_BYTES, WATCH_CLIP_MAX_MB } from '../utils/watchClipSource';
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
import WatchDevicesCard from '../components/watch/WatchDevicesCard';
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
    // New cameras and fresher pictures from Watch devices show up without a reload
    refetchInterval: 60000,
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

  const zoneCamera = useMemo(
    () => cameras.find((camera) => camera.id === zoneCameraId) || null,
    [cameras, zoneCameraId]
  );
  const snapshotTakenAt = zoneCamera?.metadata?.snapshot?.capturedAt || null;
  const { data: snapshotData } = useQuery({
    // A new picture has a new time, so it's fetched once and kept
    queryKey: ['watch', 'snapshot', zoneCameraId, snapshotTakenAt],
    queryFn: () => watchService.getCameraSnapshot(zoneCameraId),
    enabled: canReview && !!zoneCameraId && !!snapshotTakenAt,
    staleTime: Infinity,
    retry: false,
  });
  const snapshot = snapshotData?.data || null;
  const reviewClipSource = useMemo(
    () => (reviewing ? parseWatchClipSource(reviewing) : { type: 'none' }),
    [reviewing]
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

  const tillZoneMutation = useMutation({
    mutationFn: async () => {
      if (!zoneCamera) {
        throw new Error('Connect a counter camera first, then save its till zone.');
      }
      // Name, role and on/off are sent back as they are; the camera's Watch device and picture stay linked
      return watchService.updateCamera(zoneCamera.id, {
        name: zoneCamera.name,
        role: zoneCamera.role || 'counter',
        isActive: zoneCamera.isActive !== false,
        zones: [
          clampTillZone(tillZone),
          ...(Array.isArray(zoneCamera.zones) ? zoneCamera.zones.filter((zone) => zone?.type !== 'counter') : []),
        ],
      });
    },
    onSuccess: () => {
      showSuccess('Till zone saved. The Watch device uses it within a minute.');
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

      <WatchDevicesCard
        cameras={cameras}
        canManage={canReview}
        scopeKey={[activeTenantId, activeShopId]}
        enabled={scopeReady}
      />

      {canReview && (
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle>Till zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Time spent in this box counts as till activity and is compared with recorded sales. Walking into the
              shop is a visit, not till activity.
            </p>
            {counterCameras.length > 1 && (
              <div className="space-y-2">
                <Label>Counter camera</Label>
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
            {counterCameras.length === 1 && (
              <p className="text-sm font-medium text-gray-900">{counterCameras[0].name}</p>
            )}
            <WatchTillZoneEditor
              imageUrl={snapshot?.dataUrl || ''}
              capturedAt={snapshot?.capturedAt || null}
              clipUrl={lastClipUrl}
              zone={tillZone}
              onChange={setTillZone}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {!zoneCamera && (
                <p className="text-xs text-gray-600">
                  Add a counter camera on a Watch device to save its zone. Uploaded clips use the box as drawn.
                </p>
              )}
              <Button
                onClick={() => tillZoneMutation.mutate()}
                disabled={!zoneCamera}
                loading={tillZoneMutation.isPending}
              >
                Save till zone
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
