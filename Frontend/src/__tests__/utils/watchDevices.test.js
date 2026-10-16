import {
  buildPairCommand,
  cameraHealthById,
  describeCameraHealth,
  describeDevice,
  formatLastSeen,
  watchAgentApiBase,
  WATCH_AGENT_DEFAULT_API,
} from '../../utils/watchDevices';

const NOW = new Date('2026-10-12T10:00:00Z').getTime();
const minutesAgo = (minutes) => new Date(NOW - minutes * 60000).toISOString();

describe('watchDevices', () => {
  describe('pairing command', () => {
    it('needs no API address for the main ABS API', () => {
      expect(buildPairCommand('K7P2-9QXM', WATCH_AGENT_DEFAULT_API)).toBe('python3 abs_watch_agent.py pair K7P2-9QXM');
    });

    it('points the agent at the API this page uses otherwise (local testing)', () => {
      expect(buildPairCommand('K7P2-9QXM', 'http://localhost:5173')).toBe(
        'python3 abs_watch_agent.py pair K7P2-9QXM --api http://localhost:5173'
      );
    });

    it('uses the page origin when /api is proxied on the same origin', () => {
      expect(watchAgentApiBase('', 'http://localhost:5173')).toBe('http://localhost:5173');
      expect(watchAgentApiBase('https://api.africanbusinesssuite.com/', 'https://myapp.absghana.com')).toBe(
        'https://api.africanbusinesssuite.com'
      );
    });
  });

  it('describes when a device was last seen', () => {
    expect(formatLastSeen(null, NOW)).toBe('Never connected');
    expect(formatLastSeen(minutesAgo(0.5), NOW)).toBe('Last seen just now');
    expect(formatLastSeen(minutesAgo(12), NOW)).toBe('Last seen 12 min ago');
    expect(formatLastSeen(minutesAgo(60), NOW)).toBe('Last seen 1 hour ago');
    expect(formatLastSeen(minutesAgo(60 * 72), NOW)).toBe('Last seen 3 days ago');
  });

  it('describes devices: waiting to pair, online and offline', () => {
    expect(describeDevice({ status: 'pending', pairingExpiresAt: new Date(NOW + 9.5 * 60000).toISOString() }, NOW)).toEqual({
      tone: 'muted',
      label: 'Waiting to pair',
      detail: 'Pairing code expires in 10 min',
    });
    expect(describeDevice({ status: 'active', online: true, lastSeenAt: minutesAgo(1) }, NOW)).toMatchObject({
      tone: 'success',
      label: 'Online',
    });
    expect(describeDevice({ status: 'active', online: false, lastSeenAt: minutesAgo(30) }, NOW)).toEqual({
      tone: 'danger',
      label: 'Offline',
      detail: 'Last seen 30 min ago',
    });
  });

  describe('camera health', () => {
    it('is unknown while its device is offline, and off when switched off', () => {
      expect(describeCameraHealth({ online: true }, { deviceOnline: false })).toMatchObject({ label: 'Unknown' });
      expect(describeCameraHealth({ online: true }, { deviceOnline: true, isActive: false })).toMatchObject({ label: 'Off' });
    });

    it('explains why there is no video', () => {
      expect(describeCameraHealth(
        { online: false, error: "Can't open rtsp://***@192.168.1.20/stream" },
        { deviceOnline: true }
      )).toEqual({ tone: 'danger', label: 'No video', detail: "Can't open rtsp://***@192.168.1.20/stream" });
    });

    it('flags a computer too slow to analyse enough frames', () => {
      expect(describeCameraHealth({ online: true, fps: 25, detectFps: 1.2 }, { deviceOnline: true })).toMatchObject({
        tone: 'warning',
        label: 'Slow',
      });
      // 0 means it only just started: not slow yet
      expect(describeCameraHealth({ online: true, fps: 25, detectFps: 0 }, { deviceOnline: true })).toMatchObject({
        tone: 'success',
        label: 'Live',
        detail: '25 fps from the camera',
      });
    });

    it('waits for the first report, and for the first picture', () => {
      expect(describeCameraHealth(undefined, { deviceOnline: true })).toMatchObject({ label: 'Starting' });
      expect(describeCameraHealth({ online: false, error: null, lastFrameAt: null }, { deviceOnline: true })).toMatchObject({
        label: 'Starting',
      });
      // It had video before, so this is a dropped camera, not one starting up
      expect(describeCameraHealth({ online: false, error: null, lastFrameAt: '2026-10-12T09:00:00Z' }, { deviceOnline: true }))
        .toMatchObject({ label: 'No video' });
    });
  });

  it('indexes the latest health report by camera id', () => {
    const byId = cameraHealthById([
      { id: 'dev-1', cameras: [{ cameraId: 'cam-1', online: true }] },
      { id: 'dev-2', cameras: null },
    ]);
    expect(byId.get('cam-1')).toEqual({ cameraId: 'cam-1', online: true });
    expect(byId.size).toBe(1);
  });
});
