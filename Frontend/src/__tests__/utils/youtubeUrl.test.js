import { parseYoutubeUrl } from '../../utils/youtubeUrl';

describe('parseYoutubeUrl', () => {
  it('parses watch and short links', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=jNItxZoc2pg')?.videoId).toBe('jNItxZoc2pg');
    expect(parseYoutubeUrl('https://youtu.be/jNItxZoc2pg')?.videoId).toBe('jNItxZoc2pg');
  });

  it('rejects non-YouTube URLs', () => {
    expect(parseYoutubeUrl('https://example.com/watch?v=jNItxZoc2pg')).toBeNull();
  });
});
