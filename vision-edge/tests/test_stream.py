import unittest
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.stream import (
    build_ingest_body,
    ingest_body_contains_video,
    is_live_url,
    iter_sampled_frames,
    run_stream_session,
    should_upload_snippet,
)


class FakeCapture:
    def __init__(self, n=8, fps=10):
        self.n = n
        self.fps = fps
        self.i = 0

    def get(self, _prop):
        return self.fps

    def read(self):
        if self.i >= self.n:
            return False, None
        self.i += 1
        return True, object()


class StreamRunnerTests(unittest.TestCase):
    def test_ingest_body_is_events_only(self):
        body = build_ingest_body(
            [{"event_type": "counter_interaction", "track_id": "1"}],
            clip_reference="/uploads/watch/tenant-1/clip.mp4",
        )
        self.assertEqual(
            set(body.keys()),
            {"events", "matchWindowMinutes", "clipReference"},
        )
        self.assertFalse(ingest_body_contains_video(body))
        dumped = json.dumps(body)
        self.assertNotIn("videoBytes", dumped)
        self.assertNotIn("base64", dumped)

    def test_rejects_video_bytes_on_ingest_shape(self):
        self.assertTrue(ingest_body_contains_video({
            "events": [],
            "videoBytes": "AAAA",
        }))

    def test_file_as_stream_emits_events_from_sample_detections(self):
        root = Path(__file__).resolve().parents[1]
        payload = run_stream_session(
            detections_path=root / "examples" / "sample_detections.json",
            zones_path=root / "examples" / "zones.json",
            dwell_seconds=6,
        )
        types = [event["event_type"] for event in payload["events"]]
        self.assertIn("counter_interaction", types)
        body = build_ingest_body(payload["events"])
        self.assertFalse(ingest_body_contains_video(body))
        self.assertTrue(should_upload_snippet(payload["events"]))

    def test_mocked_capture_samples_at_requested_fps(self):
        frames = list(iter_sampled_frames(FakeCapture(n=10, fps=10), sample_fps=5, max_seconds=1))
        self.assertGreaterEqual(len(frames), 4)
        self.assertLessEqual(frames[-1]["t"], 1.0)

    def test_live_url_detection(self):
        self.assertTrue(is_live_url("rtsp://192.168.1.20/stream"))
        self.assertFalse(is_live_url("/tmp/shop.mp4"))


if __name__ == "__main__":
    unittest.main()
