/**
 * Keep the HTTP socket open while vision-edge YOLO runs (often 60s+, up to 5 minutes).
 * Does not change global Express/axios timeouts for the rest of the app.
 */
const WATCH_YOLO_SOCKET_MS = 6 * 60 * 1000;

const extendWatchYoloTimeout = (req, res, next) => {
  if (typeof req.setTimeout === 'function') {
    req.setTimeout(WATCH_YOLO_SOCKET_MS);
  }
  if (typeof res.setTimeout === 'function') {
    res.setTimeout(WATCH_YOLO_SOCKET_MS);
  }
  if (req.socket && typeof req.socket.setTimeout === 'function') {
    req.socket.setTimeout(WATCH_YOLO_SOCKET_MS);
  }
  next();
};

module.exports = {
  extendWatchYoloTimeout,
  WATCH_YOLO_SOCKET_MS,
};
