import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import game, main
from app.database import Base


class SessionReplacementTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def assert_stale_session(self, call, message):
        with self.assertRaises(HTTPException) as caught:
            call()
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(caught.exception.detail, message)

    def test_new_session_invalidates_old_player_lobby_and_join(self):
        old_game = game.create_game(self.db)
        old_player = game.join_player(self.db, old_game, "Ben Knell")
        self.assertEqual(main.state(old_player.id, self.db)["room_code"], old_game.room_code)

        new_game = game.create_game(self.db)

        self.assert_stale_session(
            lambda: main.state(old_player.id, self.db),
            "Session replaced",
        )
        self.assert_stale_session(
            lambda: main.lobby(old_game.room_code, self.db),
            "This session has ended",
        )
        self.assert_stale_session(
            lambda: main.join(main.JoinBody(room_code=old_game.room_code, name="Isabella Cooper"), self.db),
            "This session has ended",
        )

        current_lobby = main.lobby(None, self.db)
        self.assertEqual(current_lobby["room_code"], new_game.room_code)
        joined = main.join(main.JoinBody(room_code=new_game.room_code, name="Isabella Cooper"), self.db)
        self.assertFalse(joined["spectator"])


if __name__ == "__main__":
    unittest.main()
