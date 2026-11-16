import asyncio
import json
import os
import re
import time
from collections import Counter
import httpx

from . import content, game
from .database import SessionLocal
from .models import AIVote, AssistantMessage, BoardPost, GameSession, Player, Submission, TeamDrop

LLM_MODE = os.getenv("LLM_MODE", "mock").lower()
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_TIMEOUT = float(os.getenv("DEEPSEEK_TIMEOUT", "60"))
MODEL_SEMAPHORE = asyncio.Semaphore(5)


def card_payload(player: Player):
    return [{"id": card_id, **content.CARDS[card_id]} for card_id in json.loads(player.cards_json)]


def clean_json(text: str):
    match = re.search(r"\{.*\}|\[.*\]", text, re.S)
    if not match:
        raise ValueError("No JSON in model response")
    return json.loads(match.group(0))


async def deepseek(messages, timeout=None):
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    async with MODEL_SEMAPHORE:
        async with httpx.AsyncClient(timeout=timeout or DEEPSEEK_TIMEOUT) as client:
            response = await client.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                json={
                    "model": DEEPSEEK_MODEL,
                    "messages": messages,
                    "temperature": 0.25,
                    "max_tokens": 256,
                    "thinking": {"type": "disabled"},
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()


async def call_with_retry(messages):
    error = None
    for _ in range(2):
        try:
            return await deepseek(messages)
        except Exception as exc:
            error = exc
    raise error


def assistant_system_prompt(player: Player, released: bool):
    cards = "\n".join(f"{card['id']} — {card['role']}: {card['text']}" for card in card_payload(player))
    places = ", ".join(content.PLACES[item]["name"] for item in content.CANDIDATES)
    log_line = f"A new log entry has arrived: {content.MINUTE_SIX_LOG}" if released else "No new log entry has been released yet."
    return (
        "You are a mission assistant for one member of a rescue team searching for the missing ship *Blue Space*. "
        f"Here is the mission briefing: {content.BRIEFING}. The possible locations are: {places}. "
        f"Your teammate holds these clue cards: {cards}. {log_line} "
        "Help your teammate understand their own cards and think about what to ask the others. Use only facts from the briefing, "
        "the cards and the log. Do not invent new facts. You do not know what is on anyone else's cards. "
        "Do not decide the final answer for them. Keep replies under 80 words."
    )


async def assistant_reply(player: Player, question: str, released: bool, history: list[dict]):
    if LLM_MODE == "mock":
        await asyncio.sleep(0.02)
        card_ids = json.loads(player.cards_json)
        if "AS-B" in card_ids:
            return "Your card links the Orange Planet, the Veil, shelter from storms, and weak broken signals. Ask who has evidence about the ship's route after it left the Green Planet, and who knows whether it reached the Orange Planet."
        return "Start with the concrete time, place, energy, or signal facts on your cards. Ask teammates who has evidence that connects to those facts. Keep possibilities open until you can link at least two independent clues."
    messages = [{"role": "system", "content": assistant_system_prompt(player, released)}]
    messages.extend(history[-8:])
    messages.append({"role": "user", "content": question})
    return await call_with_retry(messages)


def mock_agent_result(player: Player, action: str):
    cards = set(json.loads(player.cards_json))
    if action == "stars1":
        if "AS-B" in cards or "MP-B" in cards:
            return ["veil", "orange", "storm"]
        if "RO-B" in cards or "OB-A" in cards:
            return ["green", "debris", "orange"]
        return ["orange", "storm", "debris"]
    if action == "stars2":
        return ["veil", "veil", "orange"]
    if action == "vote":
        return ["veil", "orange"]
    if action.startswith("discussion"):
        if "AS-B" in cards:
            return "The Veil shelters ships from storms and turns outgoing signals weak and broken. The new message may fit that pattern."
        if "OB-B" in cards:
            return "The Orange Planet station recorded no arrival after Hour 30, so the ship may have stopped just short of it."
        if "CO-B" in cards:
            return "A B-named ship left the Green Planet at Hour 26 for the Orange Planet after recharging."
        return "My cards narrow the route, but we should connect them with evidence about the storm, recharge, and broken signal."
    raise ValueError(action)


async def agent_result(player: Player, action: str, board_text: str):
    if LLM_MODE == "mock":
        await asyncio.sleep(0.01)
        return mock_agent_result(player, action)
    cards = "\n".join(f"{item['id']}: {item['text']}" for item in card_payload(player))
    common = f"Briefing: {content.BRIEFING}\nYour cards:\n{cards}\nTeam board:\n{board_text[-6000:]}\nPossible ids: {content.CANDIDATES}."
    if action in {"stars1", "stars2"}:
        prompt = common + "\nReturn exactly three location ids as a JSON array. Repeats are allowed. Return JSON only."
    elif action == "vote":
        prompt = common + "\nVote for exactly two different drop sites. Return two location ids as a JSON array only."
    else:
        prompt = common + "\nPost one useful contribution to the team discussion, at most 60 words. Do not claim facts absent from the briefing, cards, log, or board."
    text = await call_with_retry([{"role": "system", "content": "You are one bounded-information agent on a rescue team."}, {"role": "user", "content": prompt}])
    return clean_json(text) if action in {"stars1", "stars2", "vote"} else text[:500]


def valid_stars(value, count, distinct=False):
    return isinstance(value, list) and len(value) == count and all(item in content.CANDIDATES for item in value) and (not distinct or len(set(value)) == count)


async def run_agent_calls(players, action, board_text=""):
    async def one(player):
        try:
            return player.id, await agent_result(player, action, board_text)
        except Exception as exc:
            print(f"AI call skipped ({action}, {player.team_id}): {type(exc).__name__}: {str(exc)[:180]}")
            return player.id, None
    return dict(await asyncio.gather(*(one(player) for player in players)))


async def process_ai_stage(game_id: int, stage_id: str):
    db = SessionLocal()
    try:
        players = db.query(Player).filter(Player.session_id == game_id, Player.is_ai.is_(True)).order_by(Player.team_id, Player.seat).all()
        if not players:
            return
        if stage_id in {"S2", "S6"}:
            round_no = 1 if stage_id == "S2" else 2
            missing = [p for p in players if not db.query(Submission).filter_by(player_id=p.id, round=round_no).first()]
            detached = [(p.id, p.team_id, p.name, p.cards_json) for p in missing]
            db.close()
            proxies = [Player(id=i, team_id=t, name=n, cards_json=c, session_id=game_id, spectator=False, is_ai=True, late=False) for i,t,n,c in detached]
            results = await run_agent_calls(proxies, f"stars{round_no}")
            db = SessionLocal()
            for player_id, team_id, _, _ in detached:
                stars = results.get(player_id)
                if valid_stars(stars, 3):
                    db.add(Submission(player_id=player_id, session_id=game_id, team_id=team_id, round=round_no, stars_json=json.dumps(stars)))
            db.commit()
        elif stage_id == "S3":
            for player in players:
                if not db.query(BoardPost).filter_by(session_id=game_id, player_id=player.id, kind="card").first():
                    text = " ".join(f"[{card['id']}] {card['text']}" for card in card_payload(player))
                    db.add(BoardPost(session_id=game_id, team_id=player.team_id, player_id=player.id, author=player.name, text=text, kind="card", game_minute=2))
            db.commit()
        elif stage_id == "S4":
            for team_id in ["A4", "A5"]:
                if not db.query(BoardPost).filter_by(session_id=game_id, team_id=team_id, kind="minute-6").first():
                    db.add(BoardPost(session_id=game_id, team_id=team_id, author="Deep Space Network", text=content.MINUTE_SIX_LOG, kind="minute-6", game_minute=6))
            db.commit()
        elif stage_id == "S5":
            for round_no in [1, 2]:
                kind = f"ai-discussion-{round_no}"
                missing = [p for p in players if not db.query(BoardPost).filter_by(session_id=game_id, player_id=p.id, kind=kind).first()]
                if missing:
                    board = "\n".join(post.text for post in db.query(BoardPost).filter_by(session_id=game_id).order_by(BoardPost.id).all())
                    detached = [(p.id, p.team_id, p.name, p.cards_json) for p in missing]
                    db.close()
                    proxies = [Player(id=i, team_id=t, name=n, cards_json=c, session_id=game_id, spectator=False, is_ai=True, late=False) for i,t,n,c in detached]
                    results = await run_agent_calls(proxies, f"discussion{round_no}", board)
                    db = SessionLocal()
                    for player_id, team_id, name, _ in detached:
                        text = results.get(player_id)
                        if isinstance(text, str) and text:
                            db.add(BoardPost(session_id=game_id, team_id=team_id, player_id=player_id, author=name, text=text, kind=kind, game_minute=7 + round_no))
                    db.commit()
                    break
        elif stage_id == "S7":
            missing = [p for p in players if not db.query(AIVote).filter_by(session_id=game_id, player_id=p.id).first()]
            if missing:
                board = "\n".join(post.text for post in db.query(BoardPost).filter_by(session_id=game_id).order_by(BoardPost.id).all())
                detached = [(p.id, p.team_id, p.name, p.cards_json) for p in missing]
                db.close()
                proxies = [Player(id=i, team_id=t, name=n, cards_json=c, session_id=game_id, spectator=False, is_ai=True, late=False) for i,t,n,c in detached]
                results = await run_agent_calls(proxies, "vote", board)
                db = SessionLocal()
                for player_id, team_id, _, _ in detached:
                    choices = results.get(player_id)
                    if valid_stars(choices, 2, distinct=True):
                        db.add(AIVote(session_id=game_id, team_id=team_id, player_id=player_id, choices_json=json.dumps(choices)))
                db.commit()
            for team_id in ["A4", "A5"]:
                team_players = [p for p in players if p.team_id == team_id]
                votes = db.query(AIVote).filter_by(session_id=game_id, team_id=team_id).all()
                if len(votes) == len(team_players):
                    counts = Counter(choice for vote in votes for choice in json.loads(vote.choices_json))
                    round2 = Counter()
                    for row in db.query(Submission).filter_by(session_id=game_id, team_id=team_id, round=2).all():
                        round2.update(json.loads(row.stars_json))
                    picks = sorted(content.CANDIDATES, key=lambda item: (-counts[item], -round2[item], content.CANDIDATES.index(item)))[:2]
                    drop = db.query(TeamDrop).filter_by(session_id=game_id, team_id=team_id).first()
                    if drop:
                        drop.choices_json = json.dumps(picks)
                        drop.source = "ai-vote"
            db.commit()
    finally:
        db.close()


async def ai_stage_loop():
    last_key = None
    while True:
        try:
            db = SessionLocal()
            current = db.query(GameSession).order_by(GameSession.id.desc()).first()
            if current and current.started_at:
                stage_id = game.stage_for(current)["id"]
                key = (current.id, stage_id)
                db.close()
                await process_ai_stage(*key)
                last_key = key
            else:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"AI stage loop warning: {exc}")
        await asyncio.sleep(0.6 if LLM_MODE == "mock" else 1.5)

