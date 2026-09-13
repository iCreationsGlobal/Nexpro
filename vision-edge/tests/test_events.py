import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.events import build_events
from abs_vision.process import process_source

TILL = {"name": "counter", "type": "counter", "x": 0.60, "y": 0.50, "w": 0.28, "h": 0.40}


def _box(cx, cy, w=0.10, h=0.30):
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]


class EventEngineTests(unittest.TestCase):
    def test_linger_still_in_till_emits_interaction(self):
        bbox = {"track_id": "A37", "bbox": _box(0.72, 0.70), "confidence": 0.9}
        frames = [{"t": float(second), "detections": [bbox]} for second in range(0, 8)]
        events = build_events(frames, [TILL], start_time="2026-08-30T10:32:00")
        types = [event["event_type"] for event in events]
        self.assertIn("person_entered", types)
        self.assertIn("person_entered_counter_zone", types)
        self.assertIn("counter_interaction", types)
        interaction = next(event for event in events if event["event_type"] == "counter_interaction")
        self.assertEqual(interaction["track_id"], "A37")
        self.assertGreaterEqual(interaction["attributes"]["dwell_seconds"], 6)

    def test_walk_through_is_person_entered_only(self):
        """Crossing the till while moving must not count as till linger."""
        frames = []
        for second in range(0, 8):
            cx = 0.62 + second * 0.04
            frames.append({
                "t": float(second),
                "detections": [{"track_id": "A37", "bbox": _box(cx, 0.70), "confidence": 0.9}],
            })
        events = build_events(frames, [TILL], start_time="2026-08-30T10:32:00")
        types = [event["event_type"] for event in events]
        self.assertIn("person_entered", types)
        self.assertNotIn("counter_interaction", types)

    def test_brief_till_clip_without_dwell_is_not_an_interaction(self):
        frames = [
            {"t": 0.0, "detections": [{"track_id": "A37", "bbox": _box(0.20, 0.70), "confidence": 0.9}]},
            {"t": 1.0, "detections": [{"track_id": "A37", "bbox": _box(0.72, 0.70), "confidence": 0.9}]},
            {"t": 2.0, "detections": [{"track_id": "A37", "bbox": _box(0.20, 0.70), "confidence": 0.9}]},
        ]
        events = build_events(frames, [TILL], start_time="2026-08-30T10:32:00")
        types = [event["event_type"] for event in events]
        self.assertIn("person_entered", types)
        self.assertNotIn("counter_interaction", types)

    def test_sample_file_pipeline(self):
        root = Path(__file__).resolve().parents[1]
        payload = process_source(
            detections_path=root / "examples" / "sample_detections.json",
            zones_path=root / "examples" / "zones.json",
        )
        types = [event["event_type"] for event in payload["events"]]
        self.assertIn("counter_interaction", types)
        self.assertTrue(all("event_id" in event for event in payload["events"]))
        self.assertIn("frames", payload)
        self.assertTrue(payload["frames"])
        box = payload["frames"][0]["detections"][0]
        self.assertEqual(len(box["bbox"]), 4)
        self.assertIn("track_id", box)
        self.assertNotIn("embedding", box)

    def test_short_hole_same_track_is_one_person_entered(self):
        """Three empty frames (~0.6s at 5 fps) must not emit a second enter."""
        zones = []
        box = {"track_id": "A37", "bbox": [0.1, 0.4, 0.2, 0.8], "confidence": 0.9}
        frames = [
            {"t": 0.0, "detections": [box]},
            {"t": 0.2, "detections": []},
            {"t": 0.4, "detections": []},
            {"t": 0.6, "detections": []},
            {"t": 0.8, "detections": [box]},
        ]
        events = build_events(frames, zones, start_time="2026-08-30T10:32:00", miss_seconds=1.5)
        entered = [event for event in events if event["event_type"] == "person_entered"]
        self.assertEqual(len(entered), 1)
        self.assertEqual(entered[0]["track_id"], "A37")
        self.assertEqual(sum(1 for event in events if event["event_type"] == "person_left"), 1)

    def test_long_gap_emits_left_then_second_enter(self):
        box = {"track_id": "A37", "bbox": [0.1, 0.4, 0.2, 0.8], "confidence": 0.9}
        frames = [
            {"t": 0.0, "detections": [box]},
            {"t": 0.8, "detections": []},
            {"t": 1.6, "detections": []},
            {"t": 2.2, "detections": [box]},
        ]
        events = build_events(frames, zones=[], start_time="2026-08-30T10:32:00", miss_seconds=1.5)
        entered = [event for event in events if event["event_type"] == "person_entered"]
        self.assertEqual(len(entered), 2)


if __name__ == "__main__":
    unittest.main()
