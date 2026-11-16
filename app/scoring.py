import json
from collections import Counter
from sqlalchemy.orm import Session
from . import content
from .models import AssistantMessage, BoardPost, Player, Submission, TeamDrop


def brier(stars):
    counts = Counter(stars)
    return sum(((counts[place] / 3) - (1 if place == content.TRUTH else 0)) ** 2 for place in content.CANDIDATES)


def session_results(db: Session, session_id: int):
    results = []
    for team_id, team in content.TEAMS.items():
        players = db.query(Player).filter_by(session_id=session_id, team_id=team_id, spectator=False).all()
        drop = db.query(TeamDrop).filter_by(session_id=session_id, team_id=team_id).first()
        drops = json.loads(drop.choices_json) if drop else []
        shares = {}
        all_briers = []
        for round_no in [1, 2]:
            rows = db.query(Submission).filter_by(session_id=session_id, team_id=team_id, round=round_no).all()
            star_lists = [json.loads(row.stars_json) for row in rows]
            total = sum(len(stars) for stars in star_lists)
            shares[str(round_no)] = (sum(stars.count(content.TRUTH) for stars in star_lists) / total) if total else 0
            all_briers.extend(brier(stars) for stars in star_lists)
        posts = db.query(BoardPost).filter_by(session_id=session_id, team_id=team_id).order_by(BoardPost.game_minute, BoardPost.id).all()
        timeline = [{"minute": row.game_minute, "author": row.author, "text": row.text, "kind": row.kind} for row in posts]
        veil_mentions = [row.game_minute for row in posts if "veil" in row.text.lower()]
        assistant_count = db.query(AssistantMessage).filter_by(session_id=session_id, team_id=team_id, role="user").count()
        results.append({
            "team_id": team_id,
            "condition": team["condition"],
            "final_size": len(players),
            "drops": drops,
            "success": content.TRUTH in drops,
            "star_share_round1": shares["1"],
            "star_share_round2": shares["2"],
            "average_brier": sum(all_briers) / len(all_briers) if all_briers else None,
            "assistant_messages": assistant_count,
            "timeline": timeline,
            "first_veil_mention": min(veil_mentions) if veil_mentions else None,
        })
    return results


def anonymized_export(db: Session, session_id: int):
    players = db.query(Player).filter_by(session_id=session_id).order_by(Player.team_id, Player.seat, Player.joined_at).all()
    codes = {}
    observer_count = 0
    for player in players:
        if player.team_id == "OBS":
            observer_count += 1
            codes[player.id] = f"OBS-{observer_count}"
        else:
            codes[player.id] = f"{player.team_id}-{player.seat or 'late'}"
    names_to_codes = {(player.team_id, player.name): codes[player.id] for player in players}
    submissions = db.query(Submission).filter_by(session_id=session_id).order_by(Submission.id).all()
    drops = db.query(TeamDrop).filter_by(session_id=session_id).order_by(TeamDrop.team_id).all()
    board = db.query(BoardPost).filter_by(session_id=session_id).order_by(BoardPost.id).all()
    assistant = db.query(AssistantMessage).filter_by(session_id=session_id).order_by(AssistantMessage.id).all()
    results = session_results(db, session_id)
    for team_result in results:
        for item in team_result["timeline"]:
            item["author"] = names_to_codes.get((team_result["team_id"], item["author"]), item["author"])
    return {
        "session_id": session_id,
        "truth": content.TRUTH,
        "connection_pairs": content.CONNECTION_PAIRS,
        "players": [{"code": codes[p.id], "team_id": p.team_id, "seat": p.seat, "late": p.late, "spectator": p.spectator, "is_ai": p.is_ai,
                     "cards": json.loads(p.cards_json), "joined_at": p.joined_at.isoformat() + "Z"} for p in players],
        "submissions": [{"player": codes[row.player_id], "team_id": row.team_id, "round": row.round, "stars": json.loads(row.stars_json),
                         "submitted_at": row.submitted_at.isoformat() + "Z"} for row in submissions],
        "drops": [{"team_id": row.team_id, "commander": codes.get(row.commander_player_id), "places": json.loads(row.choices_json), "source": row.source} for row in drops],
        "board_posts": [{"team_id": row.team_id, "author": codes.get(row.player_id, row.author), "minute": row.game_minute,
                         "text": row.text, "kind": row.kind} for row in board],
        "assistant_messages": [{"team_id": row.team_id, "player": codes[row.player_id], "role": row.role, "text": row.text,
                                "latency_ms": row.latency_ms} for row in assistant],
        "results": results,
    }

