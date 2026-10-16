import logging
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.agent import capture as capture_module  # noqa: E402
from abs_vision.agent import runner as runner_module  # noqa: E402
from abs_vision.agent.api import ApiError  # noqa: E402
from abs_vision.agent.capture import CameraReader  # noqa: E402
from abs_vision.agent.config import AgentConfig  # noqa: E402
from abs_vision.agent.queue import EventQueue  # noqa: E402
from abs_vision.agent.runner import (  # noqa: E402
    FIRST_REPORT_SECONDS,
    OFFLINE_RETRY_SECONDS,
    PAUSED_RETRY_SECONDS,
    AgentRunner,
)
from abs_vision.agent.worker import CameraWorker  # noqa: E402

# The agent logs problems it recovers from; keep test output readable
logging.getLogger("abs_watch").setLevel(logging.CRITICAL)

T0 = datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc)
TILL = [{"type": "counter", "x": 0.5, "y": 0.5, "w": 0.5, "h": 0.5}]
AT_TILL = [{"track_id": "cam-1", "bbox": [0.6, 0.6, 0.8, 0.9], "confidence": 0.9}]


class FakeReader:
    def __init__(self, source, name="camera"):
        self.source = source
        self.stopped = False

    def start(self):
        pass

    def stop(self):
        self.stopped = True

    def status(self):
        return {"online": True, "fps": 25.0, "lastFrameAt": None, "error": None}


class FakeFrame:
    shape = (720, 1280, 3)

    def __init__(self, t=0.0):
        self.t = t


class Tracker:
    """A person standing at the till from `arrives` seconds on."""

    def __init__(self, arrives=0.0):
        self.arrives = arrives

    def track(self, frame):
        return AT_TILL if frame.t >= self.arrives else []


class FakeApi:
    def __init__(self):
        self.events = []
        self.snapshots = []
        self.clips = []
        self.fail_with = None

    def post_events(self, camera_id, events, clip_reference=None, match_window_minutes=5):
        if self.fail_with:
            raise self.fail_with
        self.events.append((camera_id, events))

    def upload_snapshot(self, camera_id, jpeg, captured_at):
        self.snapshots.append((camera_id, captured_at))

    def upload_clip(self, camera_id, clip):
        if self.fail_with:
            raise self.fail_with
        self.clips.append((camera_id, clip))
        return "storage:watch/t1/clip.mp4"

    def sent(self):
        return [event for _camera, batch in self.events for event in batch]


def make_worker(api, queue, settings=None, **kwargs):
    return CameraWorker(
        {"localId": "l1", "cameraId": "cam-uuid", "name": "Counter", "source": "camera:0", "zones": TILL},
        api,
        queue,
        {"sampleFps": 5, "dwellSeconds": 6, "snapshotIntervalMinutes": 15, "clipLeadInSeconds": 3, "clipMaxSeconds": 15, **(settings or {})},
        tracker_factory=lambda camera: Tracker(),
        reader_factory=FakeReader,
        encoder=lambda frame, width, quality: b"jpeg",
        clip_maker=lambda frames, fps: b"mp4:" + str(len(frames)).encode(),
        **kwargs,
    )


def feed(worker, seconds, tracker=None, start=0.0, fps=5):
    tracker = tracker or Tracker()
    for index in range(int(seconds * fps)):
        t = start + index / fps
        moment = T0 + timedelta(seconds=t)
        worker.process_frame(tracker, FakeFrame(t), moment)
        worker.maybe_send(moment)


def clip_frame_count(api):
    return int(api.clips[0][1].split(b":")[1])


class WorkerTests(unittest.TestCase):
    def test_till_activity_is_sent_with_a_clip_of_that_moment(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeApi()
            worker = make_worker(api, EventQueue(Path(home) / "q.jsonl"))
            feed(worker, 14)

            interactions = [event for event in api.sent() if event["event_type"] == "counter_interaction"]
            self.assertEqual(len(interactions), 1)
            self.assertEqual(interactions[0]["clip_reference"], "storage:watch/t1/clip.mp4")
            entered = [event for event in api.sent() if event["event_type"] == "person_entered"][0]
            self.assertNotIn("clip_reference", entered)
            # Arrival at the till (t=0, buffer starts there) through the 5 s tail after the 6 s dwell
            self.assertEqual(len(api.clips), 1)
            self.assertGreaterEqual(clip_frame_count(api), 55)

    def test_after_a_quiet_spell_till_activity_still_waits_for_the_clip_tail(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeApi()
            worker = make_worker(api, EventQueue(Path(home) / "q.jsonl"))
            feed(worker, 75, tracker=Tracker(arrives=60))  # empty shop for a minute, then a customer
            # 3 s lead-in before arrival (t=57) through the tail (t=71): ~14 s at 5 fps
            self.assertGreaterEqual(clip_frame_count(api), 70)

    def test_takes_a_snapshot_at_start_then_every_interval(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeApi()
            worker = make_worker(api, EventQueue(Path(home) / "q.jsonl"), settings={"snapshotIntervalMinutes": 0.1})
            feed(worker, 13)  # 13 s with a 6 s interval -> 0 s, 6 s, 12 s
            self.assertEqual(len(api.snapshots), 3)

    def test_queues_events_while_offline_and_sends_the_backlog_first(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeApi()
            queue = EventQueue(Path(home) / "q.jsonl")
            worker = make_worker(api, queue)
            api.fail_with = ApiError(0, "offline")
            feed(worker, 14)
            self.assertEqual(len(queue), 1)
            self.assertEqual(api.events, [])
            self.assertIn("sending events", worker.status()["error"])

            api.fail_with = None
            worker.send_events([{"event_type": "person_left", "started_at": "2026-10-12T09:01:00Z", "event_id": "x"}])
            self.assertEqual(len(queue), 0)
            self.assertEqual(len(api.events), 2)
            self.assertEqual(api.events[-1][1][0]["event_id"], "x")
            self.assertIsNone(worker.status()["error"])

    def test_a_refused_device_keeps_its_events_and_tells_the_runner(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeApi()
            queue = EventQueue(Path(home) / "q.jsonl")
            refused = []
            worker = make_worker(api, queue, on_auth_error=refused.append, settings={"clipUploads": "disabled"})
            api.fail_with = ApiError(401, "This Watch device is not paired")
            feed(worker, 12)
            self.assertTrue(refused)
            self.assertEqual(len(queue), 1)

    def test_events_abs_rejects_for_good_are_dropped_instead_of_blocking_the_queue(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeApi()
            queue = EventQueue(Path(home) / "q.jsonl")
            queue.enqueue({"cameraId": "removed-camera", "events": [{"event_id": "old"}]})
            worker = make_worker(api, queue)

            original = api.post_events

            def post_events(camera_id, events, **kwargs):
                if camera_id == "removed-camera":
                    raise ApiError(404, "Camera not found for this Watch device")
                return original(camera_id, events, **kwargs)

            api.post_events = post_events
            worker.send_events([{"event_type": "person_entered", "started_at": "2026-10-12T09:00:00Z", "event_id": "new"}])
            self.assertEqual(len(queue), 0)
            self.assertEqual([batch[0]["event_id"] for _camera, batch in api.events], ["new"])

    def test_a_failed_clip_upload_still_sends_the_events(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeApi()

            def upload_clip(camera_id, clip):
                raise ApiError(503, "busy")

            api.upload_clip = upload_clip
            worker = make_worker(api, EventQueue(Path(home) / "q.jsonl"))
            feed(worker, 14)
            interaction = [event for event in api.sent() if event["event_type"] == "counter_interaction"][0]
            self.assertNotIn("clip_reference", interaction)

    def test_runs_on_threads_and_sends_whats_left_when_stopped(self):
        with tempfile.TemporaryDirectory() as home:

            class LiveReader(FakeReader):
                seq = 0

                def latest(self):
                    LiveReader.seq += 1
                    return LiveReader.seq, FakeFrame(0), datetime.now(timezone.utc)

            api = FakeApi()
            worker = CameraWorker(
                {"cameraId": "cam-uuid", "name": "Counter", "source": "camera:0", "zones": TILL},
                api,
                EventQueue(Path(home) / "q.jsonl"),
                {"sampleFps": 20, "clipUploads": "disabled"},
                tracker_factory=lambda camera: Tracker(),
                reader_factory=LiveReader,
                encoder=lambda frame, width, quality: b"jpeg",
            )
            worker.start()
            time.sleep(0.5)
            self.assertEqual(api.events, [])  # held for the 10 s batch
            self.assertEqual(len(api.snapshots), 1)
            worker.stop()
            worker.join(timeout=5)
            self.assertFalse(worker.is_alive())
            types = [event["event_type"] for event in api.sent()]
            self.assertEqual(types, ["person_entered", "person_entered_counter_zone", "person_left"])

    def test_a_detector_that_fails_to_load_is_reported(self):
        with tempfile.TemporaryDirectory() as home:

            def broken(camera):
                raise RuntimeError("model file is corrupt")

            worker = CameraWorker(
                {"cameraId": "cam-uuid", "name": "Counter", "source": "camera:0"},
                FakeApi(),
                EventQueue(Path(home) / "q.jsonl"),
                {},
                tracker_factory=broken,
                reader_factory=FakeReader,
            )
            worker.start()
            worker.join(timeout=5)
            self.assertIn("model file is corrupt", worker.status()["error"])


class FakeCapture:
    def __init__(self, frames=None, opened=True):
        self.frames = list(frames or [])
        self.opened = opened
        self.released = False

    def isOpened(self):
        return self.opened

    def read(self):
        if self.frames:
            return True, self.frames.pop(0)
        return False, None

    def release(self):
        self.released = True


class EndlessCapture(FakeCapture):
    def read(self):
        time.sleep(0.001)
        return True, "frame"


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self._saved = (capture_module.RECONNECT_START_SECONDS, capture_module.STALL_SECONDS)
        capture_module.RECONNECT_START_SECONDS = 0.01
        capture_module.STALL_SECONDS = 0.1

    def tearDown(self):
        capture_module.RECONNECT_START_SECONDS, capture_module.STALL_SECONDS = self._saved

    def wait_for(self, check, seconds=3.0):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if check():
                return True
            time.sleep(0.01)
        return False

    def test_keeps_retrying_until_the_camera_answers(self):
        opened = []

        def opener(source):
            opened.append(source)
            if len(opened) < 3:
                return FakeCapture(opened=False), "stream"
            return EndlessCapture(), "stream"

        reader = CameraReader("rtsp://cam/stream", opener=opener)
        reader.start()
        try:
            self.assertTrue(self.wait_for(lambda: reader.status()["online"]))
            self.assertGreaterEqual(len(opened), 3)
            seq, frame, frame_at = reader.latest()
            self.assertEqual(frame, "frame")
            self.assertIsNone(reader.status()["error"])
        finally:
            reader.stop()
            reader.join(timeout=2)

    def test_reconnects_when_a_camera_stops_sending(self):
        captures = []

        def opener(source):
            captures.append(FakeCapture(frames=["frame"]))  # one frame, then silence
            return captures[-1], "stream"

        reader = CameraReader("rtsp://cam/stream", opener=opener)
        reader.start()
        try:
            self.assertTrue(self.wait_for(lambda: len(captures) >= 2))
            self.assertTrue(captures[0].released)
        finally:
            reader.stop()
            reader.join(timeout=2)


class FakeDeviceApi:
    def __init__(self):
        self.registered = []
        self.heartbeats = []
        self.events = []
        self.version = "v1"
        self.cloud = {"l1": {"name": "Counter (renamed in ABS)", "zones": TILL, "isActive": True}}
        self.refuse = None

    def _check(self):
        if self.refuse:
            raise self.refuse

    def register_camera(self, local_id, name, role):
        self._check()
        self.registered.append(local_id)
        self.cloud.setdefault(local_id, {"name": name, "zones": [], "isActive": True})
        return {"id": f"cam-{local_id}"}

    def get_config(self):
        self._check()
        return {
            "settings": {"heartbeatSeconds": 60, "sampleFps": 5},
            "configVersion": self.version,
            "cameras": [{"id": f"cam-{local_id}", **camera} for local_id, camera in self.cloud.items()],
        }

    def heartbeat(self, version, platform, cameras):
        self._check()
        self.heartbeats.append(cameras)
        return {"configVersion": self.version}

    def post_events(self, camera_id, events, clip_reference=None, match_window_minutes=5):
        self._check()
        self.events.append((camera_id, events))


class RecordingWorker:
    def __init__(self, camera, api, queue, settings, tracker_factory, on_auth_error=None):
        self.camera = camera
        self.zones = camera["zones"]
        self.settings = settings
        self.started = False
        self.stopped = False

    def start(self):
        self.started = True

    def set_zones(self, zones):
        self.zones = zones

    def status(self):
        return {"cameraId": self.camera["cameraId"], "online": True}

    def stop(self):
        self.stopped = True

    def join(self, timeout=None):
        pass


def wait_until(check, seconds=3.0):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            return True
        time.sleep(0.01)
    return False


def make_runner(home, api):
    config = AgentConfig.load(Path(home) / "agent.json")
    config.set_pairing("https://api.example.com", {"deviceId": "d1", "deviceKey": "d1.k"})
    config.cameras.append({"localId": "l1", "name": "Counter", "role": "counter", "source": "camera:0"})
    config.save()
    return AgentRunner(config, api=api, worker_factory=RecordingWorker, queue=EventQueue(Path(home) / "q.jsonl"))


class RunnerTests(unittest.TestCase):
    def test_registers_new_cameras_starts_them_and_applies_zone_changes(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeDeviceApi()
            runner = make_runner(home, api)
            # New cameras: report again in a few seconds, once they've connected
            self.assertEqual(runner.tick(), FIRST_REPORT_SECONDS)
            self.assertEqual(api.registered, ["l1"])
            self.assertEqual(AgentConfig.load(Path(home) / "agent.json").cameras[0]["cameraId"], "cam-l1")
            worker = runner.workers["cam-l1"]
            self.assertTrue(worker.started)
            self.assertEqual(worker.camera["name"], "Counter (renamed in ABS)")
            self.assertEqual(api.heartbeats[-1], [{"cameraId": "cam-l1", "online": True}])

            new_zones = [{"type": "counter", "x": 0, "y": 0, "w": 0.3, "h": 0.3}]
            api.cloud["l1"]["zones"] = new_zones
            api.version = "v2"
            self.assertEqual(runner.tick(), 60.0)  # the heartbeat reports a new config version -> zones pulled again
            self.assertEqual(worker.zones, new_zones)
            self.assertIs(runner.workers["cam-l1"], worker)

    def test_a_camera_switched_off_in_abs_stops_and_starts_again_when_switched_on(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeDeviceApi()
            runner = make_runner(home, api)
            runner.tick()
            worker = runner.workers["cam-l1"]
            api.cloud["l1"]["isActive"] = False
            api.version = "v2"
            runner.tick()
            self.assertTrue(worker.stopped)
            self.assertEqual(runner.workers, {})
            api.cloud["l1"]["isActive"] = True
            api.version = "v3"
            runner.tick()
            self.assertTrue(runner.workers["cam-l1"].started)

    def test_starts_from_the_last_settings_when_abs_cant_be_reached(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeDeviceApi()
            runner = make_runner(home, api)
            api.refuse = ApiError(0, "offline")
            self.assertEqual(runner.tick(), OFFLINE_RETRY_SECONDS)  # never connected: nothing to go on
            self.assertEqual(runner.workers, {})
            api.refuse = None
            runner.tick()
            self.assertIn("cam-l1", runner.workers)

            # The shop PC restarts while the internet is down
            api.refuse = ApiError(0, "offline")
            restarted = AgentRunner(
                AgentConfig.load(Path(home) / "agent.json"),
                api=api,
                worker_factory=RecordingWorker,
                queue=EventQueue(Path(home) / "q.jsonl"),
            )
            restarted.tick()
            self.assertEqual(restarted.workers["cam-l1"].camera["zones"], TILL)
            self.assertEqual(restarted.settings["sampleFps"], 5)
            self.assertTrue(restarted._needs_sync)  # checks ABS again once it's back

    def test_pauses_when_abs_refuses_the_device_and_resumes_when_allowed(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeDeviceApi()
            runner = make_runner(home, api)
            runner.tick()
            worker = runner.workers["cam-l1"]
            api.refuse = ApiError(403, "ABS Watch is not enabled for this workspace")
            self.assertEqual(runner.tick(), PAUSED_RETRY_SECONDS)
            self.assertTrue(worker.stopped)
            self.assertEqual(runner.workers, {})
            self.assertIn("not enabled", runner.paused)

            api.refuse = None
            runner.tick()
            self.assertIsNone(runner.paused)
            self.assertTrue(runner.workers["cam-l1"].started)

    def test_picks_up_a_camera_added_while_running(self):
        with tempfile.TemporaryDirectory() as home:
            api = FakeDeviceApi()
            runner = make_runner(home, api)
            runner.tick()
            cli = AgentConfig.load(Path(home) / "agent.json")
            cli.add_camera("Door", "rtsp://10.0.0.6/stream", role="entrance")
            cli.save()
            runner.tick()
            self.assertEqual(len(runner.workers), 2)
            self.assertEqual(len(api.registered), 2)

            cli = AgentConfig.load(Path(home) / "agent.json")
            cli.remove_camera("Door")
            cli.save()
            runner.tick()
            self.assertEqual(list(runner.workers), ["cam-l1"])

    def test_a_camera_refusal_wakes_the_runner(self):
        with tempfile.TemporaryDirectory() as home:
            runner = make_runner(home, FakeDeviceApi())
            runner.tick()
            self.assertFalse(runner._wake.is_set())
            runner._on_auth_error(ApiError(401, "not paired"))
            self.assertTrue(runner._wake.is_set())
            self.assertTrue(runner._needs_sync)

    def test_notices_a_new_pairing_within_seconds_even_while_paused(self):
        saved = runner_module.LOCAL_CHECK_SECONDS
        runner_module.LOCAL_CHECK_SECONDS = 0.05
        try:
            with tempfile.TemporaryDirectory() as home:
                api = FakeDeviceApi()
                api.refuse = ApiError(401, "This Watch device was removed.")
                runner = make_runner(home, api)
                thread = threading.Thread(target=runner.run_forever)
                thread.start()
                try:
                    self.assertTrue(wait_until(lambda: runner.paused))
                    # `pair NEWCODE` from the command line while the agent is running (and paused for 5 minutes)
                    cli = AgentConfig.load(Path(home) / "agent.json")
                    cli.set_pairing("http://127.0.0.1:9", {"deviceId": "d2", "deviceKey": "d2.new-key"})
                    cli.save()
                    self.assertTrue(wait_until(lambda: getattr(runner.api, "device_key", None) == "d2.new-key"))
                    self.assertIsNone(runner.paused)
                finally:
                    runner.request_stop()
                    thread.join(timeout=5)
                self.assertFalse(thread.is_alive())
        finally:
            runner_module.LOCAL_CHECK_SECONDS = saved

    def test_run_forever_stops_on_request(self):
        with tempfile.TemporaryDirectory() as home:
            runner = make_runner(home, FakeDeviceApi())
            thread = threading.Thread(target=runner.run_forever)
            thread.start()
            time.sleep(0.2)
            worker = runner.workers["cam-l1"]
            runner.request_stop()
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive())
            self.assertTrue(worker.stopped)

    def test_refuses_to_run_unpaired(self):
        with tempfile.TemporaryDirectory() as home:
            with self.assertRaises(RuntimeError):
                AgentRunner(AgentConfig.load(Path(home) / "agent.json"))


if __name__ == "__main__":
    unittest.main()
