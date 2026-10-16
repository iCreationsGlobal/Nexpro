jest.mock('../../../models', () => ({
  WatchDevice: {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  VisionCamera: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    max: jest.fn(),
  },
}));

jest.mock('../../../services/watchClipStorage', () => ({
  clipUploadMode: jest.fn(() => 'direct'),
}));

const crypto = require('crypto');
const { WatchDevice, VisionCamera } = require('../../../models');
const {
  authenticateDeviceKey,
  createPairing,
  generatePairingCode,
  getAgentConfig,
  normalizePairingCode,
  pairDevice,
  recordHeartbeat,
  registerAgentCamera,
  saveCameraSnapshot,
  serializeDevice,
} = require('../../../services/watchDeviceService');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const DEVICE_ID = '11111111-2222-4333-8444-555555555555';
const CAMERA_ID = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64');

describe('watchDeviceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pairing codes', () => {
    it('are 8 unambiguous characters shown as XXXX-XXXX', () => {
      for (let i = 0; i < 50; i += 1) {
        expect(generatePairingCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      }
    });

    it('ignore case, spaces and the dash when typed', () => {
      expect(normalizePairingCode(' k7p2-9qxm ')).toBe('K7P29QXM');
    });

    it('store only a hash of the code, valid for 15 minutes', async () => {
      WatchDevice.findOne.mockResolvedValue(null);
      WatchDevice.create.mockImplementation(async (values) => ({ id: DEVICE_ID, ...values }));

      const before = Date.now();
      const result = await createPairing({ tenantId: 't1', shopId: 's1', name: ' Front till ', userId: 'u1' });

      expect(result.success).toBe(true);
      const created = WatchDevice.create.mock.calls[0][0];
      expect(created).toMatchObject({ tenantId: 't1', shopId: 's1', name: 'Front till', status: 'pending', createdBy: 'u1' });
      expect(created.pairingCodeHash).toBe(sha256(normalizePairingCode(result.data.pairingCode)));
      expect(JSON.stringify(created)).not.toContain(result.data.pairingCode);
      const ttl = created.pairingExpiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(14 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    });
  });

  describe('pairDevice', () => {
    const pending = { id: DEVICE_ID, tenantId: 't1', shopId: 's1', name: 'Front till' };

    it('rejects codes of the wrong length without a lookup', async () => {
      const result = await pairDevice({ code: 'ABC' });
      expect(result).toMatchObject({ success: false, status: 400 });
      expect(WatchDevice.findOne).not.toHaveBeenCalled();
    });

    it('rejects wrong or expired codes', async () => {
      WatchDevice.findOne.mockResolvedValue(null);
      const result = await pairDevice({ code: 'K7P2-9QXM' });
      expect(result).toMatchObject({ success: false, status: 404 });
      expect(WatchDevice.findOne.mock.calls[0][0].where.pairingCodeHash).toBe(sha256('K7P29QXM'));
    });

    it('returns a device key once and stores only its hash', async () => {
      WatchDevice.findOne.mockResolvedValue(pending);
      WatchDevice.update.mockResolvedValue([1]);

      const result = await pairDevice({ code: 'k7p2 9qxm', agentVersion: '0.2.0', platform: 'darwin' });

      expect(result.success).toBe(true);
      const [deviceId, secret] = result.data.deviceKey.split('.');
      expect(deviceId).toBe(DEVICE_ID);
      const [values, options] = WatchDevice.update.mock.calls[0];
      expect(values).toMatchObject({ status: 'active', keyHash: sha256(secret), pairingCodeHash: null });
      expect(options.where).toEqual({ id: DEVICE_ID, status: 'pending' });
      expect(result.data).toMatchObject({ tenantId: 't1', shopId: 's1', deviceName: 'Front till' });
    });

    it('lets only one agent win when two race with the same code', async () => {
      WatchDevice.findOne.mockResolvedValue(pending);
      WatchDevice.update.mockResolvedValue([0]);
      const result = await pairDevice({ code: 'K7P29QXM' });
      expect(result).toMatchObject({ success: false, status: 409 });
    });
  });

  describe('authenticateDeviceKey', () => {
    const secret = 'a'.repeat(43);

    it('accepts the right key for an active device', async () => {
      const device = { id: DEVICE_ID, status: 'active', keyHash: sha256(secret) };
      WatchDevice.findByPk.mockResolvedValue(device);
      await expect(authenticateDeviceKey(`${DEVICE_ID}.${secret}`)).resolves.toBe(device);
    });

    it('refuses a wrong secret or a revoked device', async () => {
      WatchDevice.findByPk.mockResolvedValue({ id: DEVICE_ID, status: 'active', keyHash: sha256(secret) });
      await expect(authenticateDeviceKey(`${DEVICE_ID}.${'b'.repeat(43)}`)).resolves.toBeNull();

      WatchDevice.findByPk.mockResolvedValue({ id: DEVICE_ID, status: 'revoked', keyHash: null });
      await expect(authenticateDeviceKey(`${DEVICE_ID}.${secret}`)).resolves.toBeNull();
    });

    it('refuses malformed keys without a lookup', async () => {
      await expect(authenticateDeviceKey('not-a-key')).resolves.toBeNull();
      await expect(authenticateDeviceKey(`${DEVICE_ID}.short`)).resolves.toBeNull();
      expect(WatchDevice.findByPk).not.toHaveBeenCalled();
    });
  });

  describe('serializeDevice', () => {
    it('never exposes hashes and reports online from the last heartbeat', () => {
      const now = Date.now();
      const device = {
        id: DEVICE_ID,
        name: 'Till PC',
        status: 'active',
        keyHash: 'secret-hash',
        pairingCodeHash: 'code-hash',
        lastSeenAt: new Date(now - 60 * 1000),
        health: { cameras: [{ cameraId: CAMERA_ID, online: true }] },
      };
      const out = serializeDevice(device, now);
      expect(out.online).toBe(true);
      expect(JSON.stringify(out)).not.toMatch(/hash/i);
      expect(serializeDevice({ ...device, lastSeenAt: new Date(now - 10 * 60 * 1000) }, now).online).toBe(false);
    });
  });

  describe('recordHeartbeat', () => {
    it('keeps status only for this device\'s cameras, with bounded values', async () => {
      VisionCamera.findAll.mockResolvedValue([{ id: CAMERA_ID }]);
      VisionCamera.max.mockResolvedValue(new Date('2026-10-12T10:00:00Z'));
      const device = { id: DEVICE_ID, tenantId: 't1', update: jest.fn().mockResolvedValue(undefined) };

      const result = await recordHeartbeat({
        device,
        agentVersion: '0.2.0',
        cameras: [
          { cameraId: CAMERA_ID, online: true, fps: 999, detectFps: 4.26, error: 'x'.repeat(500) },
          { cameraId: 'someone-elses-camera', online: true },
        ],
      });

      const health = device.update.mock.calls[0][0].health;
      expect(health.cameras).toHaveLength(1);
      expect(health.cameras[0]).toMatchObject({ cameraId: CAMERA_ID, online: true, fps: 120, detectFps: 4.3 });
      expect(health.cameras[0].error).toHaveLength(200);
      expect(result.data.configVersion).toBe('2026-10-12T10:00:00.000Z');
    });
  });

  describe('registerAgentCamera', () => {
    const device = { id: DEVICE_ID, tenantId: 't1', shopId: 's1' };

    beforeEach(() => {
      VisionCamera.findAll.mockResolvedValue([]);
      WatchDevice.findAll.mockResolvedValue([]);
    });

    it('creates the camera linked to the device, with no stream address', async () => {
      VisionCamera.findOne.mockResolvedValue(null);
      VisionCamera.create.mockImplementation(async (values) => ({ id: CAMERA_ID, ...values }));

      const result = await registerAgentCamera({ device, localId: 'cam-1', name: 'Counter', role: 'counter' });

      expect(result.success).toBe(true);
      expect(VisionCamera.create.mock.calls[0][0]).toMatchObject({
        tenantId: 't1', shopId: 's1', deviceId: DEVICE_ID, name: 'Counter', role: 'counter',
        metadata: { localId: 'cam-1', addedFromAgent: true },
      });
      expect(VisionCamera.create.mock.calls[0][0].streamUrl).toBeUndefined();
    });

    it('returns the existing camera without overwriting the owner\'s edits', async () => {
      const existing = { id: CAMERA_ID, name: 'Renamed in ABS', role: 'entrance', zones: [{ x: 0 }], isActive: true, metadata: { localId: 'cam-1' } };
      VisionCamera.findOne.mockResolvedValue(existing);

      const result = await registerAgentCamera({ device, localId: 'cam-1', name: 'Counter', role: 'counter' });

      expect(VisionCamera.create).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ id: CAMERA_ID, name: 'Renamed in ABS', role: 'entrance', localId: 'cam-1' });
    });

    it('carries on with the camera of a removed device when the same computer pairs again', async () => {
      VisionCamera.findOne.mockResolvedValue(null);
      const old = {
        id: CAMERA_ID,
        name: 'Counter',
        role: 'counter',
        zones: [{ type: 'counter', x: 0.6, y: 0.5, w: 0.3, h: 0.4 }],
        isActive: false,
        deviceId: 'removed-device',
        shopId: 's1',
        metadata: { localId: 'cam-1' },
        update: jest.fn(async function update(values) { Object.assign(this, values); }),
      };
      VisionCamera.findAll.mockResolvedValue([old]);
      WatchDevice.findAll.mockResolvedValue([{ id: 'removed-device', status: 'revoked' }]);

      const result = await registerAgentCamera({ device, localId: 'cam-1', name: 'Counter', role: 'counter' });

      expect(old.update).toHaveBeenCalledWith({ deviceId: DEVICE_ID, isActive: true, shopId: 's1' });
      expect(VisionCamera.create).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ id: CAMERA_ID, zones: old.zones, isActive: true });
    });

    it('never takes over a camera another paired device is watching', async () => {
      VisionCamera.findOne.mockResolvedValue(null);
      const watched = { id: CAMERA_ID, deviceId: 'other-device', metadata: { localId: 'cam-1' }, update: jest.fn() };
      VisionCamera.findAll.mockResolvedValue([watched]);
      WatchDevice.findAll.mockResolvedValue([{ id: 'other-device', status: 'active' }]);
      VisionCamera.create.mockImplementation(async (values) => ({ id: 'new-camera', ...values }));

      const result = await registerAgentCamera({ device, localId: 'cam-1', name: 'Counter', role: 'counter' });

      expect(watched.update).not.toHaveBeenCalled();
      expect(result.data.id).toBe('new-camera');
    });

    it('requires a camera id and name', async () => {
      await expect(registerAgentCamera({ device, localId: '', name: 'X' })).resolves.toMatchObject({ status: 400 });
      await expect(registerAgentCamera({ device, localId: 'cam-1', name: ' ' })).resolves.toMatchObject({ status: 400 });
    });
  });

  describe('saveCameraSnapshot', () => {
    const device = { id: DEVICE_ID, tenantId: 't1' };

    it('stores a JPEG still and keeps the camera\'s other metadata', async () => {
      const camera = {
        id: CAMERA_ID,
        metadata: { localId: 'cam-1' },
        update: jest.fn(async function update(values) { this.metadata = values.metadata; }),
      };
      VisionCamera.findOne.mockResolvedValue(camera);

      const result = await saveCameraSnapshot({ device, cameraId: CAMERA_ID, imageBase64: JPEG, capturedAt: '2026-10-12T09:00:00Z' });

      expect(result.success).toBe(true);
      expect(camera.metadata.localId).toBe('cam-1');
      expect(camera.metadata.snapshot.dataUrl).toBe(`data:image/jpeg;base64,${JPEG}`);
      expect(camera.metadata.snapshot.capturedAt).toBe('2026-10-12T09:00:00.000Z');
      // A new still must not look like a config change to the agent
      expect(camera.update).toHaveBeenCalledWith(expect.any(Object), { silent: true });
    });

    it('refuses non-JPEG data, oversized images and other devices\' cameras', async () => {
      VisionCamera.findOne.mockResolvedValue({ id: CAMERA_ID, metadata: {}, update: jest.fn() });
      await expect(saveCameraSnapshot({ device, cameraId: CAMERA_ID, imageBase64: Buffer.from('png').toString('base64') }))
        .resolves.toMatchObject({ status: 400 });

      const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(700 * 1024)]).toString('base64');
      await expect(saveCameraSnapshot({ device, cameraId: CAMERA_ID, imageBase64: huge })).resolves.toMatchObject({ status: 413 });

      VisionCamera.findOne.mockResolvedValue(null);
      await expect(saveCameraSnapshot({ device, cameraId: CAMERA_ID, imageBase64: JPEG })).resolves.toMatchObject({ status: 404 });
    });
  });

  describe('getAgentConfig', () => {
    it('sends cameras with zones and the run settings, never stream addresses', async () => {
      VisionCamera.findAll.mockResolvedValue([
        { id: CAMERA_ID, name: 'Counter', role: 'counter', zones: [{ type: 'counter' }], isActive: true, streamUrl: 'rtsp://cam', metadata: { localId: 'cam-1' } },
      ]);
      VisionCamera.max.mockResolvedValue(null);

      const result = await getAgentConfig({ id: DEVICE_ID, tenantId: 't1', name: 'Till PC' });

      expect(result.data.cameras[0]).toEqual({ id: CAMERA_ID, name: 'Counter', role: 'counter', zones: [{ type: 'counter' }], isActive: true, localId: 'cam-1' });
      expect(result.data.settings).toMatchObject({ sampleFps: 5, heartbeatSeconds: 60, clipUploads: 'direct' });
    });
  });
});
