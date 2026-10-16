"""Events wait here when ABS can't be reached and are sent, in order, once it can."""

import json
import os
import threading
import time
import uuid
from pathlib import Path

MAX_QUEUED_BATCHES = 5000
# Sent batches are removed from the file in groups, so a crash re-sends at most this many
# (ABS ignores events it already has)
SAVE_EVERY = 25


class EventQueue:
    def __init__(self, path, max_batches=MAX_QUEUED_BATCHES):
        self.path = Path(path)
        self.max_batches = max_batches
        self._lock = threading.Lock()  # guards the file
        self._sending = threading.Lock()  # one thread sends the backlog at a time

    def _read(self):
        if not self.path.is_file():
            return []
        items = []
        with self.path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except ValueError:
                    continue  # a half-written line from a power cut
                if isinstance(item, dict) and "id" in item and "batch" in item:
                    items.append(item)
        return items

    def _write(self, items):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        with temp.open("w", encoding="utf-8") as handle:
            for item in items:
                handle.write(json.dumps(item) + "\n")
        os.replace(temp, self.path)

    def _remove(self, ids):
        with self._lock:
            self._write([item for item in self._read() if item["id"] not in ids])

    def enqueue(self, batch):
        with self._lock:
            items = self._read()
            items.append({"id": uuid.uuid4().hex, "batch": batch})
            # Keep the newest batches if the shop has been offline for a very long time
            self._write(items[-self.max_batches:])

    def clear(self):
        with self._lock:
            if self.path.is_file():
                os.remove(self.path)

    def __len__(self):
        with self._lock:
            return len(self._read())

    def flush(self, send, max_seconds=None):
        """
        Send queued batches oldest first; stop at the first failure and keep the rest.
        The file is never locked while sending, so new batches can be queued meanwhile. If another
        thread is already sending the backlog this returns 0 straight away. `max_seconds` bounds
        one call, so a long backlog doesn't hold up the caller (it continues next time).
        """
        if not self._sending.acquire(blocking=False):
            return 0
        try:
            with self._lock:
                items = self._read()
            started = time.monotonic()
            sent, unsaved = 0, set()
            for item in items:
                if max_seconds is not None and time.monotonic() - started > max_seconds:
                    break
                try:
                    send(item["batch"])
                except Exception:
                    break
                sent += 1
                unsaved.add(item["id"])
                if len(unsaved) >= SAVE_EVERY:
                    self._remove(unsaved)
                    unsaved = set()
            if unsaved:
                self._remove(unsaved)
            return sent
        finally:
            self._sending.release()
