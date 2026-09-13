import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from abs_vision.zones import find_zone, person_in_zone, zone_center


class ZoneTests(unittest.TestCase):
    def test_center_and_counter_hit(self):
        bbox = [0.60, 0.50, 0.70, 0.90]
        cx, cy = zone_center(bbox)
        self.assertAlmostEqual(cx, 0.65)
        self.assertAlmostEqual(cy, 0.70)
        zone = {"type": "counter", "x": 0.55, "y": 0.40, "w": 0.40, "h": 0.50}
        self.assertTrue(person_in_zone(bbox, zone))
        self.assertFalse(person_in_zone([0.10, 0.40, 0.20, 0.80], zone))

    def test_find_counter_zone(self):
        zones = [
            {"name": "floor", "type": "floor", "x": 0, "y": 0, "w": 0.5, "h": 1},
            {"name": "counter", "type": "counter", "x": 0.55, "y": 0.4, "w": 0.4, "h": 0.5},
        ]
        found = find_zone([0.6, 0.5, 0.7, 0.9], zones, zone_type="counter")
        self.assertEqual(found["name"], "counter")


if __name__ == "__main__":
    unittest.main()
