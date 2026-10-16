import json
import logging
import os
import stat
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.agent import service  # noqa: E402
from abs_vision.agent.api import ApiError, DeviceApi, pair  # noqa: E402
from abs_vision.agent.buffer import FrameBuffer  # noqa: E402
from abs_vision.agent.config import AgentConfig  # noqa: E402
from abs_vision.agent.queue import EventQueue  # noqa: E402
from abs_vision.agent.sources import describe_source, parse_source  # noqa: E402
from abs_vision.events import EventEngine, build_events  # noqa: E402

# The agent logs problems it recovers from; keep test output readable
logging.getLogger("abs_watch").setLevel(logging.CRITICAL)

T0 = datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc)


class ConfigTests(unittest.TestCase):
    def test_saves_owner_only_and_round_trips_cameras(self):
        with tempfile.TemporaryDirectory() as home:
            config = AgentConfig.load(Path(home) / "agent.json")
            config.set_pairing("https://api.example.com/", {"deviceId": "d1", "deviceKey": "d1.secret", "deviceName": "Till PC"})
            camera = config.add_camera("Counter", "rtsp://admin:pw@10.0.0.5/stream", role="counter")
            config.save()

            mode = stat.S_IMODE(os.stat(Path(home) / "agent.json").st_mode)
            self.assertEqual(mode, 0o600)
            loaded = AgentConfig.load(Path(home) / "agent.json")
            self.assertTrue(loaded.is_paired())
            self.assertEqual(loaded.api_base, "https://api.example.com")
            self.assertEqual(loaded.find_camera("counter")["localId"], camera["localId"])
            self.assertIsNotNone(loaded.remove_camera(camera["localId"]))
            self.assertEqual(loaded.cameras, [])

    def test_rejects_bad_cameras_and_forgets_ids_on_repairing(self):
        with tempfile.TemporaryDirectory() as home:
            config = AgentConfig.load(Path(home) / "agent.json")
            with self.assertRaises(ValueError):
                config.add_camera("", "camera:0")
            with self.assertRaises(ValueError):
                config.add_camera("Door", "camera:0", role="kitchen")
            camera = config.add_camera("Door", "camera:0", role="entrance")
            camera["cameraId"] = "old-workspace-camera"
            config.set_pairing("https://api.example.com", {"deviceId": "d2", "deviceKey": "d2.k"})
            self.assertNotIn("cameraId", config.cameras[0])

    def test_notices_changes_made_by_another_process(self):
        with tempfile.TemporaryDirectory() as home:
            path = Path(home) / "agent.json"
            running = AgentConfig.load(path)
            running.add_camera("Counter", "camera:0")
            running.save()
            self.assertFalse(running.reload_if_changed())  # its own save

            cli = AgentConfig.load(path)
            cli.add_camera("Door", "camera:1", role="entrance")
            cli.save()
            self.assertTrue(running.reload_if_changed())
            self.assertEqual([camera["name"] for camera in running.cameras], ["Counter", "Door"])
            self.assertFalse(running.reload_if_changed())

            path.write_text("{ not json", encoding="utf-8")
            with self.assertRaises(ValueError):
                running.reload_if_changed()


class SourceTests(unittest.TestCase):
    def test_parses_local_cameras_streams_and_files(self):
        self.assertEqual(parse_source("camera:0"), ("local", 0))
        self.assertEqual(parse_source("1"), ("local", 1))
        self.assertEqual(parse_source("rtsp://10.0.0.5/stream"), ("stream", "rtsp://10.0.0.5/stream"))
        self.assertEqual(parse_source("http://phone:8080/video"), ("stream", "http://phone:8080/video"))
        self.assertEqual(parse_source("videos/shop.mp4"), ("file", "videos/shop.mp4"))

    def test_masks_camera_logins_for_logs(self):
        self.assertEqual(
            describe_source("rtsp://admin:p@ss@10.0.0.5:554/Streaming/Channels/102"),
            "rtsp://***@10.0.0.5:554/Streaming/Channels/102",
        )
        self.assertEqual(describe_source("camera:0"), "camera:0")


class QueueTests(unittest.TestCase):
    def test_sends_oldest_first_and_keeps_the_rest_after_a_failure(self):
        with tempfile.TemporaryDirectory() as home:
            queue = EventQueue(Path(home) / "queue.jsonl")
            for index in range(3):
                queue.enqueue({"n": index})
            sent = []

            def send(batch):
                if batch["n"] == 1:
                    raise ApiError(0, "offline")
                sent.append(batch["n"])

            self.assertEqual(queue.flush(send), 1)
            self.assertEqual(sent, [0])
            self.assertEqual(len(queue), 2)
            self.assertEqual(queue.flush(lambda batch: sent.append(batch["n"])), 2)
            self.assertEqual(sent, [0, 1, 2])
            self.assertEqual(len(queue), 0)

    def test_caps_a_long_outage_to_the_newest_batches(self):
        with tempfile.TemporaryDirectory() as home:
            queue = EventQueue(Path(home) / "queue.jsonl", max_batches=3)
            for index in range(5):
                queue.enqueue({"n": index})
            got = []
            queue.flush(lambda batch: got.append(batch["n"]))
            self.assertEqual(got, [2, 3, 4])

    def test_new_batches_can_be_queued_while_the_backlog_is_sending(self):
        with tempfile.TemporaryDirectory() as home:
            queue = EventQueue(Path(home) / "queue.jsonl")
            for index in range(30):
                queue.enqueue({"n": index})
            sent = []

            def send(batch):
                if batch["n"] == 0:
                    # Another camera saves a batch, and tries to send the backlog, mid-flush
                    queue.enqueue({"n": "late"})
                    self.assertEqual(queue.flush(lambda other: None), 0)
                sent.append(batch["n"])

            self.assertEqual(queue.flush(send), 30)
            self.assertEqual(sent, list(range(30)))
            remaining = []
            queue.flush(lambda batch: remaining.append(batch["n"]))
            self.assertEqual(remaining, ["late"])

    def test_a_flush_can_be_time_boxed(self):
        with tempfile.TemporaryDirectory() as home:
            queue = EventQueue(Path(home) / "queue.jsonl")
            for index in range(3):
                queue.enqueue({"n": index})
            self.assertEqual(queue.flush(lambda batch: None, max_seconds=-1), 0)
            self.assertEqual(len(queue), 3)
            queue.clear()
            self.assertEqual(len(queue), 0)


class BufferTests(unittest.TestCase):
    def test_keeps_only_recent_frames_and_slices_by_time(self):
        buffer = FrameBuffer(seconds=10)
        for second in range(30):
            buffer.add(T0 + timedelta(seconds=second), bytes([second]))
        self.assertEqual(len(buffer), 11)
        frames = buffer.between(T0 + timedelta(seconds=25), T0 + timedelta(seconds=27))
        self.assertEqual([data[0] for _, data in frames], [25, 26, 27])


class StreamingEngineTests(unittest.TestCase):
    def test_streaming_matches_batch_and_keeps_tracks_open_between_calls(self):
        zones = [{"type": "counter", "x": 0.5, "y": 0.5, "w": 0.5, "h": 0.5}]
        frames = []
        for index in range(60):  # 12 s at 5 fps standing still at the till
            frames.append({"t": index / 5, "detections": [{"track_id": "p1", "bbox": [0.6, 0.6, 0.8, 0.9], "confidence": 0.9}]})

        batch = build_events(frames, zones, start_time=T0, fps=5)

        engine = EventEngine(zones)
        streamed = []
        for frame in frames:
            streamed.extend(engine.process(T0 + timedelta(seconds=frame["t"]), frame["detections"]))
        # Still in view: no person_left yet, and exactly one entry / one till interaction
        types = [event["event_type"] for event in streamed]
        self.assertEqual(types.count("person_entered"), 1)
        self.assertEqual(types.count("counter_interaction"), 1)
        self.assertNotIn("person_left", types)
        streamed.extend(engine.flush())
        self.assertEqual([e["event_id"] for e in streamed], [e["event_id"] for e in batch])

    def test_zones_can_change_while_running(self):
        engine = EventEngine([])
        engine.set_zones([{"type": "counter", "x": 0, "y": 0, "w": 1, "h": 1}])
        events = engine.process(T0, [{"track_id": "p1", "bbox": [0.1, 0.1, 0.2, 0.2], "confidence": 0.8}])
        self.assertIn("person_entered_counter_zone", [event["event_type"] for event in events])


class _Handler(BaseHTTPRequestHandler):
    requests = []

    def log_message(self, *args):
        pass

    def _reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        _Handler.requests.append((self.path, self.headers.get("Authorization"), b""))
        if self.headers.get("Authorization") != "Bearer d1.secret":
            return self._reply(401, {"success": False, "error": "This Watch device is not paired"})
        return self._reply(200, {"success": True, "data": {"configVersion": "v1", "cameras": []}})

    def do_PUT(self):
        length = int(self.headers.get("Content-Length") or 0)
        _Handler.requests.append((self.path, self.headers.get("Content-Type"), self.rfile.read(length)))
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        _Handler.requests.append((self.path, self.headers.get("Authorization"), body))
        if self.path == "/api/watch-agent/pair":
            code = json.loads(body)["code"]
            if code != "K7P2-9QXM":
                return self._reply(404, {"success": False, "error": "That pairing code is wrong or has expired."})
            return self._reply(201, {"success": True, "data": {"deviceId": "d1", "deviceKey": "d1.secret", "deviceName": "Till PC"}})
        if self.headers.get("Authorization") != "Bearer d1.secret":
            return self._reply(401, {"success": False, "error": "This Watch device is not paired"})
        if self.path == "/api/watch-agent/clips/upload-url":
            if json.loads(body)["cameraId"] == "cam-bucket":
                return self._reply(200, {"success": True, "data": {
                    "mode": "presigned",
                    "method": "PUT",
                    "uploadUrl": f"http://127.0.0.1:{self.server.server_port}/bucket/watch/t1/clip.mp4?sig=x",
                    "headers": {"Content-Type": "video/mp4"},
                    "clipReference": "storage:watch/t1/clip.mp4",
                }})
            return self._reply(200, {"success": True, "data": {"mode": "direct", "uploadPath": "/api/watch-agent/clips"}})
        if self.path == "/api/watch-agent/clips":
            return self._reply(201, {"success": True, "data": {"clipReference": "/uploads/watch/t1/clip.mp4"}})
        return self._reply(201, {"success": True, "data": {"ok": True}})


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), _Handler)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        _Handler.requests.clear()

    def test_pairs_with_a_code_and_reports_wrong_codes(self):
        self.assertEqual(pair(self.base, "K7P2-9QXM")["deviceKey"], "d1.secret")
        with self.assertRaises(ApiError) as ctx:
            pair(self.base, "WRONG-CODE")
        self.assertEqual(ctx.exception.status, 404)
        self.assertIn("expired", str(ctx.exception))

    def test_sends_events_with_the_device_key(self):
        DeviceApi(self.base, "d1.secret").post_events("cam-1", [{"event_type": "person_entered"}])
        path, auth, body = _Handler.requests[-1]
        self.assertEqual(path, "/api/watch-agent/events")
        self.assertEqual(auth, "Bearer d1.secret")
        self.assertEqual(json.loads(body)["cameraId"], "cam-1")

    def test_auth_errors_are_recognised(self):
        self.assertEqual(DeviceApi(self.base, "d1.secret").get_config()["configVersion"], "v1")
        with self.assertRaises(ApiError) as ctx:
            DeviceApi(self.base, "d1.wrong").get_config()
        self.assertTrue(ctx.exception.is_auth_error)
        self.assertFalse(ctx.exception.is_retryable)

    def test_which_errors_are_worth_retrying(self):
        self.assertTrue(ApiError(0, "offline").is_retryable)
        self.assertTrue(ApiError(503, "busy").is_retryable)
        self.assertTrue(ApiError(429, "slow down").is_retryable)
        self.assertFalse(ApiError(404, "camera removed").is_retryable)
        self.assertFalse(ApiError(400, "bad events").is_retryable)

    def test_uploads_clips_straight_to_the_bucket_when_abs_has_one(self):
        reference = DeviceApi(self.base, "d1.secret").upload_clip("cam-bucket", b"clip-bytes")
        self.assertEqual(reference, "storage:watch/t1/clip.mp4")
        path, content_type, body = _Handler.requests[-1]
        self.assertTrue(path.startswith("/bucket/watch/t1/clip.mp4"))
        self.assertEqual(content_type, "video/mp4")
        self.assertEqual(body, b"clip-bytes")

    def test_uploads_clips_directly_when_the_server_has_a_disk(self):
        reference = DeviceApi(self.base, "d1.secret").upload_clip("cam-1", b"\x00\x00\x00\x18ftypmp42")
        self.assertEqual(reference, "/uploads/watch/t1/clip.mp4")
        path, _auth, body = _Handler.requests[-1]
        self.assertEqual(path, "/api/watch-agent/clips")
        self.assertIn(b'name="file"; filename="clip.mp4"', body)

    def test_unreachable_server_is_a_retryable_error(self):
        with self.assertRaises(ApiError) as ctx:
            DeviceApi("http://127.0.0.1:9", "d1.secret", timeout=2).get_config()
        self.assertEqual(ctx.exception.status, 0)
        self.assertFalse(ctx.exception.is_auth_error)


class ServiceTests(unittest.TestCase):
    def test_launchd_runs_the_agent_at_login_and_restarts_it(self):
        plan = service.describe(
            system="darwin",
            python="/usr/bin/python3",
            script="/opt/abs/abs_watch_agent.py",
            home="/Users/x/.abs-watch",
            path_env="/usr/local/bin:/usr/bin:/bin",
        )
        self.assertEqual(plan["kind"], "launchd")
        self.assertIn("<string>/opt/abs/abs_watch_agent.py</string>", plan["content"])
        self.assertIn("<key>KeepAlive</key>\n  <true/>", plan["content"])
        # Runs from the agent's folder (the model downloads there) and can find ffmpeg
        self.assertIn("<key>WorkingDirectory</key>\n  <string>/Users/x/.abs-watch</string>", plan["content"])
        self.assertIn("<string>/usr/local/bin:/usr/bin:/bin</string>", plan["content"])

    def test_service_path_keeps_the_users_path_and_adds_common_tool_folders(self):
        saved = os.environ.get("PATH")
        os.environ["PATH"] = "/custom/bin"
        try:
            path_env = service.service_path_env().split(os.pathsep)
        finally:
            os.environ["PATH"] = saved
        self.assertEqual(path_env[0], "/custom/bin")
        self.assertIn("/opt/homebrew/bin", path_env)
        self.assertIn("/usr/local/bin", path_env)

    def test_systemd_and_windows_definitions(self):
        unit = service.describe(system="linux", python="/usr/bin/python3", script="/opt/a.py", home="/home/x/.abs-watch", path_env="/usr/bin")
        self.assertIn('ExecStart="/usr/bin/python3" "/opt/a.py" run', unit["content"])
        self.assertIn("Restart=always", unit["content"])
        self.assertIn("WorkingDirectory=/home/x/.abs-watch", unit["content"])
        task = service.describe(system="win32", python="C:\\Python\\python.exe", script="C:\\abs\\a.py")
        self.assertIn("ONLOGON", task["command"])
        self.assertIn('"C:\\Python\\python.exe" "C:\\abs\\a.py" run', task["command"])


def _test_frames(count, width=320, height=240):
    import cv2
    import numpy as np

    frames = []
    for index in range(count):
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        cv2.rectangle(frame, (10 + index * 5, 60), (60 + index * 5, 180), (40, 180, 240), -1)
        frames.append(frame)
    return frames


class VideoTests(unittest.TestCase):
    def test_clips_are_mp4_a_browser_can_play(self):
        import cv2

        from abs_vision.agent.clipmaker import _encode_with_ffmpeg, ffmpeg_path, make_clip

        # Odd size on purpose: a 1366x768 camera scaled to 960 wide is 960x539
        jpegs = [cv2.imencode(".jpg", frame)[1].tobytes() for frame in _test_frames(15, width=321, height=239)]
        clip = make_clip(jpegs, fps=5)
        self.assertEqual(clip[4:8], b"ftyp")
        if ffmpeg_path():
            with tempfile.TemporaryDirectory() as home:
                _encode_with_ffmpeg(jpegs, 5, str(Path(home) / "direct.mp4"))  # no fallback to OpenCV
            self.assertIn(b"avc1", clip[:4096] + clip[-65536:])  # H.264
        with tempfile.TemporaryDirectory() as home:
            path = Path(home) / "clip.mp4"
            path.write_bytes(clip)
            capture = cv2.VideoCapture(str(path))
            decoded = 0
            while capture.read()[0]:
                decoded += 1
            capture.release()
        self.assertGreaterEqual(decoded, 14)

    def test_reader_plays_a_video_file_through_the_real_capture(self):
        import cv2

        from abs_vision.agent.capture import CameraReader

        with tempfile.TemporaryDirectory() as home:
            path = str(Path(home) / "shop.mp4")
            writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 25.0, (320, 240))
            for frame in _test_frames(25):
                writer.write(frame)
            writer.release()

            reader = CameraReader(path, name="test")
            reader.start()
            try:
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline and reader.latest()[0] < 30:
                    time.sleep(0.05)
                seq, frame, frame_at = reader.latest()
                self.assertGreaterEqual(seq, 30)  # 25-frame file looped
                self.assertEqual(frame.shape, (240, 320, 3))
                self.assertTrue(reader.status()["online"])
            finally:
                reader.stop()
                reader.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
