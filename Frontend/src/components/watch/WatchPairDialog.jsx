import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { CheckCircle2, Copy, Loader2 } from 'lucide-react';
import watchService from '../../services/watchService';
import { API_BASE_URL } from '../../services/api';
import { showError, showSuccess } from '../../utils/toast';
import {
  buildPairCommand,
  watchAgentApiBase,
  WATCH_AGENT_CAMERA_COMMAND,
  WATCH_AGENT_RUN_COMMAND,
} from '../../utils/watchDevices';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PAIRING_POLL_MS = 3000;

/**
 * @param {{ command: string }} props
 */
export const CommandLine = ({ command }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      showSuccess('Copied');
    } catch {
      showError(null, 'Copy failed. Select the text and copy it instead.');
    }
  };
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">{command}</code>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={copy} aria-label="Copy command">
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

/**
 * Pair a shop computer running the ABS Watch agent: name it, show the one-time code, then
 * notice when the agent has used it.
 *
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void }} props
 */
const WatchPairDialog = ({ open, onOpenChange }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [pairing, setPairing] = useState(null);

  useEffect(() => {
    if (open) return;
    setName('');
    setPairing(null);
  }, [open]);

  const createMutation = useMutation({
    mutationFn: () => watchService.createDevicePairing({ name: name.trim() || undefined }),
    onSuccess: (response) => {
      setPairing(response?.data || null);
      queryClient.invalidateQueries({ queryKey: ['watch', 'devices'] });
    },
    onError: (error) => showError(error, 'Could not create a pairing code'),
  });

  const deviceId = pairing?.device?.id;
  const [paired, setPaired] = useState(null);
  const { data: devicesData } = useQuery({
    queryKey: ['watch', 'pairing', deviceId],
    queryFn: () => watchService.listDevices(),
    enabled: open && !!deviceId && !paired,
    refetchInterval: PAIRING_POLL_MS,
  });

  useEffect(() => {
    if (!open) {
      setPaired(null);
      return;
    }
    const device = (devicesData?.data || []).find((row) => row.id === deviceId && row.status === 'active');
    if (device && !paired) {
      setPaired(device);
      queryClient.invalidateQueries({ queryKey: ['watch'] });
    }
  }, [open, devicesData, deviceId, paired, queryClient]);

  const expiresAt = pairing?.expiresAt ? dayjs(pairing.expiresAt) : null;
  const expired = !!expiresAt && !paired && expiresAt.isBefore(dayjs());
  const apiBase = useMemo(
    () => watchAgentApiBase(API_BASE_URL, typeof window !== 'undefined' ? window.location.origin : ''),
    []
  );
  const deviceName = pairing?.device?.name || name.trim() || 'this computer';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[var(--modal-w-md)] sm:pt-6">
        <DialogHeader>
          <DialogTitle>{paired ? `${paired.name} is connected` : 'Add a Watch device'}</DialogTitle>
          {!pairing && (
            <DialogDescription>
              Watch runs on a computer in your shop: the till computer, or any computer on the same network as
              your cameras. Video is analysed there. ABS receives activity, a picture for drawing the till zone,
              and short clips of till activity.
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogBody>
          {!pairing && (
            <div className="space-y-2">
              <Label htmlFor="watch-device-name">Name this computer</Label>
              <Input
                id="watch-device-name"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Till computer"
              />
            </div>
          )}

          {pairing && !paired && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border border-gray-200 px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-500">Pairing code for {deviceName}</p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] text-gray-900" data-testid="watch-pairing-code">
                  {pairing.pairingCode}
                </p>
                <p className={`mt-1 text-xs ${expired ? 'text-red-700' : 'text-gray-600'}`}>
                  {expired
                    ? 'This code has expired. Close this window and get a new one.'
                    : `Works once, until ${expiresAt ? expiresAt.format('HH:mm') : 'it expires'}.`}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-gray-700">On that computer, in the ABS Watch agent folder, run:</p>
                <CommandLine command={buildPairCommand(pairing.pairingCode, apiBase)} />
              </div>
              {!expired && (
                <p className="flex items-center gap-2 text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for the computer to connect…
                </p>
              )}
            </div>
          )}

          {paired && (
            <div className="space-y-4 text-sm">
              <p className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                Paired. No password or camera login was shared with ABS.
              </p>
              <div className="space-y-2">
                <p className="font-medium text-gray-900">1. Add a camera on that computer</p>
                <CommandLine command={WATCH_AGENT_CAMERA_COMMAND} />
                <p className="text-xs text-gray-600">
                  camera:0 is the computer&apos;s own camera (an iPhone can be one through Continuity Camera). For CCTV,
                  use the camera&apos;s address instead, for example rtsp://user:password@192.168.1.20:554/stream. The
                  camera login stays on that computer.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-gray-900">2. Start watching</p>
                <CommandLine command={WATCH_AGENT_RUN_COMMAND} />
              </div>
              <p className="text-gray-700">
                3. The camera&apos;s picture appears here within a minute. Draw the till zone on it.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="gap-2 sm:justify-end">
          {!pairing ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
                Get pairing code
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>{paired ? 'Done' : 'Close'}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WatchPairDialog;
