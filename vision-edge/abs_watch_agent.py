#!/usr/bin/env python3
"""ABS Watch agent — connect this computer's cameras (or the shop's CCTV) to ABS Watch.

  1. In ABS: Watch -> Add Watch device. Copy the pairing code.
  2. python3 abs_watch_agent.py pair K7P2-9QXM
  3. python3 abs_watch_agent.py camera add --name Counter --role counter --source camera:0
       (camera:0 = this computer's camera, e.g. an iPhone via Continuity Camera;
        or a CCTV stream such as rtsp://user:pass@192.168.1.20:554/Streaming/Channels/102)
  4. python3 abs_watch_agent.py camera test Counter      # saves one frame so you can check the view
  5. python3 abs_watch_agent.py run                       # or: service install (starts with the computer)
  6. Draw the till zone in ABS Watch on the camera's snapshot.

Camera logins stay in ~/.abs-watch/agent.json on this computer.
"""

import argparse
import logging
import signal
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abs_vision.agent import AGENT_VERSION  # noqa: E402
from abs_vision.agent import service  # noqa: E402
from abs_vision.agent.api import ApiError, pair as pair_device  # noqa: E402
from abs_vision.agent.clipmaker import ffmpeg_path  # noqa: E402
from abs_vision.agent.config import CAMERA_ROLES, DEFAULT_API_BASE, AgentConfig, agent_home  # noqa: E402
from abs_vision.agent.queue import EventQueue  # noqa: E402
from abs_vision.agent.runner import AgentRunner, platform_label  # noqa: E402
from abs_vision.agent.sources import describe_source, open_capture  # noqa: E402


def setup_logging():
    home = agent_home()
    home.mkdir(parents=True, exist_ok=True)
    handlers = [logging.StreamHandler(sys.stdout), RotatingFileHandler(home / "agent.log", maxBytes=2_000_000, backupCount=3)]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=handlers)


def cmd_pair(args, config):
    api_base = (args.api or config.data.get("apiBase") or DEFAULT_API_BASE).rstrip("/")
    try:
        pairing = pair_device(api_base, args.code, agent_version=AGENT_VERSION, platform=platform_label())
    except ApiError as exc:
        raise SystemExit(f"Pairing failed: {exc}")
    # Events saved for a previous pairing can't be filed under this one
    EventQueue(agent_home() / "queue.jsonl").clear()
    config.set_pairing(api_base, pairing)
    config.save()
    print(f"Paired as \"{pairing.get('deviceName')}\".")
    if config.cameras:
        print("Your cameras will be registered with ABS when the agent runs (a running agent picks this up by itself).")
    else:
        print("Next: add a camera, e.g. `camera add --name Counter --role counter --source camera:0`.")


def cmd_camera_add(args, config):
    try:
        camera = config.add_camera(args.name, args.source, role=args.role)
    except ValueError as exc:
        raise SystemExit(str(exc))
    config.save()
    print(f"Added {camera['name']} ({camera['role']}) -> {describe_source(camera['source'])}")
    print(f"Check the view with `camera test \"{camera['name']}\"`. A running agent starts it within a minute.")


def cmd_camera_list(_args, config):
    if not config.cameras:
        print("No cameras yet. Add one with `camera add`.")
    for camera in config.cameras:
        linked = "registered" if camera.get("cameraId") else "not registered yet"
        print(f"- {camera['name']} [{camera['role']}] {describe_source(camera['source'])} ({linked}, id {camera['localId']})")


def cmd_camera_remove(args, config):
    camera = config.remove_camera(args.camera)
    if not camera:
        raise SystemExit(f"No camera called {args.camera}")
    config.save()
    print(f"Removed {camera['name']}. Its history stays in ABS.")


def cmd_camera_test(args, config):
    """Grab one frame so the owner can see what the camera sees before running."""
    import cv2

    camera = config.find_camera(args.camera)
    source = camera["source"] if camera else args.camera
    capture, _kind = open_capture(source)
    try:
        if not capture.isOpened():
            raise SystemExit(f"Can't open {describe_source(source)}. Check the address, login and network.")
        ok, frame = False, None
        for _ in range(30):  # cameras often need a few frames to settle
            ok, frame = capture.read()
            if ok and frame is not None:
                break
        if not ok or frame is None:
            raise SystemExit(f"{describe_source(source)} opened but sent no video.")
    finally:
        capture.release()
    name = (camera["name"] if camera else "camera").replace(" ", "-").lower()
    dest = agent_home() / f"test-{name}.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dest), frame)
    height, width = frame.shape[:2]
    print(f"OK: {width}x{height} from {describe_source(source)}. Saved a frame to {dest}")


def cmd_camera_probe(args, _config):
    """Which local cameras exist (camera:0, camera:1 ...)? Saves a frame from each to tell them apart."""
    import cv2

    found = 0
    for index in range(args.max):
        capture = cv2.VideoCapture(index)
        try:
            if not capture.isOpened():
                continue
            frame = None
            for _ in range(30):
                ok, frame = capture.read()
                if ok and frame is not None:
                    break
            if frame is None:
                print(f"camera:{index} opened but sent no picture (check the camera permission for this app)")
                continue
            dest = agent_home() / f"probe-camera-{index}.jpg"
            dest.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(dest), frame)
            height, width = frame.shape[:2]
            print(f"camera:{index}  {width}x{height}  -> {dest}")
            found += 1
        finally:
            capture.release()
    if not found:
        print("No local cameras found. On a Mac, allow camera access for Terminal in System Settings > Privacy & Security.")


def cmd_status(_args, config):
    print(f"Agent {AGENT_VERSION} on {platform_label()}")
    if not config.is_paired():
        print("Not paired. In ABS open Watch -> Add Watch device, then run `pair <CODE>`.")
        return
    print(f"Paired as \"{config.device_name}\" with {config.api_base}")
    cmd_camera_list(None, config)
    queued = len(EventQueue(agent_home() / "queue.jsonl"))
    if queued:
        print(f"{queued} batch(es) of events waiting to be sent")


def model_path(name):
    """Bare model names live in ~/.abs-watch/models (downloaded there on first run), not the current folder."""
    path = Path(name).expanduser()
    if path.is_file() or path.parent != Path("."):
        return str(path)
    return str(agent_home() / "models" / path.name)


def cmd_run(args, config):
    setup_logging()
    log = logging.getLogger("abs_watch")
    if not config.is_paired():
        raise SystemExit("This agent is not paired yet. In ABS open Watch -> Add Watch device, then run `pair <CODE>`.")
    try:
        from abs_vision.agent.detector import PersonTracker, load_model
    except ImportError as exc:
        raise SystemExit(str(exc))
    model = model_path(args.model)
    try:
        load_model(model)  # downloads it once, before any camera starts
    except Exception as exc:
        raise SystemExit(f"Couldn't load the person detector ({model}): {exc}")
    if not ffmpeg_path():
        log.warning("ffmpeg isn't installed: clips may not play in the browser. Install it (macOS: brew install ffmpeg).")

    def tracker_factory(camera):
        return PersonTracker(model_name=model, track_prefix=camera.get("localId", "cam")[:6])

    runner = AgentRunner(config, tracker_factory=tracker_factory)

    def handle_signal(_signum, _frame):
        log.info("Stopping...")
        runner.request_stop()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    runner.run_forever()
    log.info("Stopped")


def cmd_service(args, _config):
    if args.action == "show":
        plan = service.describe()
        print(plan.get("content") or " ".join(plan["command"]))
        return
    plan = service.install() if args.action == "install" else service.uninstall()
    print(f"Service {args.action}ed ({plan['kind']}).")


def build_parser():
    parser = argparse.ArgumentParser(prog="abs_watch_agent.py", description="ABS Watch agent")
    sub = parser.add_subparsers(dest="command", required=True)

    pair = sub.add_parser("pair", help="Pair with ABS using the code from Watch -> Add Watch device")
    pair.add_argument("code")
    pair.add_argument("--api", help=f"ABS API address (default {DEFAULT_API_BASE})")
    pair.set_defaults(func=cmd_pair)

    camera = sub.add_parser("camera", help="Cameras on this computer")
    camera_sub = camera.add_subparsers(dest="camera_command", required=True)
    add = camera_sub.add_parser("add", help="Add a camera")
    add.add_argument("--name", required=True)
    add.add_argument("--role", default="counter", choices=CAMERA_ROLES)
    add.add_argument("--source", required=True, help="camera:0, rtsp://..., http://... or a video file")
    add.set_defaults(func=cmd_camera_add)
    camera_sub.add_parser("list", help="List cameras").set_defaults(func=cmd_camera_list)
    remove = camera_sub.add_parser("remove", help="Remove a camera")
    remove.add_argument("camera")
    remove.set_defaults(func=cmd_camera_remove)
    test = camera_sub.add_parser("test", help="Save one frame from a camera")
    test.add_argument("camera", help="Camera name/id, or a source to try")
    test.set_defaults(func=cmd_camera_test)
    probe = camera_sub.add_parser("probe", help="Find this computer's cameras (camera:0, camera:1 ...)")
    probe.add_argument("--max", type=int, default=4, help="How many camera numbers to try")
    probe.set_defaults(func=cmd_camera_probe)

    run = sub.add_parser("run", help="Watch all cameras and send events to ABS")
    run.add_argument("--model", default="yolov8n.pt")
    run.set_defaults(func=cmd_run)

    sub.add_parser("status", help="Pairing, cameras and queued events").set_defaults(func=cmd_status)

    svc = sub.add_parser("service", help="Start the agent with this computer")
    svc.add_argument("action", choices=("install", "uninstall", "show"))
    svc.set_defaults(func=cmd_service)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    config = AgentConfig.load()
    args.func(args, config)


if __name__ == "__main__":
    main()
