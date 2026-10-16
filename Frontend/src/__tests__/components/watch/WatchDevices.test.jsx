import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WatchDevicesCard from '../../../components/watch/WatchDevicesCard';
import WatchPairDialog from '../../../components/watch/WatchPairDialog';

vi.mock('../../../services/watchService', () => ({
  default: {
    listDevices: vi.fn(),
    createDevicePairing: vi.fn(),
    revokeDevice: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({ API_BASE_URL: 'http://localhost:5002' }));

vi.mock('../../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogBody: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }) => (open ? <div role="alertdialog">{children}</div> : null),
  AlertDialogContent: ({ children }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }) => <button type="button">{children}</button>,
  AlertDialogAction: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
}));

import watchService from '../../../services/watchService';

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

function renderWithClient(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('WatchPairDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watchService.createDevicePairing.mockResolvedValue({
      success: true,
      data: {
        device: { id: 'dev-1', name: 'Till computer', status: 'pending' },
        pairingCode: 'K7P2-9QXM',
        expiresAt: inMinutes(15),
      },
    });
  });

  it('shows the one-time code and the command for the shop computer', async () => {
    watchService.listDevices.mockResolvedValue({ data: [{ id: 'dev-1', name: 'Till computer', status: 'pending' }] });
    const user = userEvent.setup();
    renderWithClient(<WatchPairDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText('Name this computer'), 'Till computer');
    await user.click(screen.getByRole('button', { name: 'Get pairing code' }));

    expect(watchService.createDevicePairing).toHaveBeenCalledWith({ name: 'Till computer' });
    expect(await screen.findByTestId('watch-pairing-code')).toHaveTextContent('K7P2-9QXM');
    expect(screen.getByText('python3 abs_watch_agent.py pair K7P2-9QXM --api http://localhost:5002')).toBeInTheDocument();
    expect(await screen.findByText(/Waiting for the computer to connect/)).toBeInTheDocument();
  });

  it('moves on to adding a camera once the computer has paired', async () => {
    watchService.listDevices.mockResolvedValue({
      data: [{ id: 'dev-1', name: 'Till computer', status: 'active', online: true }],
    });
    const user = userEvent.setup();
    renderWithClient(<WatchPairDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Get pairing code' }));

    expect(await screen.findByText('Till computer is connected')).toBeInTheDocument();
    expect(screen.getByText(/camera add --name Counter --role counter --source camera:0/)).toBeInTheDocument();
    expect(screen.queryByTestId('watch-pairing-code')).not.toBeInTheDocument();
  });
});

describe('WatchDevicesCard', () => {
  const devices = [
    {
      id: 'dev-1',
      name: 'Till computer',
      status: 'active',
      online: true,
      lastSeenAt: new Date().toISOString(),
      platform: 'Darwin 24.6.0',
      agentVersion: '0.2.0',
      cameras: [{ cameraId: 'cam-1', online: true, fps: 25, detectFps: 4.8 }],
    },
    { id: 'dev-2', name: 'Back office', status: 'pending', pairingExpiresAt: inMinutes(10), cameras: [] },
  ];
  const cameras = [
    { id: 'cam-1', name: 'Till camera', role: 'counter', deviceId: 'dev-1', isActive: true },
    { id: 'cam-2', name: 'Old door', role: 'entrance', deviceId: null, isActive: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    watchService.listDevices.mockResolvedValue({ data: devices });
    watchService.revokeDevice.mockResolvedValue({ success: true });
  });

  it('lists devices with their cameras and how each is doing', async () => {
    renderWithClient(<WatchDevicesCard cameras={cameras} canManage />);

    const [till, backOffice] = await screen.findAllByTestId('watch-device');
    expect(within(till).getByText('Till computer')).toBeInTheDocument();
    expect(within(till).getByText('Online')).toBeInTheDocument();
    expect(within(till).getByText(/Darwin 24\.6\.0 · agent 0\.2\.0/)).toBeInTheDocument();
    expect(within(till).getByText('Till camera')).toBeInTheDocument();
    expect(within(till).getByText('Live')).toBeInTheDocument();
    expect(within(till).getByText('25 fps from the camera')).toBeInTheDocument();
    expect(within(backOffice).getByText('Waiting to pair')).toBeInTheDocument();
    expect(screen.getByText('Old door')).toBeInTheDocument();
    expect(screen.getByText('Added by hand, not by a Watch device.')).toBeInTheDocument();
  });

  it('removes a device after confirmation', async () => {
    const user = userEvent.setup();
    renderWithClient(<WatchDevicesCard cameras={cameras} canManage />);

    const [till] = await screen.findAllByTestId('watch-device');
    await user.click(within(till).getByRole('button', { name: 'Remove' }));
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Remove Till computer?')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(watchService.revokeDevice).toHaveBeenCalledWith('dev-1'));
  });

  it('only lets managers add or remove devices', async () => {
    renderWithClient(<WatchDevicesCard cameras={cameras} canManage={false} />);

    await screen.findAllByTestId('watch-device');
    expect(screen.queryByRole('button', { name: /Add Watch device/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });
});
