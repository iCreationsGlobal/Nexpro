import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WatchClipUploadCard, { uploadedClipProcessMessage } from '../../../components/watch/WatchClipUploadCard';

vi.mock('../../../services/watchService', () => ({
  default: {
    uploadClip: vi.fn(),
    processUploadedClip: vi.fn(),
    getClipDetections: vi.fn(),
  },
}));

vi.mock('../../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import watchService from '../../../services/watchService';

const CLIP_URL = '/uploads/watch/tenant-1/clip.mp4';
const SAMPLE_DETECTIONS = {
  fps: 5,
  frames: [
    {
      t: 0,
      detections: [{ track_id: '7', bbox: [0.1, 0.2, 0.3, 0.8], confidence: 0.9 }],
    },
  ],
};

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WatchClipUploadCard enabled />
    </QueryClientProvider>
  );
}

describe('uploadedClipProcessMessage', () => {
  it('describes people and counter interactions, not products', () => {
    expect(uploadedClipProcessMessage({
      visitors: 2,
      counterInteractions: 1,
      created: 1,
    })).toBe('Clip processed. 2 unique people, 1 till-zone linger compared with recorded sales.');
    expect(uploadedClipProcessMessage({})).toMatch(/No one lingered in the till zone/);
    expect(uploadedClipProcessMessage({ visitors: 2, counterInteractions: 1 })).not.toMatch(/product/i);
  });

  it('uses the visitor count from process results, not a hardcoded 8', () => {
    expect(uploadedClipProcessMessage({ visitors: 3, counterInteractions: 1 })).toMatch(/3 unique people/);
    expect(uploadedClipProcessMessage({ visitors: 8, counterInteractions: 1 })).toMatch(/8 unique people/);
    expect(uploadedClipProcessMessage({ visitors: 1, counterInteractions: 0, created: 1 })).toMatch(/1 unique person/);
  });
});

describe('WatchClipUploadCard overlay', () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
    }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    watchService.uploadClip.mockResolvedValue({ data: { clipUrl: CLIP_URL } });
    watchService.processUploadedClip.mockResolvedValue({
      data: { visitors: 3, counterInteractions: 1, created: 1 },
    });
  });

  it('overlays person boxes on the upload preview after detections load', async () => {
    watchService.getClipDetections.mockResolvedValue({ data: SAMPLE_DETECTIONS });
    const user = userEvent.setup();
    renderCard();

    const file = new File(['clip'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByLabelText(/Short clip/i), file);
    await user.click(screen.getByRole('button', { name: /Upload and detect/i }));

    await waitFor(() => {
      expect(watchService.getClipDetections).toHaveBeenCalledWith(CLIP_URL);
    });
    expect(await screen.findByTitle('Uploaded shop clip')).toBeInTheDocument();
    expect(await screen.findByTestId('watch-person-overlay')).toBeInTheDocument();
    expect(screen.getByText('Person 1')).toBeInTheDocument();
  });

  it('says boxes are missing when the detections sidecar is not stored', async () => {
    watchService.getClipDetections.mockRejectedValue({ response: { status: 404 } });
    const user = userEvent.setup();
    renderCard();

    const file = new File(['clip'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByLabelText(/Short clip/i), file);
    await user.click(screen.getByRole('button', { name: /Upload and detect/i }));

    expect(await screen.findByText(/Detection boxes are not stored for this clip/i)).toBeInTheDocument();
    expect(screen.queryByTestId('watch-person-overlay')).not.toBeInTheDocument();
  });
});
