import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.clips import clips_url_from_post, snippet_start_seconds, stamp_events_clip_reference


class WatchClipsTests(unittest.TestCase):
    def test_clips_url_from_events_post(self):
        self.assertEqual(
            clips_url_from_post("http://localhost:5002/api/watch/events"),
            "http://localhost:5002/api/watch/clips",
        )

    def test_snippet_starts_near_first_counter_interaction(self):
        start = snippet_start_seconds(
            [
                {
                    "event_type": "counter_interaction",
                    "started_at": "2026-08-30T10:32:08.000Z",
                }
            ],
            start_time="2026-08-30T10:32:00.000Z",
            lead_in=2.0,
        )
        self.assertEqual(start, 6.0)

    def test_stamps_clip_reference_on_events(self):
        events = stamp_events_clip_reference(
            [{"event_type": "counter_interaction"}],
            "/uploads/watch/tenant-1/clip.mp4",
        )
        self.assertEqual(events[0]["clip_reference"], "/uploads/watch/tenant-1/clip.mp4")
        self.assertEqual(events[0]["clipReference"], "/uploads/watch/tenant-1/clip.mp4")


if __name__ == "__main__":
    unittest.main()
