const { extendWatchYoloTimeout, WATCH_YOLO_SOCKET_MS } = require('../../../middleware/watchYoloTimeout');

describe('extendWatchYoloTimeout', () => {
  it('extends the request/response socket past a 30s default', () => {
    expect(WATCH_YOLO_SOCKET_MS).toBeGreaterThanOrEqual(180000);
    const req = { setTimeout: jest.fn(), socket: { setTimeout: jest.fn() } };
    const res = { setTimeout: jest.fn() };
    const next = jest.fn();

    extendWatchYoloTimeout(req, res, next);

    expect(req.setTimeout).toHaveBeenCalledWith(WATCH_YOLO_SOCKET_MS);
    expect(res.setTimeout).toHaveBeenCalledWith(WATCH_YOLO_SOCKET_MS);
    expect(req.socket.setTimeout).toHaveBeenCalledWith(WATCH_YOLO_SOCKET_MS);
    expect(next).toHaveBeenCalled();
  });
});
