jest.mock('../../../models', () => ({
  VisionCamera: {
    findAll: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../../middleware/upload', () => ({
  baseUploadDir: '/tmp/watch-uploads-test',
  ensureDirExists: jest.fn(),
}));

jest.mock('../../../services/watchReconciliationService', () => ({
  ingestEvents: jest.fn(),
}));

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ingestEvents } = require('../../../services/watchReconciliationService');
const {
  resolveUploadedClipPath,
  stampUploadedClipOnEvents,
  summarizeVisionEvents,
  explainVisionEdgeFailure,
  processUploadedClip,
  persistDetectionsSidecar,
  readDetectionsSidecar,
  compactDetectionFrames,
} = require('../../../services/watchVisionEdgeService');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

describe('watchVisionEdgeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a tenant-scoped upload path and rejects other tenants', () => {
    const clipUrl = '/uploads/watch/tenant-1/clip.mp4';
    const diskPath = path.join('/tmp/watch-uploads-test', 'watch', 'tenant-1', 'clip.mp4');
    jest.spyOn(fs, 'existsSync').mockImplementation((value) => value === diskPath);

    expect(resolveUploadedClipPath(clipUrl, 'tenant-1')).toEqual({
      diskPath,
      clipUrl,
    });
    expect(resolveUploadedClipPath(clipUrl, 'tenant-2').error).toMatch(/this workspace/);
    expect(resolveUploadedClipPath('/Users/us/clip.mp4', 'tenant-1').error).toMatch(/uploaded Watch file/);
    fs.existsSync.mockRestore();
  });

  it('stamps the uploaded clip URL onto events', () => {
    const stamped = stampUploadedClipOnEvents(
      [{ event_type: 'counter_interaction', metadata: { keep: true } }],
      { clipUrl: '/uploads/watch/tenant-1/clip.mp4', maxSeconds: 30 }
    );
    expect(stamped[0].clipReference).toBe('/uploads/watch/tenant-1/clip.mp4');
    expect(stamped[0].metadata).toEqual(expect.objectContaining({
      keep: true,
      source: 'uploaded_clip',
      maxSeconds: 30,
    }));
  });

  it('summarizes unique people, not each person_entered fire', () => {
    expect(summarizeVisionEvents([
      { event_type: 'person_entered', track_id: '1' },
      { eventType: 'person_entered', trackId: '1' },
      { event_type: 'person_entered', track_id: '2' },
      { event_type: 'counter_interaction', track_id: '1' },
      { event_type: 'person_entered_counter_zone', track_id: '1' },
    ])).toEqual({ visitors: 2, counterInteractions: 1 });
  });

  it('counts two person_entered with the same track as one visitor', () => {
    expect(summarizeVisionEvents([
      { event_type: 'person_entered', track_id: 'A' },
      { event_type: 'person_entered', track_id: 'A' },
    ])).toEqual({ visitors: 1, counterInteractions: 0 });
  });

  it('explains missing ultralytics clearly', () => {
    expect(explainVisionEdgeFailure("No module named 'ultralytics'", 1)).toMatch(/ultralytics is not installed/);
  });

  it('compacts overlay fields and drops extras', () => {
    const frames = compactDetectionFrames([
      {
        t: 1.5,
        detections: [
          { track_id: '7', bbox: [0.1, 0.2, 0.3, 0.8], confidence: 0.91, extra: true },
          { id: 'skip-me' },
        ],
      },
    ]);
    expect(frames).toEqual([{
      t: 1.5,
      detections: [{ track_id: '7', bbox: [0.1, 0.2, 0.3, 0.8], confidence: 0.91 }],
    }]);
  });

  it('persists a sidecar next to the mp4 and isolates other tenants', () => {
    const tenantDir = path.join('/tmp/watch-uploads-test', 'watch', 'tenant-1');
    fs.mkdirSync(tenantDir, { recursive: true });
    const diskPath = path.join(tenantDir, 'clip.mp4');
    fs.writeFileSync(diskPath, Buffer.from('mp4'));

    persistDetectionsSidecar(diskPath, {
      fps: 5,
      frames: [{
        t: 1,
        detections: [{ track_id: '7', bbox: [0.1, 0.2, 0.3, 0.8], confidence: 0.9, extra: true }],
      }],
    });

    const own = readDetectionsSidecar({
      tenantId: 'tenant-1',
      clipUrl: '/uploads/watch/tenant-1/clip.mp4',
    });
    expect(own.success).toBe(true);
    expect(own.data.fps).toBe(5);
    expect(own.data.frames[0].detections[0]).toEqual({
      track_id: '7',
      bbox: [0.1, 0.2, 0.3, 0.8],
      confidence: 0.9,
    });

    const other = readDetectionsSidecar({
      tenantId: 'tenant-2',
      clipUrl: '/uploads/watch/tenant-1/clip.mp4',
    });
    expect(other.success).toBe(false);
    expect(other.status).toBe(400);

    fs.rmSync(path.join('/tmp/watch-uploads-test', 'watch'), { recursive: true, force: true });
  });

  it('returns 404 when the detections sidecar is missing', () => {
    const tenantDir = path.join('/tmp/watch-uploads-test', 'watch', 'tenant-1');
    fs.mkdirSync(tenantDir, { recursive: true });
    fs.writeFileSync(path.join(tenantDir, 'old.mp4'), Buffer.from('mp4'));

    const missing = readDetectionsSidecar({
      tenantId: 'tenant-1',
      clipUrl: '/uploads/watch/tenant-1/old.mp4',
    });
    expect(missing.success).toBe(false);
    expect(missing.status).toBe(404);
    expect(missing.error).toMatch(/not stored/i);

    fs.rmSync(path.join('/tmp/watch-uploads-test', 'watch'), { recursive: true, force: true });
  });

  it('does not spawn YOLO when the saved clip is missing', async () => {
    const result = await processUploadedClip({
      tenantId: 'tenant-1',
      clipUrl: '/uploads/watch/tenant-1/missing.mp4',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|uploaded Watch file/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('ingests stamped events after a mocked vision-edge run', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      fps: 5,
      frames: [{ t: 0, detections: [{ track_id: '7', bbox: [0.1, 0.2, 0.3, 0.8], confidence: 0.9 }] }],
      events: [
        { event_type: 'person_entered', started_at: '2026-09-01T00:00:00.000Z' },
        { event_type: 'counter_interaction', started_at: '2026-09-01T00:00:04.000Z' },
      ],
    }));
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    spawn.mockImplementation(() => {
      process.nextTick(() => child.emit('close', 0));
      return child;
    });

    ingestEvents.mockResolvedValue({
      success: true,
      data: { received: 2, created: 2, skipped: 0, reconciliation: { incidentsCreated: 1 } },
    });

    const result = await processUploadedClip({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      clipUrl: '/uploads/watch/tenant-1/clip.mp4',
      maxSeconds: 30,
    });

    expect(spawn).toHaveBeenCalled();
    expect(spawn.mock.calls[0][2]).toEqual(expect.objectContaining({
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    expect(spawn.mock.calls[0][1]).toEqual(expect.arrayContaining([
      '--video',
      '--yolo',
      '--max-seconds',
      '30',
      '--sample-fps',
      '10',
      '--dwell-seconds',
      '6',
    ]));
    expect(result.success).toBe(true);
    expect(result.data.clipUrl).toBe('/uploads/watch/tenant-1/clip.mp4');
    expect(result.data.visitors).toBe(1);
    expect(result.data.counterInteractions).toBe(1);
    expect(ingestEvents).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      clipReference: '/uploads/watch/tenant-1/clip.mp4',
    }));
    expect(ingestEvents.mock.calls[0][0].events[0].clipReference).toBe('/uploads/watch/tenant-1/clip.mp4');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/clip\.detections\.json$/),
      expect.stringContaining('"track_id":"7"')
    );

    fs.existsSync.mockRestore();
    fs.readFileSync.mockRestore();
    fs.writeFileSync.mockRestore();
    fs.unlinkSync.mockRestore();
  });
});
