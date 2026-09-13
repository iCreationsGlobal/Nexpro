import { buildWatchStreamCommand } from '../../utils/watchStreamCommand';

describe('buildWatchStreamCommand', () => {
  it('documents the shop-PC runner with events ingest, not a live video URL', () => {
    const command = buildWatchStreamCommand({
      streamUrl: 'rtsp://192.168.1.20/stream',
      apiOrigin: 'http://localhost:5000',
    });
    expect(command).toContain('python3 vision-edge/run_stream.py');
    expect(command).toContain("--stream 'rtsp://192.168.1.20/stream'");
    expect(command).toContain('--post http://localhost:5000/api/watch/events');
    expect(command).not.toMatch(/\/api\/watch\/video/i);
  });
});
