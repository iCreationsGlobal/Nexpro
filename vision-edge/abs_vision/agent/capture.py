"""Keeps one camera open, always holding its newest frame, and reconnects on its own."""

import threading
import time
from datetime import datetime, timezone

from .sources import describe_source, open_capture

RECONNECT_START_SECONDS = 1.0
RECONNECT_MAX_SECONDS = 60.0
# A camera that delivers nothing for this long is treated as dropped and reopened
STALL_SECONDS = 10.0


class CameraReader(threading.Thread):
    """
    Reads frames as fast as the camera sends them (so the stream never lags behind) and keeps
    only the newest. Detection samples it at its own pace. Any failure closes the capture and
    retries with backoff: 1s, 2s, 4s ... up to a minute.
    """

    def __init__(self, source, name="camera", opener=open_capture, clock=time.monotonic, sleeper=time.sleep):
        super().__init__(name=f"reader-{name}", daemon=True)
        self.source = source
        self.label = name
        self._open = opener
        self._clock = clock
        self._sleep = sleeper
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._frame = None
        self._frame_seq = 0
        self._frame_at = None
        self._frames_this_second = 0
        self._second_started = clock()
        self.fps = 0.0
        self.online = False
        self.error = None
        self.last_frame_at = None
        self.loop_video_files = True

    def stop(self):
        self._stop_event.set()

    @property
    def stopped(self):
        return self._stop_event.is_set()

    def latest(self):
        """(sequence number, frame, wall-clock time) of the newest frame, or (0, None, None)."""
        with self._lock:
            return self._frame_seq, self._frame, self._frame_at

    def status(self):
        return {
            "online": self.online,
            "fps": round(self.fps, 1),
            "lastFrameAt": self.last_frame_at.isoformat().replace("+00:00", "Z") if self.last_frame_at else None,
            "error": self.error,
        }

    def _record_frame(self, frame):
        now = datetime.now(timezone.utc)
        with self._lock:
            self._frame = frame
            self._frame_seq += 1
            self._frame_at = now
        self.last_frame_at = now
        self.online = True
        self.error = None
        self._frames_this_second += 1
        elapsed = self._clock() - self._second_started
        if elapsed >= 1.0:
            self.fps = self._frames_this_second / elapsed
            self._frames_this_second = 0
            self._second_started = self._clock()

    def run(self):
        delay = RECONNECT_START_SECONDS
        while not self.stopped:
            capture = None
            try:
                capture, kind = self._open(self.source)
                if capture is None or not capture.isOpened():
                    raise RuntimeError(f"Can't open {describe_source(self.source)}")
                last_ok = self._clock()
                while not self.stopped:
                    ok, frame = capture.read()
                    if ok and frame is not None:
                        self._record_frame(frame)
                        last_ok = self._clock()
                        delay = RECONNECT_START_SECONDS
                        if kind == "file":
                            # Video files play at their own speed instead of as fast as the disk allows
                            self._sleep(1.0 / 25.0)
                        continue
                    if kind == "file" and self.loop_video_files:
                        capture.set(1, 0)  # CAP_PROP_POS_FRAMES: loop the test video
                        continue
                    if self._clock() - last_ok > STALL_SECONDS:
                        raise RuntimeError("Camera stopped sending video")
                    self._sleep(0.05)
            except Exception as exc:  # any capture failure means: close, wait, reopen
                self.online = False
                self.fps = 0.0
                self.error = str(exc)[:200]
            finally:
                if capture is not None:
                    try:
                        capture.release()
                    except Exception:
                        pass
            if self.stopped:
                break
            self._stop_event.wait(delay)
            delay = min(delay * 2, RECONNECT_MAX_SECONDS)
        self.online = False
