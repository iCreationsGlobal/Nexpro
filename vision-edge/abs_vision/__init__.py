"""ABS Vision Edge: local video → structured events. No cloud LLM."""

from .events import build_events
from .zones import person_in_zone, zone_center

__all__ = ["build_events", "person_in_zone", "zone_center"]
