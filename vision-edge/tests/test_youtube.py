import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.youtube import is_youtube_url


class YoutubeUrlTests(unittest.TestCase):
    def test_accepts_watch_and_short_links(self):
        self.assertTrue(is_youtube_url("https://www.youtube.com/watch?v=jNItxZoc2pg"))
        self.assertTrue(is_youtube_url("https://youtu.be/jNItxZoc2pg"))
        self.assertTrue(is_youtube_url("https://m.youtube.com/watch?v=jNItxZoc2pg"))

    def test_rejects_local_paths(self):
        self.assertFalse(is_youtube_url("vision-edge/videos/shop-test.mp4"))
        self.assertFalse(is_youtube_url("https://example.com/clip.mp4"))
        self.assertFalse(is_youtube_url(""))

    def test_renames_extensionless_download(self):
        import tempfile
        from abs_vision.youtube import _find_downloaded
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            bare = dest / "abc123"
            bare.write_bytes(b"fake-mp4")
            found = _find_downloaded(dest, "abc123")
            self.assertEqual(found, dest / "abc123.mp4")
            self.assertTrue(found.exists())



if __name__ == "__main__":
    unittest.main()
