import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.reid import cosine_similarity, rewrite_track_ids
from abs_vision.process import compact_detection_frames


def _embedder(vectors):
    def embed(detection, _frame):
        return vectors.get(str(detection.get("track_id")))
    return embed


class ReidTests(unittest.TestCase):
    def test_cosine_similarity(self):
        self.assertAlmostEqual(cosine_similarity([1, 0, 0], [1, 0, 0]), 1.0)
        self.assertAlmostEqual(cosine_similarity([1, 0], [0, 1]), 0.0)
        self.assertEqual(cosine_similarity(None, [1]), 0.0)

    def test_similar_embeddings_merge_two_yolo_ids(self):
        frames = [
            {
                "t": 0.0,
                "detections": [{"track_id": "3", "bbox": [0.1, 0.2, 0.3, 0.8], "confidence": 0.9}],
            },
            {"t": 0.4, "detections": []},
            {
                "t": 1.0,
                "detections": [{"track_id": "9", "bbox": [0.12, 0.22, 0.32, 0.82], "confidence": 0.88}],
            },
        ]
        rewritten = rewrite_track_ids(
            frames,
            embedder=_embedder({
                "3": [1.0, 0.0, 0.0],
                "9": [0.99, 0.01, 0.0],
            }),
        )
        ids = {
            detection["track_id"]
            for frame in rewritten
            for detection in frame["detections"]
        }
        self.assertEqual(len(ids), 1)
        self.assertNotIn("embedding", rewritten[0]["detections"][0])
        compacted = compact_detection_frames(rewritten)
        self.assertNotIn("embedding", compacted[0]["detections"][0])
        self.assertEqual(compacted[0]["detections"][0]["track_id"], compacted[2]["detections"][0]["track_id"])

    def test_dissimilar_embeddings_stay_two_people(self):
        frames = [
            {
                "t": 0.0,
                "detections": [{"track_id": "3", "bbox": [0.1, 0.2, 0.3, 0.8], "confidence": 0.9}],
            },
            {
                "t": 1.0,
                "detections": [{"track_id": "9", "bbox": [0.6, 0.2, 0.8, 0.8], "confidence": 0.88}],
            },
        ]
        rewritten = rewrite_track_ids(
            frames,
            embedder=_embedder({
                "3": [1.0, 0.0, 0.0],
                "9": [0.0, 1.0, 0.0],
            }),
        )
        ids = {
            detection["track_id"]
            for frame in rewritten
            for detection in frame["detections"]
        }
        self.assertEqual(len(ids), 2)

    def test_without_embedder_keeps_yolo_ids(self):
        frames = [
            {
                "t": 0.0,
                "detections": [{"track_id": "7", "bbox": [0.1, 0.2, 0.3, 0.8], "confidence": 0.9}],
            },
        ]
        rewritten = rewrite_track_ids(frames, embedder=None)
        self.assertEqual(rewritten[0]["detections"][0]["track_id"], "7")


if __name__ == "__main__":
    unittest.main()
