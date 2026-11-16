import json
import os
import io
import asyncio
import time
from pathlib import Path
from typing import Any
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
import qrcode
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import content, game, ai, scoring
from .database import Base, engine, get_db
from .models import AssistantMessage, BoardPost, GameSession, Player, Submission, TeamDrop

ROOT = Path(__file__).resolve().parent
ADMIN_KEY = os.getenv("ADMIN_KEY", "classroom")

app = FastAPI(title=content.TITLE)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


class JoinBody(BaseModel):
    room_code: str
    name: str = Field(min_length=1, max_length=120)
    spectator: bool = False
    team_id: str | None = None


class StarBody(BaseModel):
    stars: list[str]


class TextBody(BaseModel):
    text: str = Field(min_length=1, max_length=600)


class DropBody(BaseModel):
    places: list[str]


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.on_event("startup")
async def start_ai_loop():
    app.state.ai_task = asyncio.create_task(ai.ai_stage_loop())


@app.on_event("shutdown")
async def stop_ai_loop():
    task = getattr(app.state, "ai_task", None)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def check_key(key: str):
    if key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


def get_game_by_room(db: Session, room_code: str) -> GameSession:
    row = db.query(GameSession).filter(GameSession.room_code == room_code.upper()).first()
    if not row:
        raise HTTPException(status_code=404, detail="Room not found")
    return row


def get_player(db: Session, player_id: str) -> Player:
    row = db.get(Player, player_id)
    if not row:
        raise HTTPException(status_code=404, detail="Player not found")
    return row


def stage_rank(stage_id: str) -> int:
    return int(stage_id[1:]) if stage_id.startswith("S") else 0


def player_state(db: Session, player: Player) -> dict[str, Any]:
    current_game = db.get(GameSession, player.session_id)
    game.ensure_commanders(db, current_game)
    game.ensure_final_drops(db, current_game)
    stage = game.stage_for(current_game)
    rank = stage_rank(stage["id"])
    teammates = db.query(Player).filter_by(session_id=current_game.id, team_id=player.team_id).order_by(Player.seat).all()
    joined_by_name = {mate.name: mate for mate in teammates}
    cards = []
    if rank >= 1 and not player.spectator:
        for card_id in json.loads(player.cards_json):
            cards.append({"id": card_id, **content.CARDS[card_id]})
    logs = [{"kind": "system", "text": "Connected."}]
    if rank >= 1:
        logs.append({"kind": "system", "text": "Mission briefing received."})
    if rank >= 4:
        logs.append({"kind": "new-message", "text": content.MINUTE_SIX_LOG, "released_at": 6})
    board_rows = []
    if rank >= 3 and player.team_id != "OBS":
        rows = db.query(BoardPost).filter_by(session_id=current_game.id, team_id=player.team_id).order_by(BoardPost.id).all()
        board_rows = [{"id": row.id, "author": row.author, "text": row.text, "kind": row.kind, "minute": row.game_minute} for row in rows]
    submissions = {}
    for row in db.query(Submission).filter_by(player_id=player.id).all():
        submissions[str(row.round)] = json.loads(row.stars_json)
    drop = db.query(TeamDrop).filter_by(session_id=current_game.id, team_id=player.team_id).first()
    drop_choices = json.loads(drop.choices_json) if drop else []
    is_commander = bool(drop and drop.commander_player_id == player.id)
    instruction = stage["instruction"]
    if stage["id"] == "S7":
        if is_commander:
            instruction = "You are the Drop Commander. Choose 2 drop sites."
        else:
            commander = db.get(Player, drop.commander_player_id) if drop and drop.commander_player_id else None
            instruction = f"{commander.name if commander else 'Your Drop Commander'} is choosing the drop sites."
    result = {
        "server_time": game.now_utc().isoformat() + "Z",
        "room_code": current_game.room_code,
        "stage": {"id": stage["id"], "name": stage["name"], "instruction": instruction},
        "clock": {"elapsed": game.elapsed_seconds(current_game), "remaining": game.countdown_seconds(current_game), "paused": current_game.paused},
        "player": {"id": player.id, "name": player.name, "team_id": player.team_id, "seat": player.seat, "late": player.late, "spectator": player.spectator},
        "team": {"id": player.team_id, "condition": content.TEAMS.get(player.team_id, {}).get("condition", "Spectator"), "members": [
            {"name": name, "seat": joined_by_name[name].seat if name in joined_by_name else None,
             "joined": name in joined_by_name, "late": joined_by_name[name].late if name in joined_by_name else False}
            for name in content.TEAMS.get(player.team_id, {}).get("members", [])
        ]},
        "places": [{"id": place_id, **place} for place_id, place in content.PLACES.items()],
        "candidates": content.CANDIDATES,
        "cards": cards,
        "briefing": content.BRIEFING if rank >= 1 else None,
        "logs": logs,
        "board": board_rows,
        "submissions": submissions,
        "drop": {"commander": is_commander, "choices": drop_choices},
        "assistant_enabled": rank >= 3 and content.TEAMS.get(player.team_id, {}).get("condition") == "Human + AI",
    }
    if result["assistant_enabled"]:
        messages = db.query(AssistantMessage).filter_by(session_id=current_game.id, player_id=player.id).order_by(AssistantMessage.id).all()
        result["assistant_messages"] = [{"role": item.role, "text": item.text, "latency_ms": item.latency_ms} for item in messages]
    if stage["id"] == "S3" and teammates:
        share_elapsed = max(0, game.elapsed_seconds(current_game) - stage["start"])
        slot = min(len(teammates) - 1, int(share_elapsed / max(1, (stage["end"] - stage["start"]) / len(teammates))))
        result["active_seat"] = teammates[slot].seat
    if rank >= 8:
        result["truth"] = content.TRUTH
        result["team_result"] = {"drops": drop_choices, "success": content.TRUTH in drop_choices}
    if rank >= 9:
        result["questions"] = content.QUESTIONS
    return result


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/lobby")
def lobby(room: str | None = None, db: Session = Depends(get_db)):
    current_game = get_game_by_room(db, room) if room else game.active_game(db)
    joined = db.query(Player).filter_by(session_id=current_game.id).all()
    joined_names = {row.name for row in joined}
    teams = []
    for team_id, team in content.TEAMS.items():
        if team["condition"] == "AI":
            continue
        teams.append({"id": team_id, "condition": team["condition"], "members": [
            {"name": name, "joined": name in joined_names} for name in team["members"]
        ]})
    return {"title": content.TITLE, "room_code": current_game.room_code, "started": current_game.started_at is not None, "teams": teams}


@app.post("/api/join")
def join(body: JoinBody, db: Session = Depends(get_db)):
    current_game = get_game_by_room(db, body.room_code)
    team_id = game.team_for_name(body.name)
    spectator = body.spectator or team_id is None
    player = game.join_player(db, current_game, body.name, spectator=spectator, team_id=body.team_id)
    return {"player_id": player.id, "team_id": player.team_id, "spectator": player.spectator, "late": player.late}


@app.get("/api/state")
def state(player: str, db: Session = Depends(get_db)):
    return player_state(db, get_player(db, player))


@app.post("/api/stars/{round_no}")
def submit_stars(round_no: int, body: StarBody, player: str = Query(...), db: Session = Depends(get_db)):
    person = get_player(db, player)
    current_game = db.get(GameSession, person.session_id)
    expected = "S2" if round_no == 1 else "S6" if round_no == 2 else None
    if expected is None or game.stage_for(current_game)["id"] != expected:
        raise HTTPException(status_code=409, detail="This star round is locked")
    if person.spectator or len(body.stars) != 3 or any(place not in content.CANDIDATES for place in body.stars):
        raise HTTPException(status_code=400, detail="Choose exactly 3 valid stars")
    row = db.query(Submission).filter_by(player_id=person.id, round=round_no).first()
    if not row:
        row = Submission(player_id=person.id, session_id=current_game.id, team_id=person.team_id, round=round_no, stars_json="[]")
        db.add(row)
    row.stars_json = json.dumps(body.stars)
    row.submitted_at = game.now_utc()
    db.commit()
    return {"ok": True, "stars": body.stars}


@app.post("/api/board")
def add_board_post(body: TextBody, player: str = Query(...), db: Session = Depends(get_db)):
    person = get_player(db, player)
    current_game = db.get(GameSession, person.session_id)
    if stage_rank(game.stage_for(current_game)["id"]) < 3 or person.spectator:
        raise HTTPException(status_code=409, detail="Team board is not open")
    row = BoardPost(session_id=current_game.id, team_id=person.team_id, player_id=person.id, author=person.name,
                    text=body.text.strip(), game_minute=game.elapsed_seconds(current_game) / 60)
    db.add(row)
    db.commit()
    return {"ok": True, "id": row.id}


@app.post("/api/assistant")
async def ask_assistant(body: TextBody, player: str = Query(...), db: Session = Depends(get_db)):
    person = get_player(db, player)
    current_game = db.get(GameSession, person.session_id)
    stage = game.stage_for(current_game)
    if stage_rank(stage["id"]) < 3 or content.TEAMS.get(person.team_id, {}).get("condition") != "Human + AI":
        raise HTTPException(status_code=409, detail="Assistant is not available")
    prior = db.query(AssistantMessage).filter_by(session_id=current_game.id, player_id=person.id).order_by(AssistantMessage.id).all()
    history = [{"role": item.role, "content": item.text} for item in prior]
    db.add(AssistantMessage(session_id=current_game.id, team_id=person.team_id, player_id=person.id, role="user", text=body.text.strip()))
    db.commit()
    started = time.perf_counter()
    try:
        reply = await ai.assistant_reply(person, body.text.strip(), stage_rank(stage["id"]) >= 4, history)
    except Exception:
        reply = "The assistant didn't respond. Ask again."
    latency_ms = int((time.perf_counter() - started) * 1000)
    db.add(AssistantMessage(session_id=current_game.id, team_id=person.team_id, player_id=person.id,
                            role="assistant", text=reply, latency_ms=latency_ms))
    db.commit()
    return {"reply": reply, "latency_ms": latency_ms}


@app.post("/api/drop")
def choose_drop(body: DropBody, player: str = Query(...), db: Session = Depends(get_db)):
    person = get_player(db, player)
    current_game = db.get(GameSession, person.session_id)
    game.ensure_commanders(db, current_game)
    row = db.query(TeamDrop).filter_by(session_id=current_game.id, team_id=person.team_id).first()
    if game.stage_for(current_game)["id"] != "S7":
        raise HTTPException(status_code=409, detail="Drop selection is locked")
    if not row or row.commander_player_id != person.id:
        raise HTTPException(status_code=403, detail="Only the Drop Commander can choose")
    if len(body.places) != 2 or len(set(body.places)) != 2 or any(place not in content.CANDIDATES for place in body.places):
        raise HTTPException(status_code=400, detail="Choose exactly 2 different places")
    row.choices_json = json.dumps(body.places)
    row.source = "commander"
    row.updated_at = game.now_utc()
    db.commit()
    return {"ok": True, "places": body.places}


@app.get("/api/admin/state")
def admin_state(key: str, db: Session = Depends(get_db)):
    check_key(key)
    current_game = game.active_game(db)
    stage = game.stage_for(current_game)
    players = db.query(Player).filter_by(session_id=current_game.id).all()
    team_data = {}
    for team_id, team in content.TEAMS.items():
        members = [p for p in players if p.team_id == team_id]
        team_data[team_id] = {
            "condition": team["condition"],
            "joined": [{"id": p.id, "name": p.name, "seat": p.seat, "late": p.late, "ai": p.is_ai} for p in members],
            "round1": db.query(Submission).filter_by(session_id=current_game.id, team_id=team_id, round=1).count(),
            "round2": db.query(Submission).filter_by(session_id=current_game.id, team_id=team_id, round=2).count(),
        }
    return {"room_code": current_game.room_code, "started": current_game.started_at is not None,
            "stage": stage, "clock": {"elapsed": game.elapsed_seconds(current_game), "remaining": game.countdown_seconds(current_game), "paused": current_game.paused},
            "teams": team_data}


@app.get("/api/screen/state")
def screen_state(db: Session = Depends(get_db)):
    current_game = game.active_game(db)
    game.ensure_commanders(db, current_game)
    game.ensure_final_drops(db, current_game)
    stage = game.stage_for(current_game)
    players = db.query(Player).filter_by(session_id=current_game.id).all()
    teams = []
    for team_id, team in content.TEAMS.items():
        members = [p for p in players if p.team_id == team_id and not p.spectator]
        joined_names = {p.name for p in members}
        expected = len(members) if current_game.started_at else len(team["members"])
        complete = len(members)
        label = f"{complete}/{expected} connected" if expected else "Waiting"
        if stage["id"] in {"S2", "S6"}:
            round_no = 1 if stage["id"] == "S2" else 2
            complete = db.query(Submission).filter_by(session_id=current_game.id, team_id=team_id, round=round_no).count()
            label = f"{complete}/{expected} submitted"
        elif stage["id"] == "S7":
            drop = db.query(TeamDrop).filter_by(session_id=current_game.id, team_id=team_id).first()
            complete = len(json.loads(drop.choices_json)) if drop else 0
            expected = 2
            label = f"{complete}/2 sites selected"
        teams.append({"id": team_id, "condition": team["condition"], "joined": len(members), "size": len(team["members"]),
                      "members": [{"name": name, "joined": name in joined_names} for name in team["members"]] if stage["id"] == "S0" else [],
                      "progress": {"complete": complete, "total": max(1, expected), "label": label}})
    result = {"title": content.TITLE, "room_code": current_game.room_code, "stage": stage,
              "clock": {"elapsed": game.elapsed_seconds(current_game), "remaining": game.countdown_seconds(current_game), "paused": current_game.paused},
              "places": [{"id": place_id, **place} for place_id, place in content.PLACES.items()], "teams": teams}
    if stage["id"] == "S9":
        result["questions"] = content.QUESTIONS
    if stage["id"] in {"S8", "S9"}:
        result["truth"] = content.TRUTH
        result["results"] = scoring.session_results(db, current_game.id)
    return result


@app.get("/api/qr")
def room_qr(request: Request, room: str):
    join_url = str(request.base_url).rstrip("/") + "/?room=" + room.upper()
    image = qrcode.make(join_url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/api/export")
def export_data(key: str, db: Session = Depends(get_db)):
    check_key(key)
    current_game = game.active_game(db)
    payload = scoring.anonymized_export(db, current_game.id)
    from fastapi.responses import JSONResponse
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="search-for-luke-{current_game.room_code}.json"'})


@app.post("/api/admin/new")
def admin_new(key: str, db: Session = Depends(get_db)):
    check_key(key)
    row = game.create_game(db)
    return {"room_code": row.room_code}


@app.post("/api/admin/{action}")
def admin_action(action: str, key: str, db: Session = Depends(get_db)):
    check_key(key)
    current_game = game.active_game(db)
    if action == "start":
        game.start_game(db, current_game)
    elif action == "pause":
        game.pause_game(db, current_game)
    elif action == "resume":
        game.resume_game(db, current_game)
    elif action == "skip":
        game.skip_stage(db, current_game)
    else:
        raise HTTPException(status_code=404, detail="Unknown action")
    return {"ok": True}


@app.get("/")
def player_page():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/screen")
def screen_page():
    return FileResponse(ROOT / "static" / "screen.html")


@app.get("/admin")
def admin_page():
    return FileResponse(ROOT / "static" / "admin.html")

