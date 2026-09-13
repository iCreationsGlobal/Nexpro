from __future__ import annotations

import json


FORBIDDEN_INGEST_KEYS = {
    "video",
    "videoBytes",
    "video_bytes",
    "frames",
    "image",
    "base64",
    "mp4",
}


def is_live_url(source):
    text = str(source or "").strip().lower()
    return text.startswith(("rtsp://", "rtsps://", "http://", "https://"))


def build_ingest_body(events, clip_reference=None, match_window_minutes=5):
    """JSON posted to /api/watch/events. Events + optional clip URL — never video bytes."""
    body = {
        "events": list(events or []),
        "matchWindowMinutes": int(match_window_minutes or 5),
    }
    if clip_reference:
        body["clipReference"] = clip_reference
    return body


def ingest_body_contains_video(body):
    """True when a payload looks like it is smuggling frames or encoded video."""
    if not isinstance(body, dict):
        return True
    if FORBIDDEN_INGEST_KEYS.intersection(body.keys()):
        return True
    dumped = json.dumps(body)
    if '"videoBytes"' in dumped or '"base64"' in dumped:
        return True
    return False


def should_upload_snippet(events):
    for event in events or []:
        event_type = event.get("event_type") or event.get("eventType")
        if event_type == "counter_interaction":
            return True
    return False


def iter_sampled_frames(capture, sample_fps=5, max_seconds=None):
    """Yield {t, ok} from an OpenCV-like capture. Tests pass a fake capture."""
    cap_fps = 0.0
    getter = getattr(capture, "get", None)
    if callable(getter):
        try:
            cap_fps = float(getter(5) or 0)
        except Exception:
            cap_fps = 0.0
    fps = cap_fps if cap_fps > 1 else 25.0
    target = float(sample_fps or fps)
    stride = max(1, int(round(fps / target)))
    index = 0
    kept = 0
    while True:
        ok, _frame = capture.read()
        if not ok:
            break
        if index % stride != 0:
            index += 1
            continue
        t = kept / target
        if max_seconds is not None and t >= float(max_seconds):
            break
        yield {"t": t}
        kept += 1
        index += 1


def run_stream_session(
    *,
    source=None,
    detections_path=None,
    zones_path,
    start_time=None,
    dwell_seconds=6.0,
    use_yolo=True,
    yolo_model="yolov8n.pt",
    max_seconds=None,
    sample_fps=5,
):
    """One window: YOLO or detections JSON → events. Same shape as process_mp4."""
    from .process import process_source

    return process_source(
        detections_path=detections_path,
        video_path=None if detections_path else source,
        zones_path=zones_path,
        start_time=start_time,
        dwell_seconds=dwell_seconds,
        use_yolo=False if detections_path else use_yolo,
        yolo_model=yolo_model,
        max_seconds=max_seconds,
        sample_fps=sample_fps,
    )
