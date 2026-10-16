import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Plus } from 'lucide-react';
import watchService from '../../services/watchService';
import { showError, showSuccess } from '../../utils/toast';
import {
  cameraHealthById,
  describeCameraHealth,
  describeDevice,
  WATCH_AGENT_CAMERA_COMMAND,
  WATCH_CAMERA_ROLE_LABELS,
} from '../../utils/watchDevices';
import { QUERY_CACHE } from '../../constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import WatchPairDialog from './WatchPairDialog';

/** Health is re-read this often while the page is open (the agent reports every minute). */
const DEVICES_REFRESH_MS = 30000;

const TONE_CLASSES = {
  success: 'border-green-200 bg-green-50 text-green-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-800',
  muted: 'border-gray-200 bg-gray-50 text-gray-700',
};

const StatusPill = ({ tone, label }) => (
  <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone] || TONE_CLASSES.muted}`}>
    {label}
  </span>
);

const UNLINKED_STATUS = {
  removed: { tone: 'muted', label: 'Not watched', detail: 'Its Watch device was removed.' },
  manual: { tone: 'muted', label: 'Not watched', detail: 'Added by hand, not by a Watch device.' },
};

const CameraRow = ({ camera, health, deviceOnline, unlinked = null }) => {
  const status = unlinked
    ? UNLINKED_STATUS[unlinked]
    : describeCameraHealth(health, { deviceOnline, isActive: camera.isActive !== false });
  return (
    <li className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-gray-900">{camera.name}</span>
        <span className="ml-2 text-xs text-gray-500">{WATCH_CAMERA_ROLE_LABELS[camera.role] || camera.role}</span>
        {status.detail && <p className="mt-0.5 break-words text-xs text-gray-600">{status.detail}</p>}
      </div>
      <StatusPill tone={status.tone} label={status.label} />
    </li>
  );
};

/**
 * Shop computers running the ABS Watch agent, their cameras and how each one is doing.
 *
 * @param {{ cameras?: object[], canManage?: boolean, scopeKey?: unknown[], enabled?: boolean }} props
 */
const WatchDevicesCard = ({ cameras = [], canManage = false, scopeKey = [], enabled = true }) => {
  const queryClient = useQueryClient();
  const [pairOpen, setPairOpen] = useState(false);
  const [removing, setRemoving] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['watch', 'devices', ...scopeKey],
    queryFn: () => watchService.listDevices(),
    enabled,
    refetchInterval: DEVICES_REFRESH_MS,
    staleTime: QUERY_CACHE.STALE_TIME_VOLATILE,
  });
  const devices = useMemo(() => data?.data || [], [data]);
  const healthById = useMemo(() => cameraHealthById(devices), [devices]);
  const deviceIds = useMemo(() => new Set(devices.map((device) => device.id)), [devices]);
  const unlinkedCameras = useMemo(
    () => cameras.filter((camera) => !camera.deviceId || !deviceIds.has(camera.deviceId)),
    [cameras, deviceIds]
  );

  const revokeMutation = useMutation({
    mutationFn: (id) => watchService.revokeDevice(id),
    onSuccess: () => {
      showSuccess('Watch device removed');
      setRemoving(null);
      queryClient.invalidateQueries({ queryKey: ['watch'] });
    },
    onError: (error) => showError(error, 'Could not remove the Watch device'),
  });

  const now = Date.now();

  return (
    <Card className="border border-gray-200">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Watch devices</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setPairOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Watch device
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-gray-100" />
        ) : devices.length === 0 ? (
          <p className="text-sm text-gray-600">
            No Watch device yet. Pair the computer at your till (or any computer on the same network as your
            cameras) and it will watch the cameras there.
          </p>
        ) : (
          <ul className="space-y-3">
            {devices.map((device) => {
              const status = describeDevice(device, now);
              const deviceCameras = cameras.filter((camera) => camera.deviceId === device.id);
              const about = [status.detail, device.platform, device.agentVersion && `agent ${device.agentVersion}`]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={device.id} className="rounded-md border border-gray-200 px-3 py-3" data-testid="watch-device">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Monitor className="h-4 w-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{device.name}</span>
                        <StatusPill tone={status.tone} label={status.label} />
                      </div>
                      {about && <p className="mt-1 text-xs text-gray-600">{about}</p>}
                    </div>
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(device)}>
                        {device.status === 'pending' ? 'Cancel' : 'Remove'}
                      </Button>
                    )}
                  </div>
                  {deviceCameras.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      {deviceCameras.map((camera) => (
                        <CameraRow
                          key={camera.id}
                          camera={camera}
                          health={healthById.get(camera.id)}
                          deviceOnline={device.online}
                        />
                      ))}
                    </ul>
                  )}
                  {deviceCameras.length === 0 && device.status === 'active' && (
                    <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
                      <p>No cameras yet. On that computer, add one, then start the agent:</p>
                      <code className="block break-all font-mono text-gray-800">{WATCH_AGENT_CAMERA_COMMAND}</code>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!isLoading && unlinkedCameras.length > 0 && (
          <div className="space-y-2 rounded-md border border-dashed border-gray-200 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Other cameras</p>
            <ul className="space-y-2">
              {unlinkedCameras.map((camera) => (
                <CameraRow key={camera.id} camera={camera} unlinked={camera.deviceId ? 'removed' : 'manual'} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <WatchPairDialog open={pairOpen} onOpenChange={setPairOpen} />

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.status === 'pending' ? 'Cancel this pairing?' : `Remove ${removing?.name || 'this device'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.status === 'pending'
                ? 'The pairing code stops working.'
                : 'It stops sending activity to ABS straight away and its cameras are switched off. Past incidents and clips stay. To use the computer again, pair it with a new code.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (removing) revokeMutation.mutate(removing.id);
              }}
              loading={revokeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing?.status === 'pending' ? 'Cancel pairing' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default WatchDevicesCard;
