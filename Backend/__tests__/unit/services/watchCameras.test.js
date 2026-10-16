jest.mock('../../../models', () => ({
  VisionEvent: {},
  VisionIncident: {},
  VisionCamera: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Sale: {},
}));

const { VisionCamera } = require('../../../models');
const { listCameras, upsertCamera } = require('../../../services/watchReconciliationService');

describe('Watch cameras', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists cameras without snapshot images', async () => {
    VisionCamera.findAll.mockResolvedValue([
      { toJSON: () => ({ id: 'c1', name: 'Counter', metadata: { localId: 'cam-1', snapshot: { dataUrl: 'data:image/jpeg;base64,AAAA', capturedAt: '2026-10-12T09:00:00.000Z' } } }) },
    ]);
    const result = await listCameras({ tenantId: 't1' });
    expect(result.data[0].metadata).toEqual({ localId: 'cam-1', snapshot: { capturedAt: '2026-10-12T09:00:00.000Z' } });
  });

  it('keeps the agent link, snapshot and stream address when the owner saves zones', async () => {
    const existing = {
      id: 'c1',
      shopId: 's1',
      deviceId: 'device-1',
      streamUrl: 'rtsp://10.0.0.5/stream',
      metadata: { localId: 'cam-1', snapshot: { dataUrl: 'data:...', capturedAt: 'x' } },
      update: jest.fn(async function update(values) { Object.assign(this, values); }),
      toJSON() { return { id: this.id, deviceId: this.deviceId, metadata: this.metadata }; },
    };
    VisionCamera.findOne.mockResolvedValue(existing);

    const result = await upsertCamera({
      tenantId: 't1',
      cameraId: 'c1',
      payload: { name: 'Counter', role: 'counter', zones: [{ type: 'counter', x: 0.1, y: 0.1, w: 0.3, h: 0.3 }], metadata: { localId: 'hijack', note: 'till 1' } },
      userId: 'u1',
    });

    expect(result.success).toBe(true);
    const values = existing.update.mock.calls[0][0];
    expect(values.deviceId).toBe('device-1');
    expect(values.streamUrl).toBe('rtsp://10.0.0.5/stream');
    expect(values.metadata).toMatchObject({ localId: 'cam-1', note: 'till 1', updatedBy: 'u1' });
    expect(values.metadata.snapshot).toEqual({ dataUrl: 'data:...', capturedAt: 'x' });
    expect(values.zones).toHaveLength(1);
  });

  it('stores new stream addresses without the camera login', async () => {
    VisionCamera.create.mockImplementation(async (values) => ({ ...values, toJSON: () => values }));
    await upsertCamera({ tenantId: 't1', payload: { name: 'Door', streamUrl: 'rtsp://admin:pw@10.0.0.6/stream' } });
    expect(VisionCamera.create.mock.calls[0][0].streamUrl).toBe('rtsp://10.0.0.6/stream');
  });
});
