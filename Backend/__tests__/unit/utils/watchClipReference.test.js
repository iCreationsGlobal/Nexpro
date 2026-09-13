const { sanitizeClipReference, applyBatchClipReference } = require('../../../utils/watchClipReference');

describe('sanitizeClipReference', () => {
  it('keeps youtube prefixes and http(s) URLs', () => {
    expect(sanitizeClipReference('youtube:jNItxZoc2pg')).toBe('youtube:jNItxZoc2pg');
    expect(sanitizeClipReference('https://cdn.example.com/clip.mp4')).toBe('https://cdn.example.com/clip.mp4');
  });

  it('keeps tenant-scoped Watch upload paths', () => {
    expect(sanitizeClipReference('/uploads/watch/d1acd9db-ea9c-429a-8b32-cabbf344dde7/1-clip.mp4', {
      tenantId: 'd1acd9db-ea9c-429a-8b32-cabbf344dde7',
    })).toBe('/uploads/watch/d1acd9db-ea9c-429a-8b32-cabbf344dde7/1-clip.mp4');
  });

  it('rejects local paths, other tenants, and junk', () => {
    expect(sanitizeClipReference('file:///tmp/clip.mp4')).toBeNull();
    expect(sanitizeClipReference('/Users/us/clip.mp4')).toBeNull();
    expect(sanitizeClipReference('clip-1')).toBeNull();
    expect(sanitizeClipReference('/uploads/watch/other-tenant/clip.mp4', {
      tenantId: 'd1acd9db-ea9c-429a-8b32-cabbf344dde7',
    })).toBeNull();
  });
});

describe('applyBatchClipReference', () => {
  it('fills missing clipReference and keeps youtube stamps', () => {
    const events = applyBatchClipReference(
      [
        { event_type: 'counter_interaction', clipReference: 'youtube:jNItxZoc2pg' },
        { event_type: 'person_entered' },
      ],
      '/uploads/watch/tenant-1/clip.mp4'
    );
    expect(events[0].clipReference).toBe('youtube:jNItxZoc2pg');
    expect(events[1].clipReference).toBe('/uploads/watch/tenant-1/clip.mp4');
  });
});
