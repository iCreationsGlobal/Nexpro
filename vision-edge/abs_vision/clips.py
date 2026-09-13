"""Cut and upload a short Watch snippet. Video is never sent to an LLM."""

from __future__ import annotations

import json
import subprocess
import uuid
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .youtube import ffmpeg_available


def clips_url_from_post(post_url):
    """http://host/api/watch/events → http://host/api/watch/clips"""
    parsed = urllib.parse.urlparse(post_url)
    path = parsed.path.rstrip("/")
    if path.endswith("/events"):
        path = f"{path[: -len('/events')]}/clips"
    else:
        path = "/api/watch/clips"
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def _parse_iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def snippet_start_seconds(events, start_time=None, lead_in=2.0):
    """Seconds into the video near the first counter_interaction, else 0."""
    origin = _parse_iso(start_time)
    if origin is None:
        return 0.0
    for event in events or []:
        if event.get("event_type") != "counter_interaction":
            continue
        started = _parse_iso(event.get("started_at"))
        if started is None:
            continue
        return max(0.0, (started - origin).total_seconds() - float(lead_in))
    return 0.0


def cut_snippet(video_path, dest_path, start_seconds=0, duration=10):
    """Write a short MP4 snippet with ffmpeg. Raises if ffmpeg is missing."""
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg is not installed")
    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-ss",
        str(float(start_seconds or 0)),
        "-i",
        str(video_path),
        "-t",
        str(float(duration or 10)),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(dest),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0 or not dest.exists() or dest.stat().st_size <= 0:
        detail = (completed.stderr or completed.stdout or "").strip()[-400]
        raise RuntimeError(detail or "ffmpeg failed to cut a snippet")
    return dest


def upload_clip(clips_url, token, file_path, tenant_id=None):
    """POST multipart file to /api/watch/clips. Returns clipUrl."""
    path = Path(file_path)
    file_bytes = path.read_bytes()
    boundary = f"----AbsWatchClip{uuid.uuid4().hex}"
    filename = path.name.replace('"', "")
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: video/mp4\r\n\r\n"
    ).encode("utf-8")
    footer = f"\r\n--{boundary}--\r\n".encode("utf-8")
    body = header + file_bytes + footer
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": f"Bearer {token}",
    }
    if tenant_id:
        headers["x-tenant-id"] = str(tenant_id)
    request = urllib.request.Request(clips_url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Watch clip upload failed ({exc.code}): {detail}") from exc
    data = payload.get("data") or payload
    clip_url = data.get("clipUrl") or data.get("clipReference")
    if not clip_url:
        raise RuntimeError("Watch clip upload succeeded but no clipUrl was returned.")
    return clip_url


def stamp_events_clip_reference(events, clip_reference):
    stamped = []
    for event in events or []:
        if not isinstance(event, dict):
            stamped.append(event)
            continue
        next_event = dict(event)
        next_event["clip_reference"] = clip_reference
        next_event["clipReference"] = clip_reference
        stamped.append(next_event)
    return stamped
