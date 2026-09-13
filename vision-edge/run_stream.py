#!/usr/bin/env python3
"""Always-on shop camera → local YOLO → ABS Watch events (no live video to the API).

Run this on a shop PC (or this machine). ABS stores events and optional short clips.

Examples:
  python3 vision-edge/run_stream.py --stream 'rtsp://192.168.1.20/stream' \\
    --zones vision-edge/examples/zones.json \\
    --post http://localhost:5000/api/watch/events --email you@example.com --password 'secret'

  # File as stream (tests / no RTSP):
  python3 vision-edge/run_stream.py --stream vision-edge/videos/shop-test.mp4 --once \\
    --zones vision-edge/examples/zones.json --yolo --max-seconds 15

  python3 vision-edge/run_stream.py --detections vision-edge/examples/sample_detections.json \\
    --zones vision-edge/examples/zones.json --once --out events.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abs_vision.clips import (
    clips_url_from_post,
    cut_snippet,
    snippet_start_seconds,
    stamp_events_clip_reference,
    upload_clip,
)
from abs_vision.process import login_for_ingest, post_events, sanitize_cli_secret, write_events
from abs_vision.stream import (
    build_ingest_body,
    ingest_body_contains_video,
    is_live_url,
    run_stream_session,
    should_upload_snippet,
)
from abs_vision.youtube import ffmpeg_available

REPO_ROOT = ROOT.parent


def resolve_path(value, *, must_exist=True):
    if not value:
        return value
    raw = Path(value)
    candidates = [raw]
    if not raw.is_absolute():
        candidates.extend([
            Path.cwd() / raw,
            ROOT / raw,
            REPO_ROOT / raw,
        ])
        if raw.parts and raw.parts[0] == "vision-edge":
            candidates.append(ROOT.joinpath(*raw.parts[1:]))
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.exists():
            return resolved
    if must_exist:
        raise SystemExit(f"File not found: {value}")
    return raw.resolve()


def maybe_upload_snippet(source, events, start_time, token, tenant_id, post_url):
    if not should_upload_snippet(events):
        return None
    if is_live_url(source):
        if not ffmpeg_available():
            print(json.dumps({
                "clip_upload": "skipped",
                "reason": "ffmpeg is not installed. Events will post without a shop clip.",
            }))
            return None
        snippet_path = Path(os.environ.get("TMPDIR") or "/tmp") / f"watch-live-snippet-{os.getpid()}.mp4"
        try:
            cut_snippet(source, snippet_path, start_seconds=0, duration=10)
            clip_reference = upload_clip(
                clips_url_from_post(post_url),
                token,
                snippet_path,
                tenant_id=tenant_id,
            )
            print(json.dumps({"clip_upload": clip_reference}))
            return clip_reference
        except Exception as exc:
            print(json.dumps({"clip_upload": "skipped", "reason": str(exc)}))
            return None
        finally:
            try:
                snippet_path.unlink(missing_ok=True)
            except OSError:
                pass

    video_path = Path(str(source)) if source else None
    if not video_path or not video_path.exists():
        print(json.dumps({
            "clip_upload": "skipped",
            "reason": "No local file to cut a snippet from.",
        }))
        return None
    if not ffmpeg_available():
        print(json.dumps({
            "clip_upload": "skipped",
            "reason": "ffmpeg is not installed. Events will post without a shop clip.",
        }))
        return None
    snippet_path = Path(os.environ.get("TMPDIR") or "/tmp") / f"watch-stream-snippet-{os.getpid()}.mp4"
    try:
        start_seconds = snippet_start_seconds(events, start_time)
        cut_snippet(video_path, snippet_path, start_seconds=start_seconds, duration=10)
        clip_reference = upload_clip(
            clips_url_from_post(post_url),
            token,
            snippet_path,
            tenant_id=tenant_id,
        )
        print(json.dumps({"clip_upload": clip_reference}))
        return clip_reference
    except Exception as exc:
        print(json.dumps({"clip_upload": "skipped", "reason": str(exc)}))
        return None
    finally:
        try:
            snippet_path.unlink(missing_ok=True)
        except OSError:
            pass


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="ABS Watch — local camera stream to events (video stays on this machine until a short snippet upload)"
    )
    parser.add_argument("--stream", "--rtsp", dest="stream", help="rtsp://, http(s) camera URL, or a local MP4")
    parser.add_argument("--detections", help="Precomputed detections JSON (no YOLO / no camera)")
    parser.add_argument("--zones", required=True, help="Zone config JSON")
    parser.add_argument("--start-time", help="Wall-clock start (ISO-8601). Default: now (UTC)")
    parser.add_argument("--dwell-seconds", type=float, default=6.0)
    parser.add_argument("--max-seconds", type=float, help="Seconds per window (file default 30, live chunk default 15)")
    parser.add_argument("--sample-fps", type=float, default=5)
    parser.add_argument("--out", help="Write last window JSON (optional)")
    parser.add_argument("--yolo", action="store_true", help="Run local YOLO (default when --stream is set)")
    parser.add_argument("--yolo-model", default="yolov8n.pt")
    parser.add_argument("--once", action="store_true", help="Process one window and exit (files do this by default)")
    parser.add_argument("--loop-seconds", type=float, default=1.0, help="Pause between live windows")
    parser.add_argument("--post", help="ABS Watch ingest URL")
    parser.add_argument("--token", help="ABS JWT from browser Local Storage (`token`)")
    parser.add_argument("--email", default=os.environ.get("ABS_WATCH_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("ABS_WATCH_PASSWORD"))
    parser.add_argument("--tenant-id", help="Workspace id for x-tenant-id")
    parser.add_argument("--match-window-minutes", type=int, default=5)
    args = parser.parse_args(argv)

    if not args.stream and not args.detections:
        raise SystemExit("Pass --stream (camera URL or MP4) or --detections JSON")

    detections_path = resolve_path(args.detections) if args.detections else None
    source = args.stream
    if source and not is_live_url(source):
        source = str(resolve_path(source))

    zones_path = resolve_path(args.zones)
    live = is_live_url(args.stream)
    once = args.once or (not live) or bool(detections_path)
    window_seconds = args.max_seconds
    if window_seconds is None:
        window_seconds = 15 if live else 30

    token = args.token
    tenant_id = args.tenant_id
    if args.post:
        email = sanitize_cli_secret(args.email)
        password = sanitize_cli_secret(args.password)
        if email or password:
            if not (email and password):
                raise SystemExit("--email and --password must be used together")
            token, logged_in_tenant = login_for_ingest(args.post, email, password)
            tenant_id = tenant_id or logged_in_tenant
        elif not token:
            raise SystemExit("With --post, pass --token (real JWT) or --email and --password")

    use_yolo = bool(args.yolo or (source and not detections_path))

    while True:
        start_time = args.start_time or datetime.now(timezone.utc).isoformat()
        payload = run_stream_session(
            source=source,
            detections_path=detections_path,
            zones_path=zones_path,
            start_time=start_time,
            dwell_seconds=args.dwell_seconds,
            use_yolo=use_yolo,
            yolo_model=args.yolo_model,
            max_seconds=window_seconds,
            sample_fps=args.sample_fps,
        )
        if args.out:
            write_events(payload, args.out)

        clip_reference = None
        if args.post and source:
            clip_reference = maybe_upload_snippet(
                source,
                payload.get("events") or [],
                start_time,
                token,
                tenant_id,
                args.post,
            )
            if clip_reference:
                payload["events"] = stamp_events_clip_reference(payload.get("events"), clip_reference)
                payload["clip_reference"] = clip_reference

        body = build_ingest_body(
            payload.get("events") or [],
            clip_reference=clip_reference,
            match_window_minutes=args.match_window_minutes,
        )
        if ingest_body_contains_video(body):
            raise SystemExit("Refusing to post video bytes. Watch ingest is events only.")

        print(json.dumps({
            "window_start": start_time,
            "event_count": payload.get("event_count") or 0,
            "posted": bool(args.post),
            "clip_reference": clip_reference,
        }))

        if args.post:
            result = post_events(
                payload,
                args.post,
                token,
                args.match_window_minutes,
                tenant_id=tenant_id,
                clip_reference=clip_reference,
            )
            print(json.dumps(result, indent=2))

        if once:
            break
        time.sleep(max(0.2, float(args.loop_seconds or 1)))


if __name__ == "__main__":
    main()
