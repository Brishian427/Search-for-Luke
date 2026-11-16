import unittest

from app import ai, content, orbits
from app.models import Player


AS_B_TEXT = "The Orange Planet is a huge gas planet that circles Reach. Far beyond its orbit lies a white nebula that never moves. Old pilots call it the Veil. Once each orbit, seen from Reach, the Orange Planet passes right in front of the Veil. Inside the Veil, storms cannot hurt you. But any signal that comes out of the Veil becomes weak and broken, as if it had passed through a thick blanket. Old pilots also say the Veil never gives back what it hides."
BRIEFING_APPENDIX = "The navigation chart has a timeline. Drag it to see where each world was at any hour. The Blue Space flies about 20 map units per hour."


class ContentAndPromptTests(unittest.TestCase):
    def test_replacement_content_is_verbatim(self):
        self.assertEqual(content.CARDS["AS-B"]["text"], AS_B_TEXT)
        self.assertIn(BRIEFING_APPENDIX, content.BRIEFING.splitlines()[1])

    def test_both_system_prompts_include_shared_chart_timeline(self):
        timeline = orbits.chart_timeline_prompt()
        player = Player(cards_json='["AS-B"]')
        self.assertIn(timeline, ai.assistant_system_prompt(player, released=False))
        self.assertIn(timeline, ai.agent_system_prompt())
        for prompt in (ai.assistant_system_prompt(player, released=False), ai.agent_system_prompt()):
            self.assertIn("48 |", prompt)
            self.assertIn("The Veil and the Debris Belt never move.", prompt)


if __name__ == "__main__":
    unittest.main()
