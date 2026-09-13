"""Normalized 0–1 shop zones. Counter rectangles beat scene understanding."""


def _as_float_box(bbox):
    if not bbox or len(bbox) < 4:
        return None
    x1, y1, x2, y2 = [float(value) for value in bbox[:4]]
    return (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))


def zone_center(bbox):
    """Return (cx, cy) for a detection box."""
    box = _as_float_box(bbox)
    if box is None:
        return None
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def person_in_zone(bbox, zone):
    """
    True when the person center lies inside a zone rectangle.

    Zone keys: x, y, w, h in 0–1 image coordinates.
    """
    center = zone_center(bbox)
    if center is None or not zone:
        return False
    try:
        x = float(zone.get("x", 0))
        y = float(zone.get("y", 0))
        width = float(zone.get("w", 0))
        height = float(zone.get("h", 0))
    except (TypeError, ValueError):
        return False
    cx, cy = center
    return x <= cx <= x + width and y <= cy <= y + height


def find_zone(bbox, zones, zone_type=None):
    """Return the first matching zone dict, or None."""
    for zone in zones or []:
        if zone_type and zone.get("type") != zone_type:
            continue
        if person_in_zone(bbox, zone):
            return zone
    return None
