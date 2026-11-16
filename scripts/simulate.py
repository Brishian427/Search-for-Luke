#!/usr/bin/env python3
"""Run one complete, timed classroom game against an already-running server."""

from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter

import httpx


ROSTERS = {
    "H4": ["Ben Knell", "Isabella Cooper", "Eva Hu", "Kyle Miller"],
    "H5": ["Sharon Geng", "Muxin Tan", "Paolo Diaz Andrade", "Runzhi Li", "Yinyuan Chen"],
    "X4": ["Sam Salin", "Yi Wang", "Amber Tang", "Emely Antunes Otsuka"],
    "X5": ["Silvia Chen", "Varshini Narayanan", "Xiaoyu Li", "Mei Yang", "Tong Li"],
}
FIXED_CARD_PACKETS = {
    5: [["RO-A", "AS-B"], ["RO-B", "CO-A"], ["OB-A", "MP-B"], ["AS-A", "CO-B"], ["MP-A", "OB-B"]],
    4: [["RO-A", "AS-B", "OB-B"], ["RO-B", "CO-A", "MP-A"], ["OB-A", "MP-B"], ["AS-A", "CO-B"]],
}
CONNECTION_PAIRS = [("RO-A", "CO-A"), ("RO-B", "OB-A"), ("MP-B", "AS-B"), ("AS-A", "OB-A")]
CANDIDATES = ["storm", "orange", "veil", "green", "red", "debris"]
INSTRUCTIONS = {
    "S1": "Read the mission briefing and your private intelligence dossier.",
    "S2": "Do not talk yet. Place 3 stars where you think Luke is.",
    "S3": "Take turns reading your private dossiers aloud.",
    "S4": "A new message has arrived. Check your log.",
    "S5": "Discuss. You can change your mind later.",
    "S6": "Place your 3 stars again.",
    "S7": "Choose 2 drop sites.",
    "S8": "Look at the main screen.",
    "S9": "Discussion time.",
}
MINUTE_SIX = "New message from the deep space network"


class SessionTest:
    def __init__(self, base_url: str, admin_key: str):
        self.base = base_url.rstrip("/")
        self.key = admin_key
        self.client = httpx.Client(base_url=self.base, timeout=10)
        self.players: list[dict] = []
        self.poll_cycles = 0

    def admin(self, action: str):
        response = self.client.post(f"/api/admin/{action}", params={"key": self.key})
        response.raise_for_status()
        return response.json()

    def join(self, room: str, team_id: str, name: str, *, late: bool = False):
        response = self.client.post("/api/join", json={"room_code": room, "name": name})
        response.raise_for_status()
        data = response.json()
        assert data["team_id"] == team_id and not data["spectator"]
        assert data["late"] is late
        player = {"id": data["player_id"], "team_id": team_id, "name": name, "late": late}
        self.players.append(player)
        return player

    def state(self, player: dict):
        response = self.client.get("/api/state", params={"player": player["id"]})
        response.raise_for_status()
        return response.json()

    def poll_all(self):
        # Browser timers naturally drift. Keep the full-session simulation
        # staggered; scripts/load.py is the deliberate simultaneous stress case.
        states = [self.state(player) for player in self.players]
        self.poll_cycles += 1
        return states

    @staticmethod
    def assert_no_truth(states: list[dict]):
        for state in states:
            assert "truth" not in state, f"truth leaked to {state['player']['name']} in {state['stage']['id']}"

    def assert_stage(self, states: list[dict], stage_id: str):
        assert states and all(state["stage"]["id"] == stage_id for state in states)
        for state in states:
            instruction = state["stage"]["instruction"]
            if stage_id == "S7":
                assert instruction == INSTRUCTIONS[stage_id] or "Drop Commander" in instruction or instruction.endswith("is choosing the drop sites.")
            else:
                assert instruction == INSTRUCTIONS[stage_id]
        if stage_id < "S8":
            self.assert_no_truth(states)

    def wait_for_stage(self, stage_id: str, timeout: float = 40):
        deadline = time.perf_counter() + timeout
        last = None
        while time.perf_counter() < deadline:
            states = self.poll_all()
            last = states[0]["stage"]["id"]
            if all(item["stage"]["id"] == stage_id for item in states):
                self.assert_stage(states, stage_id)
                return states
            if last < "S8":
                self.assert_no_truth(states)
            time.sleep(1.5)
        raise AssertionError(f"timed out waiting for {stage_id}; last stage was {last}")

    def verify_fixed_card_packets(self, states: list[dict]):
        by_name = {state["player"]["name"]: state for state in states}
        for team_id, roster in ROSTERS.items():
            joined = [name for name in roster if name != "Yinyuan Chen"]
            packets = FIXED_CARD_PACKETS[len(roster)]
            for name in joined:
                seat = roster.index(name)
                cards = [card["id"] for card in by_name[name]["cards"]]
                assert cards == packets[seat], f"wrong fixed packet for {name}: {cards}"
                assert by_name[name]["player"]["seat"] == seat + 1, f"wrong fixed seat for {name}"
                for left, right in CONNECTION_PAIRS:
                    assert not ({left, right} <= set(cards)), f"connection pair held by {name}"

    def post_stars(self, round_no: int, stars: list[str]):
        for player in self.players:
            response = self.client.post(f"/api/stars/{round_no}", params={"player": player["id"]}, json={"stars": stars})
            response.raise_for_status()

    def run(self):
        self.client.get("/api/health").raise_for_status()
        room = self.admin("new")["room_code"]

        # Eighteen virtual roster members are represented. One H5 member deliberately
        # never connects, and one X5 member connects only after the game starts.
        for team_id, roster in ROSTERS.items():
            for name in roster:
                if name not in {"Yinyuan Chen", "Tong Li"}:
                    self.join(room, team_id, name)
        self.admin("start")
        self.join(room, "X5", "Tong Li", late=True)

        states = self.wait_for_stage("S1", 8)
        self.verify_fixed_card_packets(states)

        states = self.wait_for_stage("S2", 12)
        self.post_stars(1, ["storm", "green", "veil"])
        states = self.poll_all()
        assert all(state["submissions"].get("1") == ["storm", "green", "veil"] for state in states)

        self.wait_for_stage("S3", 12)
        locked = self.client.post("/api/stars/1", params={"player": self.players[0]["id"]}, json={"stars": ["veil"] * 3})
        assert locked.status_code == 409
        for index, player in enumerate(self.players):
            response = self.client.post("/api/board", params={"player": player["id"]}, json={"text": f"Finding {index + 1}: compare the route, fuel, and signals."})
            response.raise_for_status()
        for player in [item for item in self.players if item["team_id"].startswith("X")]:
            response = self.client.post("/api/assistant", params={"player": player["id"]}, json={"text": "Which clue should our team connect next?"})
            response.raise_for_status()

        states = self.wait_for_stage("S4", 30)
        assert all(any(MINUTE_SIX in log["text"] for log in state["logs"]) for state in states), "minute-6 log missed a player in the poll cycle"
        self.wait_for_stage("S5", 12)

        self.wait_for_stage("S6", 28)
        self.post_stars(2, ["veil", "veil", "orange"])
        states = self.poll_all()
        assert all(state["submissions"].get("2") == ["veil", "veil", "orange"] for state in states)

        states = self.wait_for_stage("S7", 12)
        locked = self.client.post("/api/stars/2", params={"player": self.players[0]["id"]}, json={"stars": ["veil"] * 3})
        assert locked.status_code == 409
        commanders = {}
        for player, state in zip(self.players, states):
            if state["drop"]["commander"]:
                commanders[player["team_id"]] = player
        assert set(commanders) == {"H4", "H5", "X4", "X5"}
        for player in commanders.values():
            response = self.client.post("/api/drop", params={"player": player["id"]}, json={"places": ["veil", "green"]})
            response.raise_for_status()

        states = self.wait_for_stage("S8", 12)
        assert all(state["truth"] == "veil" for state in states)
        export = self.client.get("/api/export", params={"key": self.key})
        export.raise_for_status()
        payload = export.json()
        assert len(payload["drops"]) == 6 and all(len(item["places"]) == 2 for item in payload["drops"])
        assert not any(name in export.text for roster in ROSTERS.values() for name in roster), "real name leaked into export"

        submissions_by_team_round: dict[tuple[str, int], list[list[str]]] = {}
        for row in payload["submissions"]:
            submissions_by_team_round.setdefault((row["team_id"], row["round"]), []).append(row["stars"])
        results = {row["team_id"]: row for row in payload["results"]}
        for team_id, result in results.items():
            all_briers = []
            for round_no in (1, 2):
                rows = submissions_by_team_round.get((team_id, round_no), [])
                total = sum(len(stars) for stars in rows)
                share = sum(stars.count("veil") for stars in rows) / total if total else 0
                assert math.isclose(result[f"star_share_round{round_no}"], share, abs_tol=1e-12)
                for stars in rows:
                    counts = Counter(stars)
                    all_briers.append(sum(((counts[place] / 3) - (place == "veil")) ** 2 for place in CANDIDATES))
            expected_brier = sum(all_briers) / len(all_briers) if all_briers else None
            assert result["average_brier"] == expected_brier or math.isclose(result["average_brier"], expected_brier, abs_tol=1e-12)
            assert result["success"] is ("veil" in result["drops"])

        self.wait_for_stage("S9", 14)
        return {
            "status": "PASS",
            "room_code": room,
            "virtual_roster": 18,
            "connected_players": len(self.players),
            "deliberately_absent": "Yinyuan Chen (H5)",
            "late_join": "Tong Li (X5)",
            "poll_cycles": self.poll_cycles,
            "submissions": len(payload["submissions"]),
            "drops": len(payload["drops"]),
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--admin-key", default="test-key")
    args = parser.parse_args()
    started = time.perf_counter()
    result = SessionTest(args.base_url, args.admin_key).run()
    result["duration_seconds"] = round(time.perf_counter() - started, 2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
