import { parseWatchClipSource } from '../../utils/watchClipSource';

describe('parseWatchClipSource', () => {
  it('parses youtube:VIDEOID clip references', () => {
    expect(parseWatchClipSource('youtube:jNItxZoc2pg')).toEqual({
      type: 'youtube',
      videoId: 'jNItxZoc2pg',
      watchUrl: 'https://www.youtube.com/watch?v=jNItxZoc2pg',
    });
  });

  it('parses a bare 11-character video id', () => {
    expect(parseWatchClipSource('jNItxZoc2pg').videoId).toBe('jNItxZoc2pg');
  });

  it('parses youtube.com and youtu.be URLs', () => {
    expect(parseWatchClipSource('https://www.youtube.com/watch?v=jNItxZoc2pg').videoId).toBe('jNItxZoc2pg');
    expect(parseWatchClipSource('https://youtu.be/jNItxZoc2pg').videoId).toBe('jNItxZoc2pg');
  });

  it('reads clipReference, event.clipReference, and metadata.videoId from an incident', () => {
    expect(parseWatchClipSource({
      clipReference: 'youtube:jNItxZoc2pg',
    }).videoId).toBe('jNItxZoc2pg');

    expect(parseWatchClipSource({
      event: { clipReference: 'youtube:jNItxZoc2pg' },
    }).videoId).toBe('jNItxZoc2pg');

    expect(parseWatchClipSource({
      metadata: { videoId: 'jNItxZoc2pg' },
    }).videoId).toBe('jNItxZoc2pg');
  });

  it('ignores local file paths', () => {
    expect(parseWatchClipSource('file:///tmp/clip.mp4')).toEqual({ type: 'none' });
    expect(parseWatchClipSource('/Users/us/clip.mp4')).toEqual({ type: 'none' });
    expect(parseWatchClipSource('vision-edge/videos/youtube/abc.mp4')).toEqual({ type: 'none' });
    expect(parseWatchClipSource('./shop-test.mp4')).toEqual({ type: 'none' });
    expect(parseWatchClipSource('C:\\videos\\clip.mp4')).toEqual({ type: 'none' });
  });

  it('parses uploaded and http(s) video URLs', () => {
    expect(parseWatchClipSource('/uploads/watch/tenant-1/clip.mp4')).toEqual({
      type: 'video',
      url: '/uploads/watch/tenant-1/clip.mp4',
    });
    expect(parseWatchClipSource('https://example.com/clip.mp4')).toEqual({
      type: 'video',
      url: 'https://example.com/clip.mp4',
    });
    expect(parseWatchClipSource({
      clipReference: '/uploads/watch/tenant-1/clip.webm',
    }).type).toBe('video');
  });

  it('returns none when there is no playable clip', () => {
    expect(parseWatchClipSource(null)).toEqual({ type: 'none' });
    expect(parseWatchClipSource({})).toEqual({ type: 'none' });
    expect(parseWatchClipSource('clip-1')).toEqual({ type: 'none' });
  });
});
