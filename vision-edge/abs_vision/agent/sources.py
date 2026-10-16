"""Camera sources: network streams (RTSP/HTTP), this computer's cameras, or a video file."""

import os
import re

LOCAL_CAMERA = re.compile(r"^(?:camera:|webcam:?)?(\d{1,2})$", re.IGNORECASE)
STREAM_SCHEMES = ("rtsp://", "rtsps://", "http://", "https://")


def parse_source(text):
    """
    -> ("local", index) for "camera:0" / "0" (macOS Continuity Camera shows up as a local camera)
    -> ("stream", url) for rtsp/http(s) cameras and recorders
    -> ("file", path) for a video file (testing)
    """
    value = str(text or "").strip()
    match = LOCAL_CAMERA.match(value)
    if match:
        return "local", int(match.group(1))
    if value.lower().startswith(STREAM_SCHEMES):
        return "stream", value
    return "file", value


def describe_source(text):
    """Safe to log or show: the camera login inside a stream address is masked."""
    return re.sub(r"^([A-Za-z][A-Za-z0-9+.-]*://)[^/]*@", r"\1***@", str(text or ""))


STREAM_TIMEOUT_MS = 10000


def open_capture(text):
    """Open an OpenCV capture for a source. RTSP over TCP: steadier than UDP on shop Wi-Fi."""
    import cv2

    kind, value = parse_source(text)
    if kind == "stream":
        if value.lower().startswith(("rtsp://", "rtsps://")):
            os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
        # A camera that stops answering must not hang the reader: give up and reconnect
        timeouts = [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, STREAM_TIMEOUT_MS, cv2.CAP_PROP_READ_TIMEOUT_MSEC, STREAM_TIMEOUT_MS]
        capture = cv2.VideoCapture(value, cv2.CAP_FFMPEG, timeouts)
    elif kind == "local":
        capture = cv2.VideoCapture(value)
    else:
        capture = cv2.VideoCapture(value, cv2.CAP_FFMPEG)
    return capture, kind
