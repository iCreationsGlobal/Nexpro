#!/usr/bin/env python3
"""Forwarder so `python3 vision-edge/process_mp4.py` works from Backend/."""

from pathlib import Path
import runpy

REAL = Path(__file__).resolve().parents[2] / "vision-edge" / "process_mp4.py"
runpy.run_path(str(REAL), run_name="__main__")
