const { parseYoutubeUrl, clampDemoSeconds } = require('../../../utils/youtubeUrl');

describe('youtubeUrl', () => {
  it('parses watch, short, and embed links', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=jNItxZoc2pg').videoId).toBe('jNItxZoc2pg');
    expect(parseYoutubeUrl('https://youtu.be/jNItxZoc2pg').watchUrl).toBe(
      'https://www.youtube.com/watch?v=jNItxZoc2pg'
    );
    expect(parseYoutubeUrl('https://www.youtube.com/shorts/jNItxZoc2pg').videoId).toBe('jNItxZoc2pg');
    expect(parseYoutubeUrl('https://www.youtube.com/embed/jNItxZoc2pg').videoId).toBe('jNItxZoc2pg');
  });

  it('rejects non-YouTube URLs', () => {
    expect(parseYoutubeUrl('https://example.com/watch?v=jNItxZoc2pg')).toBeNull();
    expect(parseYoutubeUrl('not-a-url')).toBeNull();
    expect(parseYoutubeUrl('')).toBeNull();
  });

  it('clamps demo duration', () => {
    expect(clampDemoSeconds(3)).toBe(10);
    expect(clampDemoSeconds(20)).toBe(20);
    expect(clampDemoSeconds(90)).toBe(45);
  });
});
