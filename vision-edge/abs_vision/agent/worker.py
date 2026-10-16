"""One camera: newest frame -> person tracking -> events, snapshots and incident clips.

The camera loop never waits on the network. Batches of events (with the frames for their clip)
and snapshots go to a sender thread, and anything ABS can't take right now is saved to disk.
"""

import logging
import queue as stdqueue
import threading
import time
from datetime import datetime, timedelta, timezone

from ..events import EventEngine
from .api import ApiError
from .buffer import FrameBuffer
from .capture import CameraReader
from .clipmaker import make_clip

log = logging.getLogger("abs_watch.worker")

INTERACTION = "counter_interaction"
# Events that get the clip of the till activity attached
CLIP_EVENTS = (INTERACTION, "person_entered_counter_zone")
BUFFER_SECONDS = 40.0
# Send ordinary events at least this often
FLUSH_SECONDS = 10.0
# After till activity, keep recording this long so the clip shows how it ended...
CLIP_TAIL_SECONDS = 5.0
# ...but never hold events back longer than this
MAX_HOLD_SECONDS = 20.0
# Uploads waiting on a slow connection; past this, new till activity is sent without a clip
MAX_WAITING_JOBS = 4
SNAPSHOT_MAX_BYTES = 550 * 1024
SNAPSHOT_RETRY = timedelta(minutes=1)
# On shutdown, how long the sender gets to finish before the rest is saved to disk
SHUTDOWN_SECONDS = 10.0


def encode_jpeg(frame, max_width, quality):
    import cv2

    height, width = frame.shape[:2]
    if width > max_width:
        frame = cv2.resize(frame, (max_width, int(height * max_width / width)), interpolation=cv2.INTER_AREA)
    ok, data = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        raise RuntimeError("Could not encode a JPEG")
    return data.tobytes()


def _parse_iso(value):
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _iso(moment):
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def post_batch(api, batch):
    api.post_events(batch["cameraId"], batch["events"], match_window_minutes=batch.get("matchWindowMinutes", 5))


def send_backlog(queue, api, max_seconds=None):
    """Send events saved while ABS was unreachable, oldest first. Returns how many batches went."""

    def send(batch):
        try:
            post_batch(api, batch)
        except ApiError as exc:
            if exc.is_retryable or exc.is_auth_error:
                raise
            # ABS will never take this batch (e.g. its camera was removed): don't let it block the rest
            log.warning("ABS rejected saved events for camera %s (%s); dropping them", batch.get("cameraId"), exc)

    return queue.flush(send, max_seconds=max_seconds)


class CameraWorker(threading.Thread):
    def __init__(
        self,
        camera,
        api,
        queue,
        settings,
        tracker_factory,
        reader_factory=CameraReader,
        encoder=encode_jpeg,
        clip_maker=make_clip,
        now=lambda: datetime.now(timezone.utc),
        on_auth_error=None,
    ):
        super().__init__(name=f"worker-{camera.get('name', 'camera')}", daemon=True)
        self.camera = camera
        self.camera_id = camera["cameraId"]
        self.label = camera.get("name", "camera")
        self.api = api
        self.queue = queue
        self.settings = settings
        self._tracker_factory = tracker_factory
        self.reader = reader_factory(camera["source"], name=self.label)
        self._encode = encoder
        self._make_clip = clip_maker
        self._now = now
        self._on_auth_error = on_auth_error
        self._stop_event = threading.Event()
        self._outbox = stdqueue.Queue()
        self._sender = None  # started by run(); until then (tests) work is sent inline
        self.engine = EventEngine(
            camera.get("zones") or [],
            dwell_seconds=settings.get("dwellSeconds", 6),
            camera=self.label,
        )
        self.buffer = FrameBuffer(BUFFER_SECONDS)
        self.pending = []
        self.pending_since = None
        self.send_after = None
        self.last_snapshot = None
        self.snapshot_failed = False
        self._errors = {}
        self._errors_lock = threading.Lock()
        # Frames actually analysed per second (camera fps is in the reader's status)
        self.detect_fps = 0.0

    # Control ---------------------------------------------------------------------------------
    def stop(self):
        self._stop_event.set()
        self.reader.stop()

    def set_zones(self, zones):
        self.engine.set_zones(zones or [])

    def status(self):
        status = {"cameraId": self.camera_id, **self.reader.status(), "detectFps": round(self.detect_fps, 1)}
        with self._errors_lock:
            problems = [message for message, _transient in self._errors.values()]
        if not status.get("error") and problems:
            status["error"] = "; ".join(problems)[:200]
        return status

    def _fail(self, key, message, transient=False):
        """Remember a problem for the health report. True the first time it's seen (worth logging).
        Transient problems (no connection, ABS busy) clear as soon as ABS answers again."""
        message = str(message)[:200]
        with self._errors_lock:
            new = self._errors.get(key, (None, False))[0] != message
            self._errors[key] = (message, transient)
        return new

    def _ok(self, key, reached_abs=False):
        with self._errors_lock:
            self._errors.pop(key, None)
            if reached_abs:
                for other in [other for other, (_message, transient) in self._errors.items() if transient]:
                    self._errors.pop(other)

    # Camera loop -----------------------------------------------------------------------------
    def run(self):
        self._sender = threading.Thread(target=self._send_loop, name=f"sender-{self.label}", daemon=True)
        self._sender.start()
        self.reader.start()
        try:
            self._watch()
        finally:
            self.reader.stop()
            self._finish()

    def _watch(self):
        try:
            tracker = self._tracker_factory(self.camera)
        except Exception as exc:
            self._fail("detector", f"Detector failed to load: {exc}")
            log.error("Camera %s: detector failed to load: %s", self.label, exc)
            return
        interval = 1.0 / max(1.0, float(self.settings.get("sampleFps", 5)))
        last_seq = 0
        counted, window_started = 0, time.monotonic()
        while not self._stop_event.is_set():
            started = time.monotonic()
            seq, frame, frame_at = self.reader.latest()
            if frame is not None and seq != last_seq:
                last_seq = seq
                self.process_frame(tracker, frame, frame_at)
                counted += 1
            if started - window_started >= 5.0:
                self.detect_fps = counted / (started - window_started)
                counted, window_started = 0, started
            self.maybe_send(self._now())
            self._stop_event.wait(max(0.0, interval - (time.monotonic() - started)))
        self.detect_fps = 0.0

    def _finish(self):
        """Close open tracks and send what's left; whatever the sender can't finish in time is saved."""
        self.pending.extend(self.engine.flush())
        self._dispatch_pending(self._now())
        self._outbox.put(None)
        self._sender.join(timeout=SHUTDOWN_SECONDS)
        while True:
            try:
                job = self._outbox.get_nowait()
            except stdqueue.Empty:
                break
            if job and job["kind"] == "events":
                self.queue.enqueue(self._batch(job["events"]))

    def process_frame(self, tracker, frame, frame_at):
        try:
            self.buffer.add(frame_at, self._encode(frame, 960, 70))
        except Exception as exc:
            log.debug("Camera %s: couldn't buffer a frame: %s", self.label, exc)
        self.maybe_snapshot(frame, frame_at)
        try:
            detections = tracker.track(frame)
        except Exception as exc:
            if self._fail("detection", f"Detection failed: {exc}"):
                log.warning("Camera %s: detection failed: %s", self.label, exc)
            return
        self._ok("detection")
        events = self.engine.process(frame_at, detections)
        if not events:
            return
        if not self.pending:
            self.pending_since = frame_at
        self.pending.extend(events)
        if any(event["event_type"] == INTERACTION for event in events):
            self.send_after = frame_at + timedelta(seconds=CLIP_TAIL_SECONDS)

    def maybe_snapshot(self, frame, frame_at):
        """A still for drawing zones in ABS: at start, then every few minutes (sooner after a failure)."""
        if self.last_snapshot is not None:
            interval = timedelta(minutes=float(self.settings.get("snapshotIntervalMinutes", 15)))
            if frame_at - self.last_snapshot < (SNAPSHOT_RETRY if self.snapshot_failed else interval):
                return
        self.last_snapshot = frame_at
        try:
            for quality in (80, 65, 50):
                jpeg = self._encode(frame, 1280, quality)
                if len(jpeg) <= SNAPSHOT_MAX_BYTES:
                    break
        except Exception as exc:
            log.warning("Camera %s: couldn't encode a snapshot: %s", self.label, exc)
            return
        self._dispatch({"kind": "snapshot", "jpeg": jpeg, "capturedAt": _iso(frame_at)})

    def maybe_send(self, now):
        if not self.pending:
            return
        held = (now - self.pending_since).total_seconds()
        if self.send_after is not None:
            # Till activity: wait for the clip's tail, within limits
            due = now >= self.send_after or held >= MAX_HOLD_SECONDS
        else:
            due = held >= FLUSH_SECONDS
        if due:
            self._dispatch_pending(now)

    def _dispatch_pending(self, now):
        events, self.pending = self.pending, []
        self.pending_since = None
        self.send_after = None
        if not events:
            return
        frames, window, fps = self.clip_frames(events, now)
        self._dispatch({"kind": "events", "events": events, "frames": frames, "window": window, "fps": fps})

    def clip_frames(self, events, now):
        """Buffered frames around the till activity in these events, taken before they age out."""
        if self.settings.get("clipUploads") == "disabled":
            return None, None, None
        starts = [_parse_iso(event["started_at"]) for event in events if event["event_type"] == INTERACTION]
        if not starts:
            return None, None, None
        if self._outbox.qsize() >= MAX_WAITING_JOBS:
            log.warning("Camera %s: connection too slow for clips right now; sending events without one", self.label)
            return None, None, None
        start = min(starts) - timedelta(seconds=float(self.settings.get("clipLeadInSeconds", 3)))
        end = min(now, start + timedelta(seconds=float(self.settings.get("clipMaxSeconds", 15))))
        buffered = self.buffer.between(start, end)
        if len(buffered) < 2:
            return None, None, None
        span = (buffered[-1][0] - buffered[0][0]).total_seconds()
        # Real capture rate, so the clip plays at normal speed even when detection runs slower
        fps = min(30.0, max(1.0, (len(buffered) - 1) / span)) if span > 0 else float(self.settings.get("sampleFps", 5))
        return [data for _, data in buffered], (start, end), fps

    # Sending (sender thread) -----------------------------------------------------------------
    def _dispatch(self, job):
        if self._sender is None:
            self._deliver(job)
        else:
            self._outbox.put(job)

    def _send_loop(self):
        while True:
            job = self._outbox.get()
            if job is None:
                return
            self._deliver(job)

    def _deliver(self, job):
        try:
            if job["kind"] == "snapshot":
                self._send_snapshot(job)
            else:
                self.send_events(job["events"], job.get("frames"), job.get("window"), job.get("fps"))
        except Exception:  # one bad job must not stop the sender
            log.exception("Camera %s: sending failed", self.label)

    def _batch(self, events):
        return {
            "cameraId": self.camera_id,
            "events": events,
            "matchWindowMinutes": self.settings.get("matchWindowMinutes", 5),
        }

    def send_events(self, events, frames=None, window=None, fps=None):
        """Upload the clip (if any), then post the events; saved for later if ABS can't take them."""
        if frames and window and not self._stop_event.is_set():
            reference = self.upload_clip(frames, fps or float(self.settings.get("sampleFps", 5)))
            if reference:
                start, end = window
                for event in events:
                    if event["event_type"] in CLIP_EVENTS and start <= _parse_iso(event["started_at"]) <= end:
                        event["clip_reference"] = reference
        batch = self._batch(events)
        # Saved batches go first, so ABS gets events in the order they happened
        send_backlog(self.queue, self.api)
        if len(self.queue):
            self.queue.enqueue(batch)
            return
        try:
            post_batch(self.api, batch)
        except ApiError as exc:
            if exc.is_retryable or exc.is_auth_error:
                self.queue.enqueue(batch)
            else:
                log.warning("Camera %s: ABS rejected events (%s); dropping them", self.label, exc)
            self._api_error(exc, "sending events")
            return
        self._ok("sending events", reached_abs=True)

    def upload_clip(self, frames, fps):
        """Make the MP4 and upload it. The clip reference, or None."""
        try:
            clip = self._make_clip(frames, fps=fps)
        except Exception as exc:
            if self._fail("clip", f"Couldn't make a clip: {exc}"):
                log.warning("Camera %s: couldn't make a clip: %s", self.label, exc)
            return None
        try:
            reference = self.api.upload_clip(self.camera_id, clip)
        except ApiError as exc:
            self._api_error(exc, "clip upload")
            return None
        self._ok("clip")
        self._ok("clip upload", reached_abs=True)
        return reference

    def _send_snapshot(self, job):
        try:
            self.api.upload_snapshot(self.camera_id, job["jpeg"], job["capturedAt"])
        except ApiError as exc:
            self.snapshot_failed = True
            self._api_error(exc, "snapshot")
            return
        self.snapshot_failed = False
        self._ok("snapshot", reached_abs=True)

    def _api_error(self, exc, action):
        if self._fail(action, f"{action}: {exc}", transient=exc.is_retryable):
            log.warning("Camera %s: %s failed: %s", self.label, action, exc)
        if exc.is_auth_error and self._on_auth_error:
            self._on_auth_error(exc)
