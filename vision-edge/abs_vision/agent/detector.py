"""Person detection + tracking on single frames. Local model only; frames never leave the machine."""

from pathlib import Path

from ..detect import _TRACKER


def _yolo():
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise ImportError("The person detector isn't installed. Run: pip3 install ultralytics") from exc
    return YOLO


def load_model(model_name):
    """Load (and on first use download) the model. A bare name downloads next to the given path."""
    Path(model_name).parent.mkdir(parents=True, exist_ok=True)
    return _yolo()(model_name)


class PersonTracker:
    """
    YOLO person detection with a tracker that persists across frames, so a person keeps one id
    for as long as they stay in view. One instance per camera (each keeps its own tracks).
    """

    def __init__(self, model_name="yolov8n.pt", track_prefix="cam"):
        self.model = load_model(model_name)
        self.tracker = str(_TRACKER) if _TRACKER.is_file() else "bytetrack.yaml"
        self.track_prefix = track_prefix

    def track(self, frame):
        """Detections for one BGR frame: [{track_id, bbox (0-1), confidence}]."""
        results = self.model.track(
            frame,
            classes=[0],
            persist=True,
            verbose=False,
            tracker=self.tracker,
        )
        if not results:
            return []
        result = results[0]
        boxes = getattr(result, "boxes", None)
        if boxes is None or boxes.id is None:
            return []
        height, width = frame.shape[:2]
        return [
            {
                # Prefixed per camera so two cameras' "person 1" never share an event id
                "track_id": f"{self.track_prefix}-{int(track_id)}",
                "bbox": [x1 / width, y1 / height, x2 / width, y2 / height],
                "confidence": float(confidence),
            }
            for track_id, (x1, y1, x2, y2), confidence in zip(boxes.id.tolist(), boxes.xyxy.tolist(), boxes.conf.tolist())
        ]
