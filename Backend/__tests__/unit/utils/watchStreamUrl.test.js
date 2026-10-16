const { sanitizeStreamUrl, stripStreamCredentials } = require('../../../utils/watchStreamUrl');

describe('sanitizeStreamUrl', () => {
  it('keeps rtsp and http camera URLs', () => {
    expect(sanitizeStreamUrl('rtsp://192.168.1.20/stream')).toBe('rtsp://192.168.1.20/stream');
    expect(sanitizeStreamUrl('rtsps://cam.local/live')).toBe('rtsps://cam.local/live');
    expect(sanitizeStreamUrl('http://10.0.0.8:8080/video')).toBe('http://10.0.0.8:8080/video');
    expect(sanitizeStreamUrl('https://cam.example/hls/index.m3u8')).toBe('https://cam.example/hls/index.m3u8');
  });

  it('rejects javascript, file, and local paths', () => {
    expect(sanitizeStreamUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeStreamUrl('file:///tmp/cam.mp4')).toBeNull();
    expect(sanitizeStreamUrl('/Users/us/clip.mp4')).toBeNull();
    expect(sanitizeStreamUrl('C:\\videos\\cam.mp4')).toBeNull();
    expect(sanitizeStreamUrl('')).toBeNull();
  });
});

describe('camera logins in stream URLs', () => {
  it('are removed before a URL is stored', () => {
    expect(sanitizeStreamUrl('rtsp://admin:Secret123@192.168.1.20:554/Streaming/Channels/102'))
      .toBe('rtsp://192.168.1.20:554/Streaming/Channels/102');
    expect(sanitizeStreamUrl('http://user@cam.local/video')).toBe('http://cam.local/video');
  });

  it('are removed even when the password contains @, without touching the path', () => {
    expect(stripStreamCredentials('rtsp://admin:p@ss@10.0.0.5/cam/realmonitor?channel=1&subtype=1'))
      .toBe('rtsp://10.0.0.5/cam/realmonitor?channel=1&subtype=1');
    expect(stripStreamCredentials('http://cam.local/video?tag=a@b')).toBe('http://cam.local/video?tag=a@b');
  });
});
