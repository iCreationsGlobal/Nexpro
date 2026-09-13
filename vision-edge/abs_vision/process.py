"""MP4 / detections → ABS Watch event JSON, optionally posted to the API."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .detect import detect_with_yolo, load_detections_file
from .events import build_events
from .reid import make_production_embedder, rewrite_track_ids

PLACEHOLDER_TOKENS = {
    "your_jwt",
    "your-jwt",
    "<token>",
    "token",
    "jwt",
    "paste_token_here",
    "xxx",
}

# macOS Terminal often turns '...' into ‘...’ which then becomes part of the password.
_CLI_QUOTE_CHARS = "'\"`\u2018\u2019\u201c\u201d\u00b4"


def sanitize_cli_secret(value):
    """Strip wrapping quotes (straight or curly) so login passwords survive macOS copy-paste."""
    if value is None:
        return value
    text = str(value).strip()
    while len(text) >= 2 and text[0] in _CLI_QUOTE_CHARS and text[-1] in _CLI_QUOTE_CHARS:
        text = text[1:-1].strip()
    return text.strip(_CLI_QUOTE_CHARS + " ")


def has_smart_quotes(value):
    return any(ch in str(value or "") for ch in "\u2018\u2019\u201c\u201d")


def load_zones(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload, "cam_01"
    return payload.get("zones") or [], payload.get("camera") or "cam_01"


def compact_detection_frames(frames):
    """Keep overlay fields only: t + track_id + bbox + confidence. No images."""
    compacted = []
    for frame in frames or []:
        detections = []
        for detection in frame.get("detections") or []:
            track_id = detection.get("track_id")
            if track_id is None:
                track_id = detection.get("id")
            bbox = detection.get("bbox") or detection.get("box")
            if track_id is None or not bbox or len(bbox) < 4:
                continue
            detections.append({
                "track_id": str(track_id),
                "bbox": [float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])],
                "confidence": round(float(detection.get("confidence") or 0), 4),
            })
        t = frame.get("t")
        if t is None and "frame" in frame:
            t = frame.get("frame")
        compacted.append({
            "t": float(t or 0),
            "detections": detections,
        })
    return compacted


def process_source(
    *,
    detections_path=None,
    video_path=None,
    zones_path,
    start_time=None,
    dwell_seconds=6.0,
    use_yolo=False,
    yolo_model="yolov8n.pt",
    max_seconds=None,
    sample_fps=None,
    miss_seconds=1.5,
    embedder=None,
):
    zones, camera = load_zones(zones_path)
    if detections_path:
        bundle = load_detections_file(detections_path)
    elif use_yolo and video_path:
        bundle = detect_with_yolo(
            video_path,
            model_name=yolo_model,
            max_seconds=max_seconds,
            sample_fps=sample_fps,
        )
    else:
        raise ValueError("Provide --detections JSON, --youtube URL, or --video with --yolo after installing ultralytics.")

    frames = bundle.get("frames") or []
    active_embedder = embedder
    if active_embedder is None and use_yolo and video_path:
        has_vectors = any(
            (detection.get("embedding") or detection.get("_embedding")) is not None
            for frame in frames
            for detection in (frame.get("detections") or [])
        )
        if not has_vectors:
            active_embedder = make_production_embedder(video_path)
    frames = rewrite_track_ids(frames, embedder=active_embedder)

    events = build_events(
        frames,
        zones,
        start_time=start_time or bundle.get("start_time"),
        fps=bundle.get("fps") or 10,
        dwell_seconds=dwell_seconds,
        camera=camera,
        miss_seconds=miss_seconds,
    )
    return {
        "camera": camera,
        "event_count": len(events),
        "events": events,
        "fps": bundle.get("fps") or 10,
        "frames": compact_detection_frames(frames),
    }


def write_events(payload, output_path):
    Path(output_path).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def is_placeholder_token(token):
    """True when the caller left the docs placeholder instead of a real JWT."""
    if not token or not str(token).strip():
        return True
    value = str(token).strip()
    if value.lower() in PLACEHOLDER_TOKENS:
        return True
    compact = value.replace("-", "_").lower()
    if "your" in compact and "jwt" in compact:
        return True
    return value.count(".") < 2


def login_url_from_post(post_url):
    parsed = urllib.parse.urlparse(post_url)
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/api/auth/login", "", "", ""))


def login_for_ingest(post_url, email, password):
    """Exchange ABS email/password for a JWT and default tenant id."""
    email = sanitize_cli_secret(email)
    raw_password = password
    password = sanitize_cli_secret(password)
    url = login_url_from_post(post_url)
    body = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        hint = ""
        if exc.code == 401:
            hint = (
                "\nUse straight quotes around the password, e.g. --password '111111@1A'. "
                "macOS often turns those into curly quotes, which ABS treats as part of the password."
            )
            if has_smart_quotes(raw_password):
                hint += " Curly quotes were detected in the value you passed."
        raise RuntimeError(f"ABS login failed ({exc.code}): {detail}{hint}") from exc

    data = payload.get("data") or {}
    token = data.get("token")
    tenant_id = data.get("defaultTenantId")
    if not token:
        raise RuntimeError("ABS login succeeded but no token was returned.")
    return token, tenant_id


def post_events(payload, url, token, match_window_minutes=5, tenant_id=None, clip_reference=None):
    if is_placeholder_token(token):
        raise RuntimeError(
            "ABS ingest needs a real JWT, not the placeholder YOUR_JWT.\n"
            "Option A: log in to ABS in the browser, DevTools → Application → Local Storage → copy `token`.\n"
            "Option B: pass --email and --password so this script logs in for you."
        )

    clip_reference = clip_reference or payload.get("clipReference") or payload.get("clip_reference")
    body_payload = {
        "events": payload.get("events") or [],
        "matchWindowMinutes": match_window_minutes,
    }
    if clip_reference:
        body_payload["clipReference"] = clip_reference
    body = json.dumps(body_payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if tenant_id:
        headers["x-tenant-id"] = str(tenant_id)

    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        hint = ""
        if exc.code == 401:
            hint = (
                "\nThe API rejected the token. Copy `token` from browser Local Storage while logged "
                "into the tenant app (not Control Center), or use --email / --password."
            )
        raise RuntimeError(f"ABS ingest failed ({exc.code}): {detail}{hint}") from exc
