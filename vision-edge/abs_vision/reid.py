"""Anonymous in-clip person Re-ID. Same body as a few seconds ago — not a named face.

Embeddings live in RAM for this video only. They are never written to the sidecar,
Postgres, or the Watch ingest API.
"""

from __future__ import annotations

import math
import os

DEFAULT_MATCH_THRESHOLD = 0.72
DEFAULT_MAX_GAP_SECONDS = 3.0


def cosine_similarity(left, right):
    """Cosine similarity of two equal-length numeric vectors. Missing/empty → 0."""
    if left is None or right is None:
        return 0.0
    try:
        a = [float(value) for value in left]
        b = [float(value) for value in right]
    except (TypeError, ValueError):
        return 0.0
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (na * nb)


def embedding_from_bgr_crop(crop, bins=8):
    """Cheap CPU body cue from a BGR crop (clothing color). No extra weights."""
    if crop is None:
        return None
    try:
        import numpy as np
    except ImportError:
        return None
    array = np.asarray(crop)
    if array.ndim != 3 or array.shape[0] < 2 or array.shape[1] < 2:
        return None
    channels = array.shape[2]
    if channels < 3:
        return None
    parts = []
    for channel in range(3):
        hist, _ = np.histogram(array[:, :, channel], bins=bins, range=(0, 256), density=True)
        parts.append(hist.astype("float64"))
    vec = np.concatenate(parts)
    norm = float(np.linalg.norm(vec))
    if norm <= 0:
        return vec.tolist()
    return (vec / norm).tolist()


def _try_torch_embedder():
    """Optional local Re-ID. Never downloads weights. Skip when missing (CI-safe)."""
    weights_path = os.environ.get("WATCH_REID_WEIGHTS")
    if not weights_path or not os.path.isfile(weights_path):
        return None
    try:
        import torch
        from torchvision.models import mobilenet_v3_small
        import torchvision.transforms as transforms
    except Exception:
        return None
    try:
        model = mobilenet_v3_small(weights=None)
        state = torch.load(weights_path, map_location="cpu")
        model.load_state_dict(state, strict=False)
        model.eval()
        preprocess = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
        ])
    except Exception:
        return None

    def embed_bgr(crop):
        try:
            import numpy as np
            rgb = np.asarray(crop)[:, :, ::-1].copy()
            tensor = preprocess(rgb).unsqueeze(0)
            with torch.no_grad():
                vector = model(tensor).flatten().numpy().astype("float64")
            norm = float((vector ** 2).sum() ** 0.5)
            if norm <= 0:
                return vector.tolist()
            return (vector / norm).tolist()
        except Exception:
            return None

    return embed_bgr


def make_production_embedder(video_path=None):
    """Crop embeddings from the MP4 when OpenCV is available. None → skip Re-ID."""
    if not video_path or os.environ.get("WATCH_REID") == "0":
        return None
    torch_embed = _try_torch_embedder()
    try:
        import cv2
    except Exception:
        return None

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return None
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0) or 25.0

    def embed(detection, frame):
        bbox = detection.get("bbox") or detection.get("box")
        if not bbox or len(bbox) < 4:
            return None
        t = float(frame.get("t") or 0)
        index = max(0, int(round(t * fps)))
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, image = capture.read()
        if not ok or image is None:
            return None
        height, width = image.shape[0], image.shape[1]
        x1 = max(0, min(width - 1, int(float(bbox[0]) * width)))
        y1 = max(0, min(height - 1, int(float(bbox[1]) * height)))
        x2 = max(x1 + 1, min(width, int(float(bbox[2]) * width)))
        y2 = max(y1 + 1, min(height, int(float(bbox[3]) * height)))
        crop = image[y1:y2, x1:x2]
        if torch_embed:
            vector = torch_embed(crop)
            if vector is not None:
                return vector
        return embedding_from_bgr_crop(crop)

    return embed


def _vector_from_detection(detection, frame, embedder):
    if embedder is not None:
        try:
            return embedder(detection, frame)
        except Exception:
            return None
    return detection.get("embedding") or detection.get("_embedding")


def _strip_embedding(detection):
    next_detection = dict(detection)
    next_detection.pop("embedding", None)
    next_detection.pop("_embedding", None)
    return next_detection


def rewrite_track_ids(
    frames,
    embedder=None,
    max_gap_seconds=DEFAULT_MAX_GAP_SECONDS,
    match_threshold=DEFAULT_MATCH_THRESHOLD,
):
    """
    Rewrite YOLO track_id to a stable in-clip person_id when embeddings match.

    Injectable ``embedder(detection, frame) -> vector`` for tests. Production
    may pass make_production_embedder(video_path) or per-detection embedding
    attached by detect.py. If no vectors are available, YOLO ids are unchanged.
    """
    source = list(frames or [])
    has_vectors = embedder is not None or any(
        (detection.get("embedding") or detection.get("_embedding")) is not None
        for frame in source
        for detection in (frame.get("detections") or [])
    )
    if not has_vectors:
        return source

    gallery = []
    yolo_to_person = {}
    next_person = 1
    gap_limit = max(0.0, float(max_gap_seconds if max_gap_seconds is not None else DEFAULT_MAX_GAP_SECONDS))
    threshold = float(match_threshold if match_threshold is not None else DEFAULT_MATCH_THRESHOLD)
    rewritten = []

    for frame in source:
        t = float(frame.get("t") or 0)
        occupied = set()
        detections = []
        for detection in frame.get("detections") or []:
            yolo_id = str(detection.get("track_id") or detection.get("id") or "")
            if not yolo_id:
                detections.append(_strip_embedding(detection))
                continue
            vector = _vector_from_detection(detection, frame, embedder)
            person_id = yolo_to_person.get(yolo_id)
            if person_id is None:
                match = None
                match_sim = threshold
                if vector is not None:
                    for entry in gallery:
                        if entry["person_id"] in occupied:
                            continue
                        if (t - entry["last_t"]) > gap_limit:
                            continue
                        similarity = cosine_similarity(vector, entry["embedding"])
                        if similarity >= match_sim:
                            match = entry
                            match_sim = similarity
                if match is not None:
                    person_id = match["person_id"]
                elif vector is None:
                    person_id = yolo_id
                else:
                    person_id = str(next_person)
                    next_person += 1
                    gallery.append({
                        "person_id": person_id,
                        "embedding": vector,
                        "last_t": t,
                    })
                yolo_to_person[yolo_id] = person_id
            occupied.add(person_id)
            if vector is not None:
                found = next((entry for entry in gallery if entry["person_id"] == person_id), None)
                if found is None:
                    gallery.append({"person_id": person_id, "embedding": vector, "last_t": t})
                else:
                    found["embedding"] = vector
                    found["last_t"] = t
            next_detection = _strip_embedding(detection)
            next_detection["track_id"] = person_id
            detections.append(next_detection)
        next_frame = dict(frame)
        next_frame["detections"] = detections
        rewritten.append(next_frame)
    return rewritten
