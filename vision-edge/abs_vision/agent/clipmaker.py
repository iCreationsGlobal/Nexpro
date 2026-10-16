"""Turn buffered JPEG frames into a short MP4 that plays in browsers and on phones."""

import logging
import os
import shutil
import subprocess
import tempfile

log = logging.getLogger("abs_watch.clips")
_warned_mp4v = False


def ffmpeg_path():
    return shutil.which("ffmpeg")


def _encode_with_ffmpeg(jpegs, fps, dest):
    """H.264 + faststart: the format every browser and phone plays."""
    command = [
        ffmpeg_path(), "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-",
        # Even width/height (H.264 needs it) and TV colour range: JPEG frames are full range,
        # which some phone players show washed out or refuse
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=pc:out_range=tv,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-color_range", "tv",
        "-movflags", "+faststart", dest,
    ]
    completed = subprocess.run(command, input=b"".join(jpegs), capture_output=True, check=False)
    if completed.returncode != 0 or not os.path.isfile(dest) or os.path.getsize(dest) == 0:
        raise RuntimeError(completed.stderr.decode("utf-8", errors="replace")[-300:] or "ffmpeg failed")


def _encode_with_opencv(jpegs, fps, dest):
    """Fallback when ffmpeg isn't installed. avc1 (H.264) where OpenCV supports it, else mp4v."""
    import cv2
    import numpy as np

    frames = [cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR) for data in jpegs]
    frames = [frame for frame in frames if frame is not None]
    if not frames:
        raise RuntimeError("No frames to encode")
    height, width = frames[0].shape[:2]
    for codec in ("avc1", "mp4v"):
        writer = cv2.VideoWriter(dest, cv2.VideoWriter_fourcc(*codec), float(fps), (width, height))
        if not writer.isOpened():
            writer.release()
            continue
        for frame in frames:
            if frame.shape[:2] != (height, width):
                frame = cv2.resize(frame, (width, height))
            writer.write(frame)
        writer.release()
        if os.path.isfile(dest) and os.path.getsize(dest) > 0:
            if codec == "mp4v":
                global _warned_mp4v
                if not _warned_mp4v:
                    _warned_mp4v = True
                    log.warning("Clips are MPEG-4 Part 2, which browsers don't play. Install ffmpeg for H.264 clips.")
            return
    raise RuntimeError("OpenCV could not write an MP4 on this machine")


def make_clip(jpegs, fps):
    """MP4 bytes from JPEG frames, or raises if no encoder works."""
    if not jpegs:
        raise ValueError("No frames to make a clip from")
    handle, dest = tempfile.mkstemp(suffix=".mp4")
    os.close(handle)
    try:
        if ffmpeg_path():
            try:
                _encode_with_ffmpeg(jpegs, fps, dest)
            except RuntimeError:
                _encode_with_opencv(jpegs, fps, dest)
        else:
            _encode_with_opencv(jpegs, fps, dest)
        with open(dest, "rb") as clip:
            return clip.read()
    finally:
        try:
            os.remove(dest)
        except OSError:
            pass
