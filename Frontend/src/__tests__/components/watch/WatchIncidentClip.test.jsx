import { render, screen } from '@testing-library/react';
import WatchIncidentClip from '../../../components/watch/WatchIncidentClip';
import { WATCH_INCIDENT_KINDS } from '../../../constants';

const SAMPLE_DETECTIONS = {
  fps: 5,
  frames: [
    {
      t: 0,
      detections: [{ track_id: '7', bbox: [0.1, 0.2, 0.3, 0.8], confidence: 0.9 }],
    },
  ],
};

describe('WatchIncidentClip', () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
    }));
  });

  it('shows camera-miss copy without an iframe', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.SALE_WITHOUT_EVENT}
        clipSource={{ type: 'none' }}
      />
    );
    expect(screen.getByText(/No camera clip for this sale/i)).toBeInTheDocument();
    expect(screen.queryByTitle('Incident clip')).not.toBeInTheDocument();
  });

  it('plays an uploaded clip in a video element', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{ type: 'video', url: '/uploads/watch/tenant-1/clip.mp4' }}
      />
    );
    const player = screen.getByTitle('Incident clip');
    expect(player.tagName).toBe('VIDEO');
    expect(player).toHaveAttribute('src', '/uploads/watch/tenant-1/clip.mp4');
    expect(player).toHaveAttribute('controls');
    expect(screen.queryByRole('link', { name: /Open on YouTube/i })).not.toBeInTheDocument();
  });

  it('shows stored-clip empty copy when there is no playable source', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{ type: 'none' }}
      />
    );
    expect(screen.getByText(/Clip is not stored in ABS/i)).toBeInTheDocument();
    expect(screen.queryByTitle('Incident clip')).not.toBeInTheDocument();
  });

  it('embeds a YouTube clip without autoplay', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{
          type: 'youtube',
          videoId: 'jNItxZoc2pg',
          watchUrl: 'https://www.youtube.com/watch?v=jNItxZoc2pg',
        }}
      />
    );
    const iframe = screen.getByTitle('Incident clip');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/jNItxZoc2pg');
    expect(iframe.getAttribute('allow') || '').not.toMatch(/autoplay/i);
    expect(screen.getByRole('link', { name: /Open on YouTube/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=jNItxZoc2pg'
    );
  });

  it('does not overlay boxes on a YouTube iframe', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{
          type: 'youtube',
          videoId: 'jNItxZoc2pg',
          watchUrl: 'https://www.youtube.com/watch?v=jNItxZoc2pg',
        }}
        detections={SAMPLE_DETECTIONS}
        detectionsStatus="ready"
      />
    );
    expect(screen.getByTitle('Incident clip').tagName).toBe('IFRAME');
    expect(screen.queryByTestId('watch-person-overlay')).not.toBeInTheDocument();
    expect(screen.queryByText(/Person 1/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Person boxes are not drawn on YouTube embeds/i)).toBeInTheDocument();
  });

  it('overlays person boxes on an uploaded clip', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{ type: 'video', url: '/uploads/watch/tenant-1/clip.mp4' }}
        detections={SAMPLE_DETECTIONS}
        detectionsStatus="ready"
      />
    );
    expect(screen.getByTitle('Incident clip').tagName).toBe('VIDEO');
    expect(screen.getByTestId('watch-person-overlay')).toBeInTheDocument();
    expect(screen.getByText(/Boxes show who the detector counted — not names/i)).toBeInTheDocument();
    expect(screen.getByText('Person 1')).toBeInTheDocument();
    expect(screen.getByText(/Person 1 is one unique person in this clip/i)).toBeInTheDocument();
  });

  it('plays old clips without a sidecar and notes that boxes are missing', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{ type: 'video', url: '/uploads/watch/tenant-1/old.mp4' }}
        detectionsStatus="missing"
      />
    );
    expect(screen.getByTitle('Incident clip').tagName).toBe('VIDEO');
    expect(screen.queryByTestId('watch-person-overlay')).not.toBeInTheDocument();
    expect(screen.getByText(/Detection boxes are not stored for this clip/i)).toBeInTheDocument();
  });

  it('says detection boxes are loading', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{ type: 'video', url: '/uploads/watch/tenant-1/clip.mp4' }}
        detectionsStatus="loading"
      />
    );
    expect(screen.getByText(/Loading detection boxes/i)).toBeInTheDocument();
    expect(screen.queryByTestId('watch-person-overlay')).not.toBeInTheDocument();
  });

  it('says when the sidecar has no person boxes', () => {
    render(
      <WatchIncidentClip
        kind={WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION}
        clipSource={{ type: 'video', url: '/uploads/watch/tenant-1/clip.mp4' }}
        detections={{ fps: 5, frames: [{ t: 0, detections: [] }] }}
        detectionsStatus="ready"
      />
    );
    expect(screen.queryByTestId('watch-person-overlay')).not.toBeInTheDocument();
    expect(screen.getByText(/no person boxes were stored/i)).toBeInTheDocument();
  });
});
