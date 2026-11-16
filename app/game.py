import json
import os
import random
import string
import uuid
from collections import Counter
from datetime import datetime
from sqlalchemy.orm import Session
from . import content
from .models import GameSession, Player, Submission, TeamDrop

CLOCK_SPEED = float(os.getenv("CLOCK_SPEED", "1"))


def now_utc():
    return datetime.utcnow()


def make_room_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def elapsed_seconds(game: GameSession) -> float:
    if game.started_at is None:
        return 0.0
    if game.paused:
        return game.elapsed_base
    return min(1200.0, game.elapsed_base + (now_utc() - game.started_at).total_seconds() * CLOCK_SPEED)


def stage_for(game: GameSession):
    if game.started_at is None:
        return {"id": "S0", "name": "Lobby", "start": 0, "end": 0, "instruction": "Join and wait."}
    elapsed = elapsed_seconds(game)
    for stage in content.STAGES:
        if elapsed < stage["end"]:
            return stage
    return content.STAGES[-1]


def countdown_seconds(game: GameSession) -> int:
    stage = stage_for(game)
    if stage["id"] == "S0":
        return 0
    return max(0, int(stage["end"] - elapsed_seconds(game) + 0.999))


def create_game(db: Session) -> GameSession:
    game = GameSession(room_code=make_room_code())
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


def active_game(db: Session) -> GameSession:
    game = db.query(GameSession).order_by(GameSession.id.desc()).first()
    return game or create_game(db)


def team_for_name(name: str):
    for team_id, team in content.TEAMS.items():
        if name in team["members"] and team["condition"] != "AI":
            return team_id
    return None


def join_player(db: Session, game: GameSession, name: str, spectator=False, team_id=None) -> Player:
    existing = db.query(Player).filter_by(session_id=game.id, name=name).first()
    if existing:
        return existing
    resolved_team = team_for_name(name) or team_id or "OBS"
    if resolved_team == "OBS":
        spectator = True
    player = Player(
        id=str(uuid.uuid4()), session_id=game.id, name=name.strip()[:120], team_id=resolved_team,
        spectator=spectator, late=game.started_at is not None,
    )
    if player.late and not player.spectator:
        team_late_count = db.query(Player).filter_by(session_id=game.id, team_id=resolved_team, late=True).count()
        card = content.LATE_CARD_ORDER[(team_late_count - 1) % len(content.LATE_CARD_ORDER)]
        player.cards_json = json.dumps([card])
        occupied = [p.seat for p in db.query(Player).filter_by(session_id=game.id, team_id=resolved_team).all() if p.seat]
        player.seat = max(occupied, default=0) + 1
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def deal_team(db: Session, game: GameSession, team_id: str, is_ai=False):
    if is_ai:
        members = content.TEAMS[team_id]["members"]
        players = []
        for member in members:
            player = Player(
                id=str(uuid.uuid4()), session_id=game.id, name=member, team_id=team_id,
                is_ai=True, spectator=False,
            )
            db.add(player)
            players.append(player)
        db.flush()
    else:
        roster = content.TEAMS[team_id]["members"]
        players = db.query(Player).filter_by(session_id=game.id, team_id=team_id, spectator=False).all()
        players.sort(key=lambda p: roster.index(p.name) if p.name in roster else 999)
    if not players:
        return
    deal = content.DEALS[min(len(players), 5)]
    for index, player in enumerate(players[:5]):
        player.seat = index + 1
        player.cards_json = json.dumps(deal[index])


def start_game(db: Session, game: GameSession):
    if game.started_at is not None:
        return game
    for team_id in ["H4", "H5", "X4", "X5"]:
        deal_team(db, game, team_id)
    for team_id in ["A4", "A5"]:
        deal_team(db, game, team_id, is_ai=True)
    game.elapsed_base = 0
    game.started_at = now_utc()
    game.paused = False
    db.commit()
    return game


def pause_game(db: Session, game: GameSession):
    if game.started_at and not game.paused:
        game.elapsed_base = elapsed_seconds(game)
        game.paused = True
        db.commit()


def resume_game(db: Session, game: GameSession):
    if game.started_at and game.paused:
        game.started_at = now_utc()
        game.paused = False
        db.commit()


def skip_stage(db: Session, game: GameSession):
    if game.started_at is None:
        return
    elapsed = elapsed_seconds(game)
    target = next((boundary for boundary in content.STAGE_BOUNDARIES if boundary > elapsed + 0.01), 1200)
    game.elapsed_base = target
    game.started_at = now_utc()
    db.commit()


def ensure_commanders(db: Session, game: GameSession):
    if stage_for(game)["id"] not in {"S7", "S8", "S9"}:
        return
    for team_id in content.TEAMS:
        row = db.query(TeamDrop).filter_by(session_id=game.id, team_id=team_id).first()
        if row:
            continue
        players = db.query(Player).filter_by(session_id=game.id, team_id=team_id, spectator=False).all()
        commander = random.Random(f"{game.id}-{team_id}").choice(players) if players else None
        db.add(TeamDrop(session_id=game.id, team_id=team_id, commander_player_id=commander.id if commander else None))
    db.commit()


def fallback_drops(db: Session, game: GameSession, team_id: str):
    rounds = {}
    for round_no in [2, 1]:
        counts = Counter()
        rows = db.query(Submission).filter_by(session_id=game.id, team_id=team_id, round=round_no).all()
        for row in rows:
            counts.update(json.loads(row.stars_json))
        rounds[round_no] = counts
    ranked = sorted(content.CANDIDATES, key=lambda place: (-rounds[2][place], -rounds[1][place], content.CANDIDATES.index(place)))
    return ranked[:2]


def ensure_final_drops(db: Session, game: GameSession):
    if elapsed_seconds(game) < 750:
        return
    ensure_commanders(db, game)
    for row in db.query(TeamDrop).filter_by(session_id=game.id).all():
        choices = json.loads(row.choices_json)
        if len(choices) != 2:
            row.choices_json = json.dumps(fallback_drops(db, game, row.team_id))
            row.source = "fallback"
    db.commit()

