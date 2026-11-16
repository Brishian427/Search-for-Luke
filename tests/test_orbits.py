import math
import unittest

from app import orbits


class OrbitModelTests(unittest.TestCase):
    def assert_position(self, body_id, hour, expected):
        actual = orbits.position_at(body_id, hour)
        self.assertAlmostEqual(actual[0], expected[0], delta=0.2)
        self.assertAlmostEqual(actual[1], expected[1], delta=0.2)

    def test_required_positions(self):
        self.assert_position("orange", 0, (-92.0, -8.0))
        self.assert_position("orange", 38, (92.1, -6.5))
        self.assert_position("orange", 48, (69.7, 60.5))
        self.assert_position("green", 26, (-56.8, -44.4))

    def test_veil_is_fixed(self):
        for hour in (0, 8, 14, 20, 26, 29, 34, 38, 40, 48):
            self.assert_position("veil", hour, (104, -4))

    def test_green_hour_26_ring_at_hour_29_misses_debris(self):
        green = orbits.position_at("green", 26)
        debris = orbits.position_at("debris", 29)
        distance = math.dist(green, debris)
        radius = orbits.model()["ship_speed"] * (29 - 26)
        self.assertAlmostEqual(radius, 60)
        self.assertAlmostEqual(distance, 110.3, delta=0.5)
        self.assertLess(radius, distance)


if __name__ == "__main__":
    unittest.main()
