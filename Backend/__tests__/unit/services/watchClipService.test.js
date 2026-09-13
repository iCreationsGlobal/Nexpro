jest.mock('../../../models', () => ({
  VisionIncident: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../../middleware/upload', () => ({
  baseUploadDir: '/tmp/watch-uploads',
  ensureDirExists: jest.fn(),
}));

const fs = require('fs');
const { VisionIncident } = require('../../../models');
const { isAllowedWatchClip, saveWatchClip, attachIncidentClip } = require('../../../services/watchClipService');

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
}));

describe('watchClipService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-video files and oversized clips', () => {
    expect(isAllowedWatchClip({ mimetype: 'image/png', originalname: 'shot.png' })).toBe(false);
    expect(isAllowedWatchClip({ mimetype: 'video/mp4', originalname: 'clip.mp4' })).toBe(true);
    expect(isAllowedWatchClip({ mimetype: 'application/octet-stream', originalname: 'clip.webm' })).toBe(true);
  });

  it('saves a short MP4 under uploads/watch/{tenantId}', async () => {
    const result = await saveWatchClip({
      tenantId: 'tenant-1',
      file: {
        originalname: 'counter.mp4',
        mimetype: 'video/mp4',
        size: 1024,
        buffer: Buffer.from('fake-mp4'),
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.clipUrl).toMatch(/^\/uploads\/watch\/tenant-1\/\d+-counter\.mp4$/);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('rejects a missing or invalid file on save', async () => {
    expect((await saveWatchClip({ tenantId: 'tenant-1' })).success).toBe(false);
    expect((await saveWatchClip({
      tenantId: 'tenant-1',
      file: { originalname: 'notes.pdf', mimetype: 'application/pdf', size: 10, buffer: Buffer.from('x') },
    })).error).toMatch(/MP4 or WebM/);
    expect((await saveWatchClip({
      tenantId: 'tenant-1',
      file: { originalname: 'huge.mp4', mimetype: 'video/mp4', size: 40 * 1024 * 1024, buffer: Buffer.from('x') },
    })).error).toMatch(/too large/);
  });

  it('attaches a persistable clipReference to an incident', async () => {
    const incident = {
      id: 'inc-1',
      kind: 'unmatched_interaction',
      toJSON() { return { id: this.id, kind: this.kind, clipReference: this.clipReference }; },
      update: jest.fn().mockImplementation(async (payload) => Object.assign(incident, payload)),
    };
    VisionIncident.findOne.mockResolvedValue(incident);

    const result = await attachIncidentClip({
      tenantId: 'tenant-1',
      incidentId: 'inc-1',
      clipReference: '/uploads/watch/tenant-1/1-clip.mp4',
    });

    expect(result.success).toBe(true);
    expect(incident.update).toHaveBeenCalledWith({ clipReference: '/uploads/watch/tenant-1/1-clip.mp4' });
  });

  it('rejects attaching a local path', async () => {
    const result = await attachIncidentClip({
      tenantId: 'tenant-1',
      incidentId: 'inc-1',
      clipReference: '/Users/us/clip.mp4',
    });
    expect(result.success).toBe(false);
    expect(VisionIncident.findOne).not.toHaveBeenCalled();
  });
});
