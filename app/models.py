from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def utcnow():
    return datetime.utcnow()


class GameSession(Base):
    __tablename__ = "game_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    elapsed_base: Mapped[float] = mapped_column(Float, default=0)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    finished: Mapped[bool] = mapped_column(Boolean, default=False)


class Player(Base):
    __tablename__ = "players"
    __table_args__ = (UniqueConstraint("session_id", "team_id", "name", name="uq_session_team_player_name"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("game_sessions.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    team_id: Mapped[str] = mapped_column(String(8), index=True)
    seat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    late: Mapped[bool] = mapped_column(Boolean, default=False)
    spectator: Mapped[bool] = mapped_column(Boolean, default=False)
    is_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    cards_json: Mapped[str] = mapped_column(Text, default="[]")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("player_id", "round", name="uq_player_round"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("game_sessions.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(8), index=True)
    round: Mapped[int] = mapped_column(Integer)
    stars_json: Mapped[str] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BoardPost(Base):
    __tablename__ = "board_posts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("game_sessions.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(8), index=True)
    player_id: Mapped[str | None] = mapped_column(ForeignKey("players.id"), nullable=True)
    author: Mapped[str] = mapped_column(String(120))
    text: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(24), default="finding")
    game_minute: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("game_sessions.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(8), index=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class TeamDrop(Base):
    __tablename__ = "team_drops"
    __table_args__ = (UniqueConstraint("session_id", "team_id", name="uq_session_team_drop"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("game_sessions.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(8), index=True)
    commander_player_id: Mapped[str | None] = mapped_column(ForeignKey("players.id"), nullable=True)
    choices_json: Mapped[str] = mapped_column(Text, default="[]")
    source: Mapped[str] = mapped_column(String(24), default="commander")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AIVote(Base):
    __tablename__ = "ai_votes"
    __table_args__ = (UniqueConstraint("session_id", "player_id", name="uq_ai_drop_vote"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("game_sessions.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(8), index=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    choices_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


