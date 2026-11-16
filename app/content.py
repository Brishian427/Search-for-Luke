TITLE = "Search for Luke"
TRUTH = "veil"

PLACES = {
    "reach": {"name": "Reach", "x": 100, "y": 300, "candidate": False, "kind": "home"},
    "storm": {"name": "Storm Zone", "x": 450, "y": 300, "candidate": True, "kind": "storm"},
    "orange": {"name": "Orange Planet", "x": 720, "y": 280, "candidate": True, "kind": "planet-large"},
    "veil": {"name": "the Veil", "x": 860, "y": 250, "candidate": True, "kind": "cloud"},
    "green": {"name": "Green Planet", "x": 380, "y": 470, "candidate": True, "kind": "planet"},
    "red": {"name": "Red Planet", "x": 300, "y": 120, "candidate": True, "kind": "planet"},
    "debris": {"name": "Debris Belt", "x": 555, "y": 485, "candidate": True, "kind": "debris"},
}

CANDIDATES = ["storm", "orange", "veil", "green", "red", "debris"]

BRIEFING = """Luke is a scientist of the Imperium of Man, serving under the command of Guilliman during the Great Crusade. He left the planet Reach on the ship *Blue Space*, heading for the Orange Planet. His position was last confirmed at Hour 0. He was supposed to check in at Hour 36, but he never did.
It is now Hour 48. He could be at any of the six places on the map. We can drop only two Helldiver squads, and each squad can search only the area around where it lands. The navigation chart has a timeline. Drag it to see where each world was at any hour. The Blue Space flies about 20 map units per hour.
Each of you holds one private intelligence dossier. Its clue fragments are fixed to you and will not be reassigned. Alone, it does not tell you much. Together, your dossiers may bring him home."""

CARDS = {
    "MP-A": {"role": "Mission Planner", "text": "Luke is a scientist of the Imperium of Man. This time, he flew the *Blue Space* to the Orange Planet to collect a rare mineral called spice. Spice only appears when a storm calms down, and in two days it will be gone. Luke is known for being stubborn. Once he agrees to do something, he never gives up halfway. People say his ship carries only two things: fuel, and a reason not to turn back."},
    "MP-B": {"role": "Mission Planner, from the flight manual", "text": "If you meet a storm, stop and wait until it calms down. If a storm hits while you are near a large celestial body, hide behind it. While hiding, stay quiet. Send only low-power signals."},
    "RO-A": {"role": "Resource Officer", "text": "The *Blue Space* carries just enough energy to fly from Reach to the Orange Planet and back. Nothing extra. Flying is not what uses the most energy. Waiting is. To keep the ship warm and safe, waiting in one place burns much more energy than flying."},
    "RO-B": {"role": "Resource Officer", "text": "This part of space is very poor in resources. For years, the only place where a ship can recharge has been an empty supply station above the Green Planet. Pilots call it the Old Lighthouse. A full recharge takes 6 hours."},
    "AS-A": {"role": "Astronomer", "text": "Green Planet: a cold, rocky planet with a supply station above it. Red Planet: home to an observation station. From there, you can see the Green Planet and the Debris Belt. Debris Belt: full of broken pieces of old satellites. Radar often 'sees' things here that look like ships. Most are false alarms. But now and then, someone says they saw a shadow there that looked like a lost ship."},
    "AS-B": {"role": "Astronomer", "text": "The Orange Planet is a huge gas planet that circles Reach. Far beyond its orbit lies a white nebula that never moves. Old pilots call it the Veil. Once each orbit, seen from Reach, the Orange Planet passes right in front of the Veil. Inside the Veil, storms cannot hurt you. But any signal that comes out of the Veil becomes weak and broken, as if it had passed through a thick blanket. Old pilots also say the Veil never gives back what it hides."},
    "OB-A": {"role": "Observer, Red Planet station log", "text": "Hour 14: The storm stopped for a while. Through the telescope, I saw a small point of light leave the route to the Orange Planet. It moved slowly toward the Green Planet. I called it. No answer. The light was steady, as if it knew where it was going. Hour 29: Radar says there is something at the edge of the Debris Belt, about the size of a ship."},
    "OB-B": {"role": "Observer, Orange Planet sampling station (automatic log)", "text": "[Sampling station report] Since Hour 30, no ship has arrived. The sampling machines are still asleep. No one has woken them. Hour 34: The storm is back. Station switching to shelter mode."},
    "CO-A": {"role": "Comms Officer", "text": "At Hour 8, we got the last message from the *Blue Space*: 'Storm ahead. We are stopping to wait.' After that, nothing. Then the channel went quiet, except for the soft hiss of the stars."},
    "CO-B": {"role": "Comms Officer, Old Lighthouse automatic log", "text": "[Old Lighthouse log] Hour 20: A ship arrived to recharge. Only the first letter of its name was readable: B. Hour 26: Recharge complete. Ship departed. Stated destination: the Orange Planet. The Old Lighthouse keeps shining. It never asks who its visitors are, or where they are going."},
}

MINUTE_SIX_LOG = "New message from the deep space network: At Hour 40, we picked up a weak, broken signal from the direction of the Orange Planet. We could not tell who sent it."

CONNECTION_PAIRS = [
    {"cards": ["RO-A", "CO-A"], "meaning": "energy ran out while waiting"},
    {"cards": ["RO-B", "OB-A"], "meaning": "it went to recharge at the Green Planet"},
    {"cards": ["CO-B"], "meaning": "it left the Green Planet for the Orange Planet"},
    {"cards": ["OB-B"], "meaning": "it never reached the Orange Planet"},
    {"cards": ["MP-B", "AS-B"], "meaning": "it hid behind the Orange Planet, in the Veil"},
    {"cards": ["MINUTE-6", "AS-B"], "meaning": "the weak, broken signal came from the Veil"},
    {"cards": ["AS-A", "OB-A"], "meaning": "the Debris Belt echo is probably a false alarm"},
]

QUESTIONS = [
    """**Question 1 (Gupta et al., 2025).** Gupta et al. (2025) argue that any intelligent sociotechnical system depends on three transactive systems: collective memory (who knows what), collective attention (what the group focuses on), and collective reasoning (how members combine their inputs). In our search for Luke, the key to interpreting the minute-6 message was already in the room, on one person's card. Did your team retrieve it in time? If so, what made that happen; if not, which of the three systems broke down? In the Human + AI teams, did the assistants strengthen these systems, for example by prompting players to ask \"who else knows about the Orange Planet?\", or did they substitute for them, so that players talked to their AI instead of to each other?""",
    """**Question 2 (Peeters et al., 2021).** Peeters et al. (2021) contrast three views of AI: a technology-centric view (AI will outperform humans), a human-centric view (humans remain superior in social respects), and a collective-intelligence-centric view, which locates intelligence in the collective of human and artificial agents and warns that the biggest risks emerge at the system level. Today, six teams in three conditions had identical information but different architectures. Which view does our result support, and would your answer change if the result had come out the other way? Now take a real setting where clues are scattered across specialists, such as a hospital team diagnosing a rare disease or an engineering team responding to a system outage. If you were designing that human–AI system, what would you decide about what each AI can see, when it speaks, and who makes the final call? What system-level failure would worry you most?""",
]

TEAMS = {
    "H4": {"condition": "Human", "members": ["Ben Knell", "Isabella Cooper", "Eva Hu", "Kyle Miller"]},
    "H5": {"condition": "Human", "members": ["Sharon Geng", "Muxin Tan", "Paolo Diaz Andrade", "Runzhi Li", "Yinyuan Chen"]},
    "X4": {"condition": "Human + AI", "members": ["Sam Salin", "Yi Wang", "Amber Tang", "Emely Antunes Otsuka"]},
    "X5": {"condition": "Human + AI", "members": ["Silvia Chen", "Varshini Narayanan", "Xiaoyu Li", "Mei Yang", "Tong Li"]},
    "A4": {"condition": "AI", "members": ["Agent 1", "Agent 2", "Agent 3", "Agent 4"]},
    "A5": {"condition": "AI", "members": ["Agent 1", "Agent 2", "Agent 3", "Agent 4", "Agent 5"]},
}

# A roster seat owns one immutable private dossier. These packets are based on
# the complete roster size, never on how many people happen to be online when
# the mission starts. If a member is absent, their packet stays unavailable.
FIXED_CARD_PACKETS = {
    5: [["RO-A", "AS-B"], ["RO-B", "CO-A"], ["OB-A", "MP-B"], ["AS-A", "CO-B"], ["MP-A", "OB-B"]],
    4: [["RO-A", "AS-B", "OB-B"], ["RO-B", "CO-A", "MP-A"], ["OB-A", "MP-B"], ["AS-A", "CO-B"]],
}

STAGES = [
    {"id": "S1", "name": "Briefing", "start": 0, "end": 60, "instruction": "Read the mission briefing and your private intelligence dossier."},
    {"id": "S2", "name": "First guess", "start": 60, "end": 120, "instruction": "Do not talk yet. Place 3 stars where you think Luke is."},
    {"id": "S3", "name": "Share", "start": 120, "end": 360, "instruction": "Take turns reading your private dossiers aloud."},
    {"id": "S4", "name": "New log", "start": 360, "end": 420, "instruction": "A new message has arrived. Check your log."},
    {"id": "S5", "name": "Discuss", "start": 420, "end": 630, "instruction": "Discuss. You can change your mind later."},
    {"id": "S6", "name": "Second guess", "start": 630, "end": 690, "instruction": "Place your 3 stars again."},
    {"id": "S7", "name": "Drop", "start": 690, "end": 750, "instruction": "Choose 2 drop sites."},
    {"id": "S8", "name": "Reveal", "start": 750, "end": 840, "instruction": "Look at the main screen."},
    {"id": "S9", "name": "Questions", "start": 840, "end": 1200, "instruction": "Discussion time."},
]

STAGE_BOUNDARIES = [60, 120, 360, 420, 630, 690, 750, 840, 1200]

