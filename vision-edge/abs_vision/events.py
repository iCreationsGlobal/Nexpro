"""Turn tracked person detections into ABS Watch events."""

from datetime import datetime, timedelta, timezone

from .zones import find_zone, zone_center

DEFAULT_DWELL_SECONDS = 6.0
# Normalized bbox-center stddev. Walk-throughs move more than a person at the till.
STILLNESS_MAX_STDEV = 0.045


def _parse_start(value):
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _iso(moment):
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _event(event_type, track_id, started_at, confidence, zone=None, ended_at=None, extra=None):
    payload = {
        "event_id": f"{event_type}:{track_id}:{int(started_at.timestamp() * 1000)}",
        "event_type": event_type,
        "track_id": str(track_id),
        "started_at": _iso(started_at),
        "ended_at": _iso(ended_at) if ended_at else None,
        "confidence": round(float(confidence or 0), 4),
        "zone": zone,
        "attributes": extra or {},
    }
    return payload


def _center_stdev(points):
    if not points or len(points) < 2:
        return 0.0
    count = float(len(points))
    mean_x = sum(point[0] for point in points) / count
    mean_y = sum(point[1] for point in points) / count
    var_x = sum((point[0] - mean_x) ** 2 for point in points) / count
    var_y = sum((point[1] - mean_y) ** 2 for point in points) / count
    return max(var_x ** 0.5, var_y ** 0.5)


def _reset_till_timer(state):
    state["in_counter"] = False
    state["counter_entered_at"] = None
    state["counter_centers"] = []
    state["interaction_emitted"] = False


class EventEngine:
    """
    Incremental version of build_events for an always-on camera: feed frames as they arrive and
    get events back as they happen. Tracks stay open across calls, so a person standing at the
    till while a batch is sent is still one visitor with one dwell timer.
    """

    def __init__(self, zones, dwell_seconds=DEFAULT_DWELL_SECONDS, camera="cam_01", miss_seconds=1.5):
        self.camera = camera
        self.tracks = {}
        self.gap_limit = max(0.0, float(miss_seconds if miss_seconds is not None else 1.5))
        self.dwell_limit = max(0.0, float(dwell_seconds if dwell_seconds is not None else DEFAULT_DWELL_SECONDS))
        self.set_zones(zones)

    def set_zones(self, zones):
        """Zones can change while running (owner edits them in ABS)."""
        self.counter_zones = [zone for zone in (zones or []) if zone.get("type") == "counter"]

    def process(self, moment, detections):
        """Events triggered by one frame's detections at `moment` (timezone-aware datetime)."""
        camera = self.camera
        tracks = self.tracks
        events = []
        seen = set()
        for detection in detections or []:
            track_id = str(detection.get("track_id") or detection.get("id") or "")
            if not track_id:
                continue
            seen.add(track_id)
            bbox = detection.get("bbox") or detection.get("box")
            confidence = float(detection.get("confidence") or 0.0)
            in_counter = bool(find_zone(bbox, self.counter_zones, zone_type="counter"))
            center = zone_center(bbox)
            state = tracks.get(track_id)
            if state is None:
                state = {
                    "entered_at": moment,
                    "last_seen": moment,
                    "in_counter": False,
                    "counter_entered_at": None,
                    "counter_centers": [],
                    "interaction_emitted": False,
                    "confidence": confidence,
                }
                tracks[track_id] = state
                events.append(_event("person_entered", track_id, moment, confidence, extra={"camera": camera}))
            state["last_seen"] = moment
            state["confidence"] = max(state["confidence"], confidence)

            if in_counter and not state["in_counter"]:
                state["in_counter"] = True
                state["counter_entered_at"] = moment
                state["counter_centers"] = [center] if center else []
                state["interaction_emitted"] = False
                events.append(_event(
                    "person_entered_counter_zone",
                    track_id,
                    moment,
                    confidence,
                    zone="counter",
                    extra={"camera": camera},
                ))
            elif in_counter and state["counter_entered_at"] and not state["interaction_emitted"]:
                if center:
                    state["counter_centers"].append(center)
                dwell = (moment - state["counter_entered_at"]).total_seconds()
                still = _center_stdev(state["counter_centers"]) <= STILLNESS_MAX_STDEV
                if dwell >= self.dwell_limit and still:
                    state["interaction_emitted"] = True
                    events.append(_event(
                        "counter_interaction",
                        track_id,
                        state["counter_entered_at"],
                        confidence,
                        zone="counter",
                        ended_at=moment,
                        extra={
                            "camera": camera,
                            "dwell_seconds": dwell,
                            "center_stdev": round(_center_stdev(state["counter_centers"]), 4),
                        },
                    ))
            elif not in_counter and state["in_counter"]:
                _reset_till_timer(state)

        for track_id, state in list(tracks.items()):
            if track_id in seen:
                continue
            gap = (moment - state["last_seen"]).total_seconds()
            if gap < self.gap_limit:
                continue
            tracks.pop(track_id)
            events.append(_event(
                "person_left",
                track_id,
                state["last_seen"],
                state["confidence"],
                extra={"camera": camera},
            ))
        return events

    def flush(self):
        """Close every open track (end of a clip, or the camera going away)."""
        events = []
        for track_id, state in list(self.tracks.items()):
            events.append(_event(
                "person_left",
                track_id,
                state["last_seen"],
                state["confidence"],
                extra={"camera": self.camera},
            ))
        self.tracks = {}
        return events


def build_events(
    frames,
    zones,
    start_time=None,
    fps=10,
    dwell_seconds=DEFAULT_DWELL_SECONDS,
    camera="cam_01",
    miss_seconds=1.5,
):
    """
    Convert per-frame detections into structured ABS events.

    frames: iterable of {frame|t, detections: [{track_id, bbox, confidence}]}
    zones: list of {name, type, x, y, w, h}
    miss_seconds: drop a track (person_left) only after this many seconds unseen.
        A short occlusion must not emit a second person_entered for the same track_id.
    dwell_seconds: till linger required before counter_interaction (walk-ins stay person_entered).
    """
    origin = _parse_start(start_time)
    engine = EventEngine(zones, dwell_seconds=dwell_seconds, camera=camera, miss_seconds=miss_seconds)
    events = []
    for index, frame in enumerate(frames or []):
        if "t" in frame:
            moment = origin + timedelta(seconds=float(frame["t"]))
        else:
            moment = origin + timedelta(seconds=float(index) / float(fps or 10))
        events.extend(engine.process(moment, frame.get("detections")))
    events.extend(engine.flush())
    return events
