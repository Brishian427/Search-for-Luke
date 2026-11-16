#!/usr/bin/env python3
"""Exercise 50 concurrent browser-like clients and simultaneous star writes."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import time

import httpx

from simulate import ROSTERS


async def timed(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    started = time.perf_counter()
    response = await client.request(method, url, **kwargs)
    return response, time.perf_counter() - started


async def run(base_url: str, admin_key: str):
    base_url = base_url.rstrip("/")
    latencies = []
    errors = []
    players = []
    async with httpx.AsyncClient(base_url=base_url, timeout=20, limits=httpx.Limits(max_connections=80)) as client:
        # Three independent paused S2 sessions provide 54 legal roster seats; use 50.
        for batch in range(3):
            response = await client.post("/api/admin/new", params={"key": admin_key})
            response.raise_for_status()
            room = response.json()["room_code"]
            for team_id, names in ROSTERS.items():
                for name in names:
                    response = await client.post("/api/join", json={"room_code": room, "name": name})
                    response.raise_for_status()
                    players.append({"id": response.json()["player_id"], "batch": batch, "name": name})
            await client.post("/api/admin/start", params={"key": admin_key})
            await client.post("/api/admin/pause", params={"key": admin_key})
            await client.post("/api/admin/skip", params={"key": admin_key})
        players = players[:50]

        for cycle in range(2):
            results = await asyncio.gather(*(timed(client, "GET", "/api/state", params={"player": player["id"]}) for player in players))
            for response, latency in results:
                latencies.append(latency)
                if response.status_code != 200 or response.json()["stage"]["id"] != "S2":
                    errors.append(f"poll cycle {cycle}: {response.status_code}")
            if cycle == 0:
                await asyncio.sleep(2)

        submitted_started = time.perf_counter()
        results = await asyncio.gather(*(timed(client, "POST", "/api/stars/1", params={"player": player["id"]}, json={"stars": ["veil", "green", "veil"]}) for player in players))
        submit_window = time.perf_counter() - submitted_started
        for response, latency in results:
            latencies.append(latency)
            if response.status_code != 200:
                errors.append(f"submit: {response.status_code} {response.text[:80]}")

        checks = await asyncio.gather(*(timed(client, "GET", "/api/state", params={"player": player["id"]}) for player in players))
        persisted = 0
        for response, latency in checks:
            latencies.append(latency)
            if response.status_code == 200 and response.json()["submissions"].get("1") == ["veil", "green", "veil"]:
                persisted += 1
            else:
                errors.append("submission not persisted")

    ordered = sorted(latencies)
    p95 = ordered[min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1)]
    result = {
        "status": "PASS" if not errors and p95 < 1 and persisted == 50 and submit_window <= 5 else "FAIL",
        "virtual_players": 50,
        "requests": len(latencies),
        "p95_seconds": round(p95, 4),
        "max_seconds": round(max(latencies), 4),
        "submit_window_seconds": round(submit_window, 4),
        "persisted_submissions": persisted,
        "errors": errors,
    }
    assert result["status"] == "PASS", json.dumps(result, indent=2)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--admin-key", default="test-key")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(run(args.base_url, args.admin_key)), indent=2))


if __name__ == "__main__":
    main()
