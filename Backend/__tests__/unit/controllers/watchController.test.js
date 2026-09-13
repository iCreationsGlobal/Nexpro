jest.mock('../../../services/watchReconciliationService', () => ({
  ingestEvents: jest.fn(),
  reconcilePeriod: jest.fn(),
  reviewIncident: jest.fn(),
  getSummary: jest.fn(),
  listIncidents: jest.fn(),
  listEvents: jest.fn(),
  listCameras: jest.fn(),
  upsertCamera: jest.fn(),
}));

jest.mock('../../../services/watchYoutubeDemoService', () => ({
  processYoutubeClip: jest.fn(),
}));

jest.mock('../../../services/watchClipService', () => ({
  saveWatchClip: jest.fn(),
  attachIncidentClip: jest.fn(),
}));

jest.mock('../../../services/watchVisionEdgeService', () => ({
  processUploadedClip: jest.fn(),
  readDetectionsSidecar: jest.fn(),
}));

const { ingestEvents, getSummary, reviewIncident } = require('../../../services/watchReconciliationService');
const { processYoutubeClip } = require('../../../services/watchYoutubeDemoService');
const { saveWatchClip, attachIncidentClip } = require('../../../services/watchClipService');
const { processUploadedClip, readDetectionsSidecar } = require('../../../services/watchVisionEdgeService');
const {
  ingestWatchEvents,
  getWatchSummary,
  reviewWatchIncident,
  processWatchDemoClip,
  uploadWatchClip,
  attachWatchIncidentClip,
  processWatchUploadedClip,
  getWatchClipDetections,
} = require('../../../controllers/watchController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('watchController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses shop middleware scope when ingesting events', async () => {
    ingestEvents.mockResolvedValue({ success: true, data: { created: 1 } });
    const req = {
      tenantId: 'tenant-1',
      shopFilterId: 'shop-1',
      body: { events: [{ eventType: 'counter_interaction', startedAt: '2026-08-30T10:35:00.000Z' }] },
    };
    const res = makeRes();

    await ingestWatchEvents(req, res);

    expect(ingestEvents).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns today summary for the scoped shop', async () => {
    getSummary.mockResolvedValue({
      success: true,
      data: { visitors: 12, unmatchedInteractions: 2, cameraMisses: 1 },
    });
    const req = {
      tenantId: 'tenant-1',
      shopFilterId: 'shop-1',
      query: {},
    };
    const res = makeRes();

    await getWatchSummary(req, res);

    expect(getSummary).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ unmatchedInteractions: 2 }),
    }));
  });

  it('maps a missing incident review to 404', async () => {
    reviewIncident.mockResolvedValue({ success: false, error: 'Incident not found' });
    const req = {
      tenantId: 'tenant-1',
      params: { id: 'missing' },
      user: { id: 'user-1' },
      body: { decision: 'dismiss' },
    };
    const res = makeRes();

    await reviewWatchIncident(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('runs a YouTube demo clip in the scoped shop', async () => {
    processYoutubeClip.mockResolvedValue({
      success: true,
      data: { videoId: 'jNItxZoc2pg', eventCount: 4, created: 4 },
    });
    const req = {
      tenantId: 'tenant-1',
      shopFilterId: 'shop-1',
      body: { youtubeUrl: 'https://www.youtube.com/watch?v=jNItxZoc2pg', maxSeconds: 20 },
    };
    const res = makeRes();

    await processWatchDemoClip(req, res);

    expect(processYoutubeClip).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      youtubeUrl: 'https://www.youtube.com/watch?v=jNItxZoc2pg',
      maxSeconds: 20,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('passes a batch clipReference through ingest', async () => {
    ingestEvents.mockResolvedValue({ success: true, data: { created: 1 } });
    const req = {
      tenantId: 'tenant-1',
      shopFilterId: 'shop-1',
      body: {
        events: [{ eventType: 'counter_interaction', startedAt: '2026-08-30T10:35:00.000Z' }],
        clipReference: '/uploads/watch/tenant-1/clip.mp4',
      },
    };
    const res = makeRes();

    await ingestWatchEvents(req, res);

    expect(ingestEvents).toHaveBeenCalledWith(expect.objectContaining({
      clipReference: '/uploads/watch/tenant-1/clip.mp4',
    }));
  });

  it('rejects a missing clip file on upload', async () => {
    saveWatchClip.mockResolvedValue({ success: false, error: 'Choose a short MP4 or WebM clip.' });
    const req = { tenantId: 'tenant-1' };
    const res = makeRes();

    await uploadWatchClip(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('attaches a clip to an incident', async () => {
    attachIncidentClip.mockResolvedValue({
      success: true,
      data: { id: 'inc-1', clipReference: '/uploads/watch/tenant-1/clip.mp4' },
    });
    const req = {
      tenantId: 'tenant-1',
      params: { id: 'inc-1' },
      body: { clipReference: '/uploads/watch/tenant-1/clip.mp4' },
    };
    const res = makeRes();

    await attachWatchIncidentClip(req, res);

    expect(attachIncidentClip).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      incidentId: 'inc-1',
      clipReference: '/uploads/watch/tenant-1/clip.mp4',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('processes a saved upload with local person detection', async () => {
    processUploadedClip.mockResolvedValue({
      success: true,
      data: { clipUrl: '/uploads/watch/tenant-1/clip.mp4', visitors: 2, counterInteractions: 1, created: 1 },
    });
    const req = {
      tenantId: 'tenant-1',
      shopFilterId: 'shop-1',
      body: { clipUrl: '/uploads/watch/tenant-1/clip.mp4', maxSeconds: 30 },
    };
    const res = makeRes();

    await processWatchUploadedClip(req, res);

    expect(processUploadedClip).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      clipUrl: '/uploads/watch/tenant-1/clip.mp4',
      maxSeconds: 30,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns stored detections for a tenant-owned clip', async () => {
    readDetectionsSidecar.mockReturnValue({
      success: true,
      data: { clipUrl: '/uploads/watch/tenant-1/clip.mp4', fps: 5, frames: [] },
    });
    const req = {
      tenantId: 'tenant-1',
      query: { clipUrl: '/uploads/watch/tenant-1/clip.mp4' },
    };
    const res = makeRes();

    await getWatchClipDetections(req, res);

    expect(readDetectionsSidecar).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      clipUrl: '/uploads/watch/tenant-1/clip.mp4',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns 404 when the detections sidecar is missing', async () => {
    readDetectionsSidecar.mockReturnValue({
      success: false,
      status: 404,
      error: 'Detection boxes are not stored for this clip.',
    });
    const req = {
      tenantId: 'tenant-1',
      query: { clipUrl: '/uploads/watch/tenant-1/old.mp4' },
    };
    const res = makeRes();

    await getWatchClipDetections(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when detections are requested for another tenant path', async () => {
    readDetectionsSidecar.mockReturnValue({
      success: false,
      status: 400,
      error: 'Clip must be an uploaded Watch file for this workspace.',
    });
    const req = {
      tenantId: 'tenant-2',
      query: { clipUrl: '/uploads/watch/tenant-1/clip.mp4' },
    };
    const res = makeRes();

    await getWatchClipDetections(req, res);

    expect(readDetectionsSidecar).toHaveBeenCalledWith({
      tenantId: 'tenant-2',
      clipUrl: '/uploads/watch/tenant-1/clip.mp4',
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

