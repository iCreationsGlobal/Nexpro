#!/usr/bin/env python3
"""Process a phone MP4, YouTube URL, or detections JSON into ABS Watch events.

Examples:
  python process_mp4.py --detections examples/sample_detections.json --zones examples/zones.json --out events.json
  python process_mp4.py --video shop.mp4 --zones examples/zones.json --yolo --start-time 2026-08-30T10:30:00
  python process_mp4.py --youtube 'https://www.youtube.com/watch?v=jNItxZoc2pg' --zones examples/zones.youtube.json --max-seconds 20
  python process_mp4.py --detections examples/sample_detections.json --zones examples/zones.json \\
    --post http://localhost:5002/api/watch/events --email you@example.com --password 'your-password'
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abs_vision.process import login_for_ingest, post_events, process_source, sanitize_cli_secret, write_events
from abs_vision.youtube import download_youtube, ffmpeg_available, is_youtube_url
from abs_vision.clips import (
    clips_url_from_post,
    cut_snippet,
    snippet_start_seconds,
    stamp_events_clip_reference,
    upload_clip,
)

REPO_ROOT = ROOT.parent


def resolve_path(value, *, must_exist=True):
    """Resolve a path from cwd, vision-edge/, or the repo root.

    Lets the same command work from Nexpro/ or Nexpro/Backend/.
    """
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
        raise SystemExit(missing_file_message(value))
    return raw.resolve()


def missing_file_message(value):
    text = str(value)
    lowered = text.lower()
    lines = [f"File not found: {value}"]
    if lowered.endswith(".mp4") or "video" in lowered:
        dest = ROOT / "videos" / "shop-test.mp4"
        lines.extend([
            "This repo does not ship a camera recording. Copy your MP4 in first, or pass a YouTube URL:",
            f"  mkdir -p {ROOT / 'videos'}",
            f"  cp /path/to/your-recording.mp4 {dest}",
            "  python3 vision-edge/process_mp4.py --youtube 'https://www.youtube.com/watch?v=VIDEO_ID' --zones vision-edge/examples/zones.youtube.json --max-seconds 20",
            "Until then, use sample detections (no YOLO / no camera):",
            "  python3 vision-edge/process_mp4.py --detections vision-edge/examples/sample_detections.json --zones vision-edge/examples/zones.json --out events.json",
        ])
    else:
        lines.extend([
            "vision-edge lives in the repo root (Nexpro/vision-edge), not inside Backend.",
            "From Backend run: python3 ../vision-edge/process_mp4.py --detections examples/sample_detections.json --zones examples/zones.json --out events.json",
            "From the repo root run: python3 vision-edge/process_mp4.py --detections vision-edge/examples/sample_detections.json --zones vision-edge/examples/zones.json --out events.json",
        ])
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description="ABS Vision Edge — local video to business events")
    parser.add_argument("--video", help="Phone MP4, or a YouTube URL")
    parser.add_argument("--youtube", help="YouTube URL to download (first --max-seconds) and run YOLO on")
    parser.add_argument("--detections", help="Precomputed detections JSON (no YOLO required)")
    parser.add_argument("--zones", required=True, help="Zone config JSON")
    parser.add_argument("--start-time", help="Wall-clock start of the recording (ISO-8601)")
    parser.add_argument("--dwell-seconds", type=float, default=6.0)
    parser.add_argument("--max-seconds", type=float, default=30, help="Only process the first N seconds of a video or YouTube clip")
    parser.add_argument("--sample-fps", type=float, default=5, help="YOLO sample rate (lower is faster)")
    parser.add_argument("--out", default="events.json")
    parser.add_argument("--yolo", action="store_true", help="Run a local YOLO model on --video")
    parser.add_argument("--yolo-model", default="yolov8n.pt")
    parser.add_argument("--post", help="ABS Watch ingest URL")
    parser.add_argument("--token", help="ABS JWT from browser Local Storage (`token`)")
    parser.add_argument(
        "--email",
        default=os.environ.get("ABS_WATCH_EMAIL"),
        help="ABS login email (or set ABS_WATCH_EMAIL)",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("ABS_WATCH_PASSWORD"),
        help="ABS login password (or set ABS_WATCH_PASSWORD — avoids macOS curly quotes)",
    )
    parser.add_argument("--tenant-id", help="Workspace id for x-tenant-id (optional if the account has a default tenant)")
    parser.add_argument("--match-window-minutes", type=int, default=5)
    args = parser.parse_args(argv)

    detections_path = resolve_path(args.detections) if args.detections else None
    youtube_url = args.youtube or (args.video if is_youtube_url(args.video) else None)
    video_path = None
    use_yolo = args.yolo
    max_seconds = args.max_seconds if youtube_url or args.video else None
    sample_fps = args.sample_fps if youtube_url or args.yolo else None

    if youtube_url:
        print(json.dumps({
            "downloading": youtube_url,
            "max_seconds": args.max_seconds,
            "cache": str(ROOT / "videos" / "youtube"),
        }))
        video_path = download_youtube(youtube_url, ROOT / "videos" / "youtube", max_seconds=args.max_seconds)
        use_yolo = True
        print(json.dumps({"downloaded": str(video_path)}))
    elif args.video:
        video_path = resolve_path(args.video)

    zones_path = resolve_path(args.zones)

    payload = process_source(
        detections_path=detections_path,
        video_path=video_path,
        zones_path=zones_path,
        start_time=args.start_time,
        dwell_seconds=args.dwell_seconds,
        use_yolo=use_yolo,
        yolo_model=args.yolo_model,
        max_seconds=max_seconds,
        sample_fps=sample_fps,
    )
    write_events(payload, args.out)
    print(json.dumps({"wrote": args.out, "event_count": payload["event_count"]}, indent=2))

    if args.post:
        token = args.token
        tenant_id = args.tenant_id
        email = sanitize_cli_secret(args.email)
        password = sanitize_cli_secret(args.password)
        if email or password:
            if not (email and password):
                raise SystemExit("--email and --password must be used together")
            token, logged_in_tenant = login_for_ingest(args.post, email, password)
            tenant_id = tenant_id or logged_in_tenant
        elif not token:
            raise SystemExit("With --post, pass --token (real JWT) or --email and --password")
        clip_reference = None
        if video_path:
            if not ffmpeg_available():
                print(json.dumps({
                    "clip_upload": "skipped",
                    "reason": "ffmpeg is not installed. Events will post without a shop clip.",
                }))
            else:
                snippet_path = Path(os.environ.get("TMPDIR") or "/tmp") / f"watch-snippet-{os.getpid()}.mp4"
                try:
                    start_seconds = snippet_start_seconds(payload.get("events"), args.start_time)
                    cut_snippet(video_path, snippet_path, start_seconds=start_seconds, duration=10)
                    clip_reference = upload_clip(
                        clips_url_from_post(args.post),
                        token,
                        snippet_path,
                        tenant_id=tenant_id,
                    )
                    payload["events"] = stamp_events_clip_reference(payload.get("events"), clip_reference)
                    payload["clip_reference"] = clip_reference
                    print(json.dumps({"clip_upload": clip_reference}))
                except Exception as exc:
                    print(json.dumps({
                        "clip_upload": "skipped",
                        "reason": str(exc),
                    }))
                finally:
                    try:
                        snippet_path.unlink(missing_ok=True)
                    except OSError:
                        pass
        result = post_events(
            payload,
            args.post,
            token,
            args.match_window_minutes,
            tenant_id=tenant_id,
            clip_reference=clip_reference,
        )
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
