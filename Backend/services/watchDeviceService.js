const crypto = require('crypto');
const { Op } = require('sequelize');
const { WatchDevice, VisionCamera } = require('../models');
const { clipUploadMode } = require('./watchClipStorage');

/**
 * ABS Watch agents: pairing, device keys, heartbeats and the config an agent pulls.
 *
 * Pairing: an owner creates a pending device and types its one-time code into the agent, which
 * gets back a device key (`<deviceId>.<secret>`). Only SHA-256 hashes of the code and secret are
 * stored. Camera logins stay on the agent; the cloud keeps camera names, roles, zones and a
 * snapshot for drawing zones.
 */

const PAIRING_CODE_TTL_MINUTES = 15;
const PAIRING_CODE_LENGTH = 8;
/** No 0/O/1/I/L so a code survives being read off a screen and typed on a shop PC. */
const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Heartbeats come every minute; three missed ones and the device shows as offline. */
const DEVICE_ONLINE_WINDOW_MS = 3 * 60 * 1000;
const SNAPSHOT_MAX_BYTES = 600 * 1024;
const MAX_HEALTH_CAMERAS = 32;
const CAMERA_ROLES = ['counter', 'entrance', 'floor', 'exit'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Defaults an agent runs with; zones come per camera. */
const AGENT_SETTINGS = {
  sampleFps: 5,
  windowSeconds: 20,
  dwellSeconds: 6,
  matchWindowMinutes: 5,
  heartbeatSeconds: 60,
  snapshotIntervalMinutes: 15,
  clipLeadInSeconds: 3,
  clipMaxSeconds: 15,
};

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** What the owner typed, ignoring case, spaces and the dash. */
const normalizePairingCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const generatePairingCode = () => {
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    code += PAIRING_ALPHABET[crypto.randomInt(PAIRING_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

const isDeviceOnline = (device, now = Date.now()) =>
  device.status === 'active'
  && Boolean(device.lastSeenAt)
  && now - new Date(device.lastSeenAt).getTime() <= DEVICE_ONLINE_WINDOW_MS;

/** Never exposes the pairing-code or key hashes. */
const serializeDevice = (device, now = Date.now()) => ({
  id: device.id,
  name: device.name,
  status: device.status,
  shopId: device.shopId || null,
  online: isDeviceOnline(device, now),
  lastSeenAt: device.lastSeenAt || null,
  pairedAt: device.pairedAt || null,
  pairingExpiresAt: device.status === 'pending' ? device.pairingExpiresAt : null,
  agentVersion: device.agentVersion || null,
  platform: device.platform || null,
  cameras: Array.isArray(device.health?.cameras) ? device.health.cameras : [],
  createdAt: device.createdAt,
});

/**
 * Start pairing: a pending device and a one-time code shown once to the owner.
 * @param {{ tenantId: string, shopId?: string|null, name?: string, userId?: string|null }} args
 */
const createPairing = async ({ tenantId, shopId = null, name, userId = null } = {}) => {
  const label = String(name || '').trim().slice(0, 120) || 'Watch agent';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pairingCode = generatePairingCode();
    const pairingCodeHash = sha256(normalizePairingCode(pairingCode));
    // eslint-disable-next-line no-await-in-loop
    const clash = await WatchDevice.findOne({
      where: { status: 'pending', pairingCodeHash, pairingExpiresAt: { [Op.gt]: new Date() } },
      attributes: ['id'],
    });
    if (clash) continue;
    // eslint-disable-next-line no-await-in-loop
    const device = await WatchDevice.create({
      tenantId,
      shopId,
      name: label,
      status: 'pending',
      pairingCodeHash,
      pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60 * 1000),
      createdBy: userId,
    });
    return { success: true, data: { device: serializeDevice(device), pairingCode, expiresAt: device.pairingExpiresAt } };
  }
  return { success: false, error: 'Could not create a pairing code. Try again.' };
};

/**
 * The agent exchanges a pairing code for its device key (returned once).
 * @param {{ code: string, agentVersion?: string, platform?: string }} args
 */
const pairDevice = async ({ code, agentVersion, platform } = {}) => {
  const normalized = normalizePairingCode(code);
  if (normalized.length !== PAIRING_CODE_LENGTH) {
    return { success: false, status: 400, error: 'Enter the 8-character pairing code shown in ABS Watch.' };
  }
  const device = await WatchDevice.findOne({
    where: { status: 'pending', pairingCodeHash: sha256(normalized), pairingExpiresAt: { [Op.gt]: new Date() } },
  });
  if (!device) {
    return { success: false, status: 404, error: 'That pairing code is wrong or has expired. Create a new one in ABS Watch.' };
  }

  const secret = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  // Conditional update: if two agents race with the same code, only one gets a working key
  const [updated] = await WatchDevice.update({
    status: 'active',
    keyHash: sha256(secret),
    pairingCodeHash: null,
    pairingExpiresAt: null,
    pairedAt: now,
    lastSeenAt: now,
    agentVersion: agentVersion ? String(agentVersion).slice(0, 40) : null,
    platform: platform ? String(platform).slice(0, 60) : null,
  }, { where: { id: device.id, status: 'pending' } });
  if (updated !== 1) {
    return { success: false, status: 409, error: 'This pairing code was just used. Create a new one in ABS Watch.' };
  }

  return {
    success: true,
    data: {
      deviceId: device.id,
      deviceKey: `${device.id}.${secret}`,
      deviceName: device.name,
      tenantId: device.tenantId,
      shopId: device.shopId || null,
    },
  };
};

const parseDeviceKey = (raw) => {
  const text = String(raw || '').trim();
  const dot = text.indexOf('.');
  if (dot < 1) return null;
  const id = text.slice(0, dot);
  const secret = text.slice(dot + 1);
  if (!UUID_PATTERN.test(id) || secret.length < 20) return null;
  return { id, secret };
};

/**
 * @param {string} rawKey `<deviceId>.<secret>`
 * @returns {Promise<object|null>} the active device, or null
 */
const authenticateDeviceKey = async (rawKey) => {
  const parsed = parseDeviceKey(rawKey);
  if (!parsed) return null;
  const device = await WatchDevice.findByPk(parsed.id);
  if (!device || device.status !== 'active' || !device.keyHash) return null;
  const supplied = Buffer.from(sha256(parsed.secret), 'hex');
  const expected = Buffer.from(device.keyHash, 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  return device;
};

const listDevices = async ({ tenantId, shopId = null } = {}) => {
  const rows = await WatchDevice.findAll({
    where: {
      tenantId,
      ...(shopId ? { shopId } : {}),
      [Op.or]: [
        { status: 'active' },
        { status: 'pending', pairingExpiresAt: { [Op.gt]: new Date() } },
      ],
    },
    order: [['createdAt', 'ASC']],
  });
  const now = Date.now();
  return { success: true, data: rows.map((row) => serializeDevice(row, now)) };
};

const revokeDevice = async ({ tenantId, deviceId } = {}) => {
  const device = await WatchDevice.findOne({ where: { id: deviceId, tenantId } });
  if (!device) return { success: false, status: 404, error: 'Watch device not found' };
  await device.update({
    status: 'revoked',
    keyHash: null,
    pairingCodeHash: null,
    pairingExpiresAt: null,
    revokedAt: new Date(),
  });
  // Its cameras stop showing as live; their events and incidents stay
  await VisionCamera.update({ isActive: false }, { where: { tenantId, deviceId: device.id } });
  return { success: true, data: serializeDevice(device) };
};

const deviceCameraWhere = (device) => ({ tenantId: device.tenantId, deviceId: device.id });

/** Latest camera change for this device, so the agent knows when to re-pull its config. */
const getConfigVersion = async (device) => {
  const latest = await VisionCamera.max('updatedAt', { where: deviceCameraWhere(device) });
  return latest ? new Date(latest).toISOString() : null;
};

const boundedRate = (value) => {
  const rate = Number(value);
  return value !== null && value !== undefined && Number.isFinite(rate)
    ? Math.round(Math.max(0, Math.min(rate, 120)) * 10) / 10
    : null;
};

const sanitizeCameraStatus = (raw, allowedIds) => {
  if (!raw || typeof raw !== 'object') return null;
  const cameraId = String(raw.cameraId || '');
  if (!allowedIds.has(cameraId)) return null;
  const lastFrameAt = raw.lastFrameAt ? new Date(raw.lastFrameAt) : null;
  return {
    cameraId,
    online: raw.online === true,
    fps: boundedRate(raw.fps),
    // Frames the agent actually analyses; far below `fps` means the computer is too slow
    detectFps: boundedRate(raw.detectFps),
    lastFrameAt: lastFrameAt && !Number.isNaN(lastFrameAt.getTime()) ? lastFrameAt.toISOString() : null,
    error: raw.error ? String(raw.error).slice(0, 200) : null,
  };
};

/**
 * @param {{ device: object, agentVersion?: string, platform?: string, cameras?: object[] }} args
 */
const recordHeartbeat = async ({ device, agentVersion, platform, cameras = [] } = {}) => {
  const ownCameras = await VisionCamera.findAll({ where: deviceCameraWhere(device), attributes: ['id'] });
  const allowedIds = new Set(ownCameras.map((row) => row.id));
  const statuses = (Array.isArray(cameras) ? cameras : [])
    .slice(0, MAX_HEALTH_CAMERAS)
    .map((raw) => sanitizeCameraStatus(raw, allowedIds))
    .filter(Boolean);

  await device.update({
    lastSeenAt: new Date(),
    agentVersion: agentVersion ? String(agentVersion).slice(0, 40) : device.agentVersion,
    platform: platform ? String(platform).slice(0, 60) : device.platform,
    health: { cameras: statuses, receivedAt: new Date().toISOString() },
  });
  return { success: true, data: { configVersion: await getConfigVersion(device) } };
};

const serializeAgentCamera = (camera) => ({
  id: camera.id,
  name: camera.name,
  role: camera.role,
  zones: Array.isArray(camera.zones) ? camera.zones : [],
  isActive: camera.isActive !== false,
  localId: camera.metadata?.localId || null,
});

/** Everything an agent needs: its cameras + zones and the run settings. */
const getAgentConfig = async (device) => {
  const cameras = await VisionCamera.findAll({ where: deviceCameraWhere(device), order: [['createdAt', 'ASC']] });
  return {
    success: true,
    data: {
      device: { id: device.id, name: device.name, shopId: device.shopId || null },
      cameras: cameras.map(serializeAgentCamera),
      settings: { ...AGENT_SETTINGS, clipUploads: clipUploadMode() },
      configVersion: await getConfigVersion(device),
    },
  };
};

/**
 * The agent registers a camera it can reach (the stream login stays on the agent). Idempotent per
 * agent-side id; after creation the owner's edits in ABS (name, role, zones) win.
 * @param {{ device: object, localId: string, name: string, role?: string }} args
 */
const registerAgentCamera = async ({ device, localId, name, role } = {}) => {
  const local = String(localId || '').trim();
  if (!local || local.length > 64) return { success: false, status: 400, error: 'Camera id from the agent is required' };
  const label = String(name || '').trim().slice(0, 120);
  if (!label) return { success: false, status: 400, error: 'Camera name is required' };
  const cameraRole = CAMERA_ROLES.includes(role) ? role : 'counter';

  const existing = await VisionCamera.findOne({
    where: { ...deviceCameraWhere(device), metadata: { localId: local } },
  });
  if (existing) {
    if (existing.isActive === false) await existing.update({ isActive: true });
    return { success: true, data: serializeAgentCamera(existing) };
  }

  // The same computer paired again after its old device was removed: carry on with its camera
  // (name, role, till zone and history) instead of starting a blank one
  const previous = (await VisionCamera.findAll({
    where: { tenantId: device.tenantId, metadata: { localId: local } },
    order: [['updatedAt', 'DESC']],
  })).filter((camera) => camera.deviceId !== device.id);
  if (previous.length) {
    const ownerIds = previous.map((camera) => camera.deviceId).filter(Boolean);
    const owners = ownerIds.length
      ? await WatchDevice.findAll({ where: { id: ownerIds, tenantId: device.tenantId }, attributes: ['id', 'status'] })
      : [];
    const stillPaired = new Set(owners.filter((owner) => owner.status !== 'revoked').map((owner) => owner.id));
    const orphan = previous.find((camera) => !camera.deviceId || !stillPaired.has(camera.deviceId));
    if (orphan) {
      await orphan.update({ deviceId: device.id, isActive: true, shopId: device.shopId || orphan.shopId });
      return { success: true, data: serializeAgentCamera(orphan) };
    }
  }

  const created = await VisionCamera.create({
    tenantId: device.tenantId,
    shopId: device.shopId || null,
    name: label,
    role: cameraRole,
    deviceId: device.id,
    zones: [],
    isActive: true,
    metadata: { localId: local, addedFromAgent: true },
  });
  return { success: true, status: 201, data: serializeAgentCamera(created) };
};

const findDeviceCamera = (device, cameraId) =>
  (UUID_PATTERN.test(String(cameraId || ''))
    ? VisionCamera.findOne({ where: { id: cameraId, ...deviceCameraWhere(device) } })
    : Promise.resolve(null));

/**
 * Store the latest still from a camera so the owner can draw zones on what the camera sees.
 * @param {{ device: object, cameraId: string, imageBase64: string, capturedAt?: string }} args
 */
const saveCameraSnapshot = async ({ device, cameraId, imageBase64, capturedAt } = {}) => {
  const camera = await findDeviceCamera(device, cameraId);
  if (!camera) return { success: false, status: 404, error: 'Camera not found for this Watch device' };

  const base64 = String(imageBase64 || '').replace(/^data:image\/jpeg;base64,/, '');
  const bytes = Buffer.from(base64, 'base64');
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg) return { success: false, status: 400, error: 'Snapshot must be a JPEG image' };
  if (bytes.length > SNAPSHOT_MAX_BYTES) return { success: false, status: 413, error: 'Snapshot is too large' };

  const taken = capturedAt ? new Date(capturedAt) : new Date();
  await camera.update({
    metadata: {
      ...(camera.metadata || {}),
      snapshot: {
        dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
        capturedAt: (Number.isNaN(taken.getTime()) ? new Date() : taken).toISOString(),
        bytes: bytes.length,
      },
    },
  }, {
    // updatedAt is the agent's config version; a new still isn't a config change
    silent: true,
  });
  return { success: true, data: { cameraId: camera.id, capturedAt: camera.metadata.snapshot.capturedAt } };
};

const getCameraSnapshot = async ({ tenantId, cameraId } = {}) => {
  if (!UUID_PATTERN.test(String(cameraId || ''))) return { success: false, status: 404, error: 'Camera not found' };
  const camera = await VisionCamera.findOne({ where: { id: cameraId, tenantId }, attributes: ['id', 'metadata'] });
  if (!camera) return { success: false, status: 404, error: 'Camera not found' };
  const snapshot = camera.metadata?.snapshot;
  if (!snapshot?.dataUrl) return { success: false, status: 404, error: 'No snapshot yet. Start the Watch agent with this camera.' };
  return { success: true, data: { dataUrl: snapshot.dataUrl, capturedAt: snapshot.capturedAt || null } };
};

module.exports = {
  AGENT_SETTINGS,
  DEVICE_ONLINE_WINDOW_MS,
  PAIRING_CODE_TTL_MINUTES,
  authenticateDeviceKey,
  createPairing,
  findDeviceCamera,
  generatePairingCode,
  getAgentConfig,
  getCameraSnapshot,
  isDeviceOnline,
  listDevices,
  normalizePairingCode,
  pairDevice,
  parseDeviceKey,
  recordHeartbeat,
  registerAgentCamera,
  revokeDevice,
  saveCameraSnapshot,
  serializeDevice,
};
