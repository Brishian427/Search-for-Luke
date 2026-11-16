#!/usr/bin/env python3
"""Bounded live-model smoke test. Run only with LLM_MODE=live and a real key."""

from __future__ import annotations

import argparse
import asyncio
import json
import time

import httpx

from simulate import ROSTERS


def wait_for(client, predicate, label, timeout=120):
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(1.5)
    raise AssertionError(f"timed out waiting for {label}")


async def five_messages(base, player_ids):
    async with httpx.AsyncClient(base_url=base, timeout=45) as client:
        responses = await asyncio.gather(*(
            client.post("/api/assistant", params={"player": player_id}, json={"text": f"Live check {index + 1}: what connection should we ask the team about?"})
            for index, player_id in enumerate(player_ids)
        ))
    for response in responses:
        response.raise_for_status()
        assert "didn't respond" not in response.json()["reply"].lower()
    return [response.json()["latency_ms"] for response in responses]


def run(base, key):
    base = base.rstrip("/")
    with httpx.Client(base_url=base, timeout=30) as client:
        room = client.post("/api/admin/new", params={"key": key}).json()["room_code"]
        human_ai = []
        for team_id in ("X4", "X5"):
            for name in ROSTERS[team_id]:
                response = client.post("/api/join", json={"room_code": room, "name": name})
                response.raise_for_status()
                human_ai.append(response.json()["player_id"])
        client.post("/api/admin/start", params={"key": key}).raise_for_status()
        client.post("/api/admin/pause", params={"key": key}).raise_for_status()

        def admin_state():
            return client.get("/api/admin/state", params={"key": key}).json()

        def export():
            return client.get("/api/export", params={"key": key}).json()

        # S2
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        wait_for(client, lambda: admin_state() if admin_state()["teams"]["A4"]["round1"] == 4 and admin_state()["teams"]["A5"]["round1"] == 5 else None, "AI round 1")
        # S3
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        wait_for(client, lambda: export() if sum(row["kind"] == "card" and row["team_id"] in {"A4", "A5"} for row in export()["board_posts"]) == 9 else None, "AI card boards")
        assistant_latencies = asyncio.run(five_messages(base, human_ai[:5]))
        # S4
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        wait_for(client, lambda: export() if sum(row["kind"] == "minute-6" and row["team_id"] in {"A4", "A5"} for row in export()["board_posts"]) == 2 else None, "AI minute-6 boards")
        # S5
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        payload = wait_for(client, lambda: export() if sum(row["kind"].startswith("ai-discussion-") for row in export()["board_posts"]) == 18 else None, "two AI discussion rounds", timeout=180)
        # S6
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        wait_for(client, lambda: admin_state() if admin_state()["teams"]["A4"]["round2"] == 4 and admin_state()["teams"]["A5"]["round2"] == 5 else None, "AI round 2")
        # S7
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        client.get("/api/screen/state").raise_for_status()  # create commanders/drop rows as the real projector does
        payload = wait_for(client, lambda: export() if all(len(row["places"]) == 2 and row["source"] == "ai-vote" for row in export()["drops"] if row["team_id"] in {"A4", "A5"}) else None, "AI drop votes", timeout=180)
        # S8 and S9
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        reveal = client.get("/api/screen/state").json()
        assert reveal["stage"]["id"] == "S8" and reveal["truth"] == "veil"
        client.post("/api/admin/skip", params={"key": key}).raise_for_status()
        assert client.get("/api/screen/state").json()["stage"]["id"] == "S9"
        ai_results = {row["team_id"]: row for row in payload["results"] if row["team_id"] in {"A4", "A5"}}
        assert set(ai_results) == {"A4", "A5"}
        return {
            "status": "PASS",
            "room_code": room,
            "assistant_messages": 5,
            "assistant_latency_ms": assistant_latencies,
            "ai_agents": 9,
            "ai_discussion_posts": 18,
            "ai_teams_completed": sorted(ai_results),
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--admin-key", default="test-key")
    args = parser.parse_args()
    print(json.dumps(run(args.base_url, args.admin_key), indent=2))
