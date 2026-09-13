const { stampYoutubeClipOnEvents } = require('../../../services/watchYoutubeDemoService');

describe('stampYoutubeClipOnEvents', () => {
  const source = {
    videoId: 'jNItxZoc2pg',
    watchUrl: 'https://www.youtube.com/watch?v=jNItxZoc2pg',
    maxSeconds: 20,
  };

  it('stamps clipReference and youtube metadata on each event before ingest', () => {
    const events = [
      { event_type: 'counter_interaction', event_id: 'evt-1', attributes: { camera: 'youtube_test' } },
      { event_type: 'person_entered', event_id: 'evt-2', metadata: { extra: true } },
    ];

    const stamped = stampYoutubeClipOnEvents(events, source);

    expect(stamped).toHaveLength(2);
    stamped.forEach((event) => {
      expect(event.clipReference).toBe('youtube:jNItxZoc2pg');
      expect(event.metadata).toEqual(expect.objectContaining({
        videoId: 'jNItxZoc2pg',
        watchUrl: 'https://www.youtube.com/watch?v=jNItxZoc2pg',
        maxSeconds: 20,
        source: 'youtube_demo',
      }));
    });
    expect(stamped[0].event_id).toBe('evt-1');
    expect(stamped[1].metadata.extra).toBe(true);
  });

  it('returns an empty list when there are no events', () => {
    expect(stampYoutubeClipOnEvents([], source)).toEqual([]);
    expect(stampYoutubeClipOnEvents(null, source)).toEqual([]);
  });
});
