"""Person detection adapters. Local models only — never send frames to an LLM."""

from __future__ import annotations

import json
from pathlib import Path


def load_detections_file(path):
    """Load a precomputed detections JSON file for tests or offline runs."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return {"fps": 10, "frames": payload}
    frames = payload.get("frames") or payload.get("detections") or []
    return {
        "fps": payload.get("fps") or 10,
        "start_time": payload.get("start_time") or payload.get("startTime"),
        "frames": frames,
    }


def _video_fps(video_path):
    try:
        import cv2
        cap = cv2.VideoCapture(str(video_path))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        cap.release()
        if fps > 1:
            return fps
    except Exception:
        pass
    return 10.0


_EXAMPLES = Path(__file__).resolve().parent.parent / "examples"
_TRACKER = _EXAMPLES / "bytetrack.yaml"


def _crop_embedding(orig_img, x1, y1, x2, y2):
    """Optional in-memory body vector for in-clip Re-ID. Never stored to disk."""
    if orig_img is None:
        return None
    try:
        from .reid import embedding_from_bgr_crop
        crop = orig_img[y1:y2, x1:x2]
        return embedding_from_bgr_crop(crop)
    except Exception:
        return None


def detect_with_yolo(video_path, model_name="yolov8n.pt", max_seconds=None, sample_fps=None):
    """
    Optional live detector. Requires ultralytics + a local weight file.
    Returns the same frame dict shape as load_detections_file.
    """
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError(
            "ultralytics is not installed. Run without --yolo and pass --detections, "
            "or pip install ultralytics."
        ) from exc

    source_fps = _video_fps(video_path)
    vid_stride = 1
    if sample_fps and sample_fps > 0 and source_fps > sample_fps:
        vid_stride = max(1, int(round(source_fps / float(sample_fps))))
    processed_fps = source_fps / vid_stride
    max_outputs = None
    if max_seconds and max_seconds > 0:
        max_outputs = int(max_seconds * processed_fps) + 1

    model = YOLO(model_name)
    tracker = str(_TRACKER) if _TRACKER.is_file() else "bytetrack.yaml"
    frames = []
    results = model.track(
        source=str(video_path),
        classes=[0],
        persist=True,
        verbose=False,
        stream=True,
        vid_stride=vid_stride,
        tracker=tracker,
    )
    for index, result in enumerate(results):
        if max_outputs is not None and index >= max_outputs:
            break
        detections = []
        boxes = getattr(result, "boxes", None)
        orig_img = getattr(result, "orig_img", None)
        if boxes is None:
            frames.append({"frame": index, "t": index / processed_fps, "detections": []})
            continue
        width = float(getattr(result, "orig_shape", [1, 1])[1] or 1)
        height = float(getattr(result, "orig_shape", [1, 1])[0] or 1)
        ids = boxes.id.tolist() if boxes.id is not None else [None] * len(boxes)
        xyxy = boxes.xyxy.tolist() if boxes.xyxy is not None else []
        confs = boxes.conf.tolist() if boxes.conf is not None else []
        for track_id, box, confidence in zip(ids, xyxy, confs):
            if track_id is None:
                continue
            x1, y1, x2, y2 = box
            px1 = max(0, int(x1))
            py1 = max(0, int(y1))
            px2 = max(px1 + 1, int(x2))
            py2 = max(py1 + 1, int(y2))
            detection = {
                "track_id": str(int(track_id)),
                "bbox": [x1 / width, y1 / height, x2 / width, y2 / height],
                "confidence": float(confidence),
            }
            embedding = _crop_embedding(orig_img, px1, py1, px2, py2)
            if embedding is not None:
                detection["embedding"] = embedding
            detections.append(detection)
        frames.append({"frame": index, "t": index / processed_fps, "detections": detections})
    return {"fps": processed_fps, "frames": frames}
