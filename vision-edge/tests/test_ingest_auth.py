import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.process import is_placeholder_token, login_url_from_post, sanitize_cli_secret


class IngestAuthTests(unittest.TestCase):
    def test_docs_placeholder_is_rejected(self):
        self.assertTrue(is_placeholder_token("YOUR_JWT"))
        self.assertTrue(is_placeholder_token("your-jwt"))
        self.assertTrue(is_placeholder_token(""))
        self.assertFalse(
            is_placeholder_token("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc")
        )

    def test_login_url_from_ingest_post(self):
        self.assertEqual(
            login_url_from_post("http://localhost:5002/api/watch/events"),
            "http://localhost:5002/api/auth/login",
        )

    def test_strips_macos_curly_quotes(self):
        self.assertEqual(sanitize_cli_secret("\u2018111111@1A\u2019"), "111111@1A")
        self.assertEqual(sanitize_cli_secret("'111111@1A'"), "111111@1A")
        self.assertEqual(sanitize_cli_secret("sappiah@gmail.com"), "sappiah@gmail.com")


if __name__ == "__main__":
    unittest.main()
