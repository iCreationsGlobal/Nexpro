jest.mock('../../../models', () => ({
  VisionEvent: {
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
    count: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  VisionIncident: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  VisionCamera: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Sale: {
    findAll: jest.fn(),
    count: jest.fn(),
  },
}));

const { Op } = require('sequelize');
const { VisionEvent, VisionIncident, Sale, VisionCamera } = require('../../../models');
const {
  ingestEvents,
  reconcilePeriod,
  reviewIncident,
  getSummary,
  normalizeIncomingEvent,
  upsertCamera,
  countUniqueVisitorPeople,
} = require('../../../services/watchReconciliationService');
const { INCIDENT_KINDS, INCIDENT_STATUSES } = require('../../../config/watchConstants');

describe('watchReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes edge and snake_case event payloads', () => {
    const event = normalizeIncomingEvent({
      event_type: 'counter_interaction',
      timestamp: '2026-08-30T10:35:03.000Z',
      track_id: 'track_384',
      event_id: 'evt-1',
      confidence: 0.86,
    });
    expect(event.eventType).toBe('counter_interaction');
    expect(event.trackId).toBe('track_384');
    expect(event.clientEventId).toBe('evt-1');
    expect(event.startedAt.toISOString()).toBe('2026-08-30T10:35:03.000Z');
  });

  it('creates an unmatched incident when no sale is nearby', async () => {
    const event = {
      id: 'event-1',
      eventType: 'counter_interaction',
      startedAt: new Date('2026-08-30T10:35:03.000Z'),
      endedAt: new Date('2026-08-30T10:36:00.000Z'),
      trackId: 'track_1',
      shopId: 'shop-1',
      confidence: 0.8,
      clipReference: '/uploads/watch/tenant-1/clip.mp4',
    };
    VisionEvent.findAll.mockResolvedValue([event]);
    Sale.findAll.mockResolvedValue([]);
    VisionIncident.findAll.mockResolvedValue([]);
    VisionIncident.create.mockImplementation(async (payload) => ({ id: 'inc-1', ...payload }));

    const result = await reconcilePeriod({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      startAt: new Date('2026-08-30T10:00:00.000Z'),
      endAt: new Date('2026-08-30T11:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(VisionIncident.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: INCIDENT_KINDS.UNMATCHED_INTERACTION,
      eventId: 'event-1',
      saleId: null,
      status: INCIDENT_STATUSES.PENDING,
      clipReference: '/uploads/watch/tenant-1/clip.mp4',
    }));
  });

  it('does not open unmatched review for a zone-enter without till linger', async () => {
    VisionEvent.findAll.mockResolvedValue([{
      id: 'event-zone',
      eventType: 'person_entered_counter_zone',
      startedAt: new Date('2026-08-30T10:35:03.000Z'),
      trackId: 'track_1',
      shopId: 'shop-1',
      confidence: 0.8,
    }]);
    Sale.findAll.mockResolvedValue([]);
    VisionIncident.findAll.mockResolvedValue([]);
    VisionIncident.create.mockResolvedValue({});

    const result = await reconcilePeriod({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      startAt: new Date('2026-08-30T10:00:00.000Z'),
      endAt: new Date('2026-08-30T11:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(VisionIncident.create).not.toHaveBeenCalled();
    expect(VisionEvent.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventType: { [Op.in]: ['counter_interaction'] },
      }),
    }));
  });

  it('matches a nearby sale and flags a leftover sale as a camera miss', async () => {
    const event = {
      id: 'event-1',
      eventType: 'counter_interaction',
      startedAt: new Date('2026-08-30T10:35:03.000Z'),
      endedAt: null,
      trackId: 'track_1',
      shopId: 'shop-1',
      confidence: 0.9,
      clipReference: null,
    };
    VisionEvent.findAll.mockResolvedValue([event]);
    Sale.findAll.mockResolvedValue([
      { id: 'sale-1', createdAt: new Date('2026-08-30T10:35:07.000Z'), status: 'completed', shopId: 'shop-1' },
      { id: 'sale-2', createdAt: new Date('2026-08-30T10:50:00.000Z'), status: 'completed', shopId: 'shop-1' },
    ]);
    VisionIncident.findAll.mockResolvedValue([]);
    VisionIncident.create.mockImplementation(async (payload) => ({ id: `inc-${payload.kind}`, ...payload }));

    const result = await reconcilePeriod({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      startAt: new Date('2026-08-30T10:00:00.000Z'),
      endAt: new Date('2026-08-30T11:00:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(VisionIncident.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: INCIDENT_KINDS.MATCHED,
      eventId: 'event-1',
      saleId: 'sale-1',
    }));
    expect(VisionIncident.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: INCIDENT_KINDS.SALE_WITHOUT_EVENT,
      saleId: 'sale-2',
      eventId: null,
    }));
  });

  it('upgrades a pending unmatched incident when a late sale syncs', async () => {
    const event = {
      id: 'event-1',
      eventType: 'counter_interaction',
      startedAt: new Date('2026-08-30T10:35:03.000Z'),
      shopId: 'shop-1',
      confidence: 0.8,
    };
    const existing = {
      id: 'inc-1',
      eventId: 'event-1',
      kind: INCIDENT_KINDS.UNMATCHED_INTERACTION,
      saleId: null,
      status: INCIDENT_STATUSES.PENDING,
      metadata: {},
      update: jest.fn().mockResolvedValue(undefined),
    };
    VisionEvent.findAll.mockResolvedValue([event]);
    Sale.findAll.mockResolvedValue([
      { id: 'sale-late', createdAt: new Date('2026-08-30T10:37:00.000Z'), status: 'completed', shopId: 'shop-1' },
    ]);
    VisionIncident.findAll.mockResolvedValue([existing]);

    await reconcilePeriod({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      startAt: new Date('2026-08-30T10:00:00.000Z'),
      endAt: new Date('2026-08-30T11:00:00.000Z'),
    });

    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
      kind: INCIDENT_KINDS.MATCHED,
      saleId: 'sale-late',
      status: INCIDENT_STATUSES.PENDING,
    }));
  });

  it('skips duplicate client event ids on ingest', async () => {
    VisionEvent.findAll
      .mockResolvedValueOnce([{ id: 'existing', clientEventId: 'evt-1' }])
      .mockResolvedValueOnce([]);
    Sale.findAll.mockResolvedValue([]);
    VisionIncident.findAll.mockResolvedValue([]);
    VisionEvent.bulkCreate.mockResolvedValue([]);

    const result = await ingestEvents({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      events: [{
        eventType: 'counter_interaction',
        startedAt: '2026-08-30T10:35:03.000Z',
        clientEventId: 'evt-1',
      }],
    });

    expect(result.success).toBe(true);
    expect(result.data.created).toBe(0);
    expect(result.data.skipped).toBe(1);
    expect(VisionEvent.bulkCreate).not.toHaveBeenCalled();
  });

  it('applies a batch clipReference to events that do not already have one', async () => {
    VisionEvent.findAll.mockResolvedValue([]);
    Sale.findAll.mockResolvedValue([]);
    VisionIncident.findAll.mockResolvedValue([]);
    VisionEvent.bulkCreate.mockResolvedValue([{ id: 'event-1' }]);
    VisionIncident.create.mockImplementation(async (payload) => ({ id: 'inc-1', ...payload }));

    await ingestEvents({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      clipReference: '/uploads/watch/tenant-1/counter.mp4',
      events: [{
        eventType: 'counter_interaction',
        startedAt: '2026-08-30T10:35:03.000Z',
        clientEventId: 'evt-batch',
        clipReference: 'youtube:jNItxZoc2pg',
      }, {
        eventType: 'counter_interaction',
        startedAt: '2026-08-30T10:36:03.000Z',
        clientEventId: 'evt-plain',
      }],
    });

    expect(VisionEvent.bulkCreate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        clientEventId: 'evt-batch',
        clipReference: 'youtube:jNItxZoc2pg',
      }),
      expect.objectContaining({
        clientEventId: 'evt-plain',
        clipReference: '/uploads/watch/tenant-1/counter.mp4',
      }),
    ]));
  });

  it('records owner review without accusation language', async () => {
    const incident = {
      id: 'inc-1',
      kind: INCIDENT_KINDS.UNMATCHED_INTERACTION,
      toJSON() {
        return { id: this.id, kind: this.kind, status: this.status, reviewNote: this.reviewNote };
      },
      update: jest.fn().mockImplementation(async (payload) => Object.assign(incident, payload)),
    };
    VisionIncident.findOne.mockResolvedValue(incident);

    const result = await reviewIncident({
      tenantId: 'tenant-1',
      incidentId: 'inc-1',
      userId: 'user-1',
      decision: 'confirm',
      note: 'Reviewed clip',
    });

    expect(result.success).toBe(true);
    expect(result.data.copy).toMatch(/Review required/);
    expect(result.data.copy).not.toMatch(/stole/i);
    expect(incident.update).toHaveBeenCalledWith(expect.objectContaining({
      status: INCIDENT_STATUSES.CONFIRMED,
      reviewedBy: 'user-1',
    }));
  });

  it('persists a sanitized camera stream URL', async () => {
    VisionCamera.create.mockResolvedValue({
      id: 'cam-1',
      streamUrl: 'rtsp://192.168.1.20/stream',
    });

    const result = await upsertCamera({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      payload: {
        name: 'Counter camera',
        role: 'counter',
        streamUrl: 'rtsp://192.168.1.20/stream',
      },
    });

    expect(result.success).toBe(true);
    expect(VisionCamera.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      name: 'Counter camera',
      streamUrl: 'rtsp://192.168.1.20/stream',
    }));
  });

  it('rejects a non-camera stream URL', async () => {
    const result = await upsertCamera({
      tenantId: 'tenant-1',
      payload: { name: 'Counter camera', streamUrl: 'javascript:alert(1)' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rtsp/i);
    expect(VisionCamera.create).not.toHaveBeenCalled();
  });

  it('ingests event JSON only and drops video bytes', async () => {
    VisionEvent.findAll.mockResolvedValue([]);
    Sale.findAll.mockResolvedValue([]);
    VisionIncident.findAll.mockResolvedValue([]);
    VisionEvent.bulkCreate.mockResolvedValue([{ id: 'event-1' }]);
    VisionIncident.create.mockImplementation(async (payload) => ({ id: 'inc-1', ...payload }));

    await ingestEvents({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      events: [{
        eventType: 'counter_interaction',
        startedAt: '2026-08-30T10:35:03.000Z',
        clientEventId: 'evt-video',
        video: 'AAAA',
        videoBytes: 'BBBB',
        frames: [{ image: 'CCCC' }],
        attributes: { dwell_seconds: 3, videoBytes: 'DDDD' },
      }],
    });

    const created = VisionEvent.bulkCreate.mock.calls[0][0][0];
    expect(created).not.toHaveProperty('video');
    expect(created).not.toHaveProperty('videoBytes');
    expect(created).not.toHaveProperty('frames');
    expect(created.attributes).toEqual({ dwell_seconds: 3 });
    expect(JSON.stringify(created)).not.toMatch(/AAAA|BBBB|CCCC|DDDD/);
  });

  it('counts unique (clipReference, trackId) visitors, not every person_entered', async () => {
    expect(countUniqueVisitorPeople([
      { clipReference: '/uploads/watch/t/a.mp4', trackId: '1' },
      { clipReference: '/uploads/watch/t/a.mp4', trackId: '1' },
      { clipReference: '/uploads/watch/t/b.mp4', trackId: '1' },
      { clipReference: null, trackId: '7' },
      { clipReference: null, trackId: '7' },
    ])).toBe(3);

    VisionEvent.findAll.mockResolvedValue([
      { clipReference: '/uploads/watch/t/a.mp4', trackId: '1' },
      { clipReference: '/uploads/watch/t/a.mp4', trackId: '1' },
      { clipReference: '/uploads/watch/t/b.mp4', trackId: '1' },
    ]);
    VisionEvent.count.mockResolvedValue(1);
    Sale.count.mockResolvedValue(0);
    VisionIncident.findAll.mockResolvedValue([]);

    const result = await getSummary({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      startAt: new Date('2026-09-01T00:00:00.000Z'),
      endAt: new Date('2026-09-01T23:59:59.000Z'),
    });

    expect(result.data.visitors).toBe(2);
    expect(result.data.counterInteractions).toBe(1);
    expect(VisionEvent.findAll).toHaveBeenCalledWith(expect.objectContaining({
      attributes: ['clipReference', 'trackId'],
    }));
    expect(VisionEvent.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventType: { [Op.in]: ['counter_interaction'] },
      }),
    }));
  });
});
