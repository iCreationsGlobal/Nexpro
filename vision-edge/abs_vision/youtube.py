"""Download a short YouTube clip for local YOLO. Never sent to an LLM."""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path
from urllib.parse import urlparse

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}


def is_youtube_url(value):
    if not value:
        return False
    text = str(value).strip()
    if not text.startswith(("http://", "https://")):
        return False
    host = (urlparse(text).hostname or "").lower()
    if host in YOUTUBE_HOSTS:
        return True
    return host.endswith(".youtube.com")


def _cache_path(dest_dir, url, max_seconds):
    key = hashlib.sha1(f"{url}|{max_seconds}".encode("utf-8")).hexdigest()[:12]
    return dest_dir / f"{key}.mp4"


def _find_downloaded(dest_dir, stem):
    dest_dir = Path(dest_dir)
    preferred = dest_dir / f"{stem}.mp4"
    if preferred.exists() and preferred.stat().st_size > 0:
        return preferred
    bare = dest_dir / stem
    if bare.exists() and bare.stat().st_size > 0:
        bare.rename(preferred)
        return preferred
    for match in sorted(dest_dir.glob(f"{stem}.*")):
        if match.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"} and match.stat().st_size > 0:
            return match
    return None


def download_youtube(url, dest_dir, max_seconds=30):
    """
    Download the first `max_seconds` of a YouTube video to dest_dir.

    Requires yt-dlp (`pip3 install yt-dlp`). ffmpeg is used when available
    so long videos are not fully downloaded.
    """
    if not is_youtube_url(url):
        raise ValueError(f"Not a YouTube URL: {url}")

    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    cached = _cache_path(dest_dir, url, max_seconds)
    existing = _find_downloaded(dest_dir, cached.stem)
    if existing:
        return existing

    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError(
            "yt-dlp is not installed. From the repo root run:\n"
            "  pip3 install yt-dlp\n"
            "Then retry with --youtube <url>."
        ) from exc

    ydl_opts = {
        "format": (
            "bv*[height<=480][ext=mp4]+ba[ext=m4a]/"
            "b[height<=480][ext=mp4]/"
            "bv*[height<=720]+ba/"
            "b[height<=720]"
        ),
        "outtmpl": str(dest_dir / f"{cached.stem}.%(ext)s"),
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": False,
        "noprogress": False,
        "overwrites": True,
        # YouTube often blocks the default web client (SABR / "reload the page").
        "extractor_args": {"youtube": {"player_client": ["android", "ios", "tv", "web"]}},
    }
    if max_seconds and shutil.which("ffmpeg"):
        ydl_opts["download_ranges"] = yt_dlp.utils.download_range_func(None, [(0, float(max_seconds))])
        ydl_opts["force_keyframes_at_cuts"] = True

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as exc:
        raise RuntimeError(
            "YouTube download failed. yt-dlp needs a recent build because YouTube changes often.\n"
            "  python3 -m pip install -U yt-dlp\n"
            "If it still fails, download the MP4 in a browser and pass --video /path/to/clip.mp4 --yolo.\n"
            f"Original error: {exc}"
        ) from exc

    found = _find_downloaded(dest_dir, cached.stem)
    if found:
        return found
    raise RuntimeError(f"yt-dlp finished but no video file was found in {dest_dir}")


def ffmpeg_available():
    return bool(shutil.which("ffmpeg"))
