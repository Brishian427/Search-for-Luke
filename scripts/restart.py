#!/usr/bin/env python3
"""Restart a real Uvicorn process in mid-S5 and verify persisted continuity."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parents[1]
KEY = "restart-key"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_ready(base: str, process: subprocess.Popen, timeout=15):
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        if process.poll() is not None:
            raise RuntimeError("server exited during startup")
        try:
            if httpx.get(base + "/api/health", timeout=1).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.2)
    raise TimeoutError("server did not become ready")


def launch(port: int, database: Path):
    env = os.environ.copy()
    env.update({
        "ADMIN_KEY": KEY,
        "CLOCK_SPEED": "10",
        "LLM_MODE": "mock",
        "DATABASE_URL": "sqlite:///" + database.as_posix(),
    })
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    wait_ready(f"http://127.0.0.1:{port}", process)
    return process


def stop(process: subprocess.Popen):
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


def run():
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="luke-restart-") as folder:
        database = Path(folder) / "restart.db"
        process = launch(port, database)
        try:
            with httpx.Client(base_url=base, timeout=10) as client:
                room = client.post("/api/admin/new", params={"key": KEY}).json()["room_code"]
                ids = []
                for name in ["Ben Knell", "Isabella Cooper", "Eva Hu", "Kyle Miller"]:
                    response = client.post("/api/join", json={"room_code": room, "name": name})
                    response.raise_for_status()
                    ids.append(response.json()["player_id"])
                client.post("/api/admin/start", params={"key": KEY}).raise_for_status()
                client.post("/api/admin/pause", params={"key": KEY}).raise_for_status()
                client.post("/api/admin/skip", params={"key": KEY}).raise_for_status()  # S2
                client.post("/api/stars/1", params={"player": ids[0]}, json={"stars": ["veil", "green", "storm"]}).raise_for_status()
                client.post("/api/admin/skip", params={"key": KEY}).raise_for_status()  # S3
                client.post("/api/board", params={"player": ids[0]}, json={"text": "Persist this finding across restart."}).raise_for_status()
                client.post("/api/admin/skip", params={"key": KEY}).raise_for_status()  # S4
                client.post("/api/admin/skip", params={"key": KEY}).raise_for_status()  # S5
                client.post("/api/admin/resume", params={"key": KEY}).raise_for_status()
                time.sleep(0.8)
                before = client.get("/api/state", params={"player": ids[0]}).json()
                assert before["stage"]["id"] == "S5"
            stop(process)
            downtime_started = time.perf_counter()
            process = launch(port, database)
            downtime = time.perf_counter() - downtime_started
            with httpx.Client(base_url=base, timeout=10) as client:
                after = client.get("/api/state", params={"player": ids[0]})
                after.raise_for_status()
                state = after.json()
                assert state["stage"]["id"] == "S5"
                assert state["clock"]["elapsed"] >= before["clock"]["elapsed"]
                assert state["submissions"]["1"] == ["veil", "green", "storm"]
                assert any(post["text"] == "Persist this finding across restart." for post in state["board"])
                assert [card["id"] for card in state["cards"]] == [card["id"] for card in before["cards"]]
                client.post("/api/board", params={"player": ids[0]}, json={"text": "Player continued without rejoining."}).raise_for_status()
            return {
                "status": "PASS",
                "stage_before": before["stage"]["id"],
                "stage_after": state["stage"]["id"],
                "clock_before": round(before["clock"]["elapsed"], 2),
                "clock_after": round(state["clock"]["elapsed"], 2),
                "restart_seconds": round(downtime, 2),
                "player_rejoined": False,
                "data_preserved": True,
            }
        finally:
            if process.poll() is None:
                stop(process)


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
