"""Shared orbital model loaded from the same JSON definition as the browser."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path


MODEL_PATH = Path(__file__).with_name("static") / "orbit-model.json"


@lru_cache(maxsize=1)
def model() -> dict:
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))


def position_at(body_id: str, hour: float) -> tuple[float, float]:
    definition = model()
    body = definition["bodies"][body_id]
    x, z = float(body["x"]), float(body["z"])
    radius = math.hypot(x, z)
    if not radius or not body["omega"]:
        return x, z
    angle = math.atan2(z, x) + math.radians(float(body["omega"]) * (float(hour) - definition["reference_hour"]))
    return radius * math.cos(angle), radius * math.sin(angle)


def chart_timeline_prompt() -> str:
    definition = model()
    bodies = list(definition["bodies"])
    labels = [definition["bodies"][body_id]["name"] for body_id in bodies]
    rows = ["Chart timeline:", "Hour | " + " | ".join(labels)]
    for hour in definition["timeline_hours"]:
        positions = ["({:.1f}, {:.1f})".format(*position_at(body_id, hour)) for body_id in bodies]
        rows.append(f"{hour} | " + " | ".join(positions))
    rows.append("Reach is at (0, 0). The Veil and the Debris Belt never move. The Blue Space flies about 20 map units per hour.")
    return "\n".join(rows)
