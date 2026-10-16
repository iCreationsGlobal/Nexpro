"""The last few seconds of sampled frames, so a clip shows the moment that needs review."""

import threading
from collections import deque


class FrameBuffer:
    """JPEG frames with their wall-clock time. JPEG keeps 30s of 5 fps video to a few MB."""

    def __init__(self, seconds=30.0):
        self.seconds = float(seconds)
        self._frames = deque()
        self._lock = threading.Lock()

    def add(self, moment, jpeg_bytes):
        with self._lock:
            self._frames.append((moment, jpeg_bytes))
            while self._frames and (moment - self._frames[0][0]).total_seconds() > self.seconds:
                self._frames.popleft()

    def between(self, start, end):
        """Frames with start <= time <= end, oldest first."""
        with self._lock:
            return [(moment, data) for moment, data in self._frames if start <= moment <= end]

    def __len__(self):
        with self._lock:
            return len(self._frames)
