# Search for Luke — Test Report

Date: 2026-11-16 (America/Chicago)  
Result: **PASS**

## Test environment

- Python 3.11
- FastAPI + Uvicorn, one process
- Local SQLite database in WAL mode
- Chrome driven through Playwright CLI
- Mock game server: `CLOCK_SPEED=10`, `LLM_MODE=mock`, `ADMIN_KEY=test-key`
- Live check server: `CLOCK_SPEED=10`, `LLM_MODE=live`, real `DEEPSEEK_API_KEY`

## Full automated session

Command:

```text
python scripts/simulate.py --base-url http://127.0.0.1:8012 --admin-key phase-key
```

Result: **PASS** in 85.33 seconds.

| Check | Result |
| --- | --- |
| Virtual roster | 18 represented; 17 connected |
| Deliberate H5 absence | Yinyuan Chen never joined; the fixed seat-5 dossier stayed sealed and was not reassigned |
| Late join | Tong Li joined X5 after Start and received the fixed X5 seat-5 dossier (`MP-A`, `OB-B`) |
| Stage polling | 62 complete browser-like polling cycles through S1–S9 |
| Stage/instruction agreement | Every connected player saw the expected stage and instruction |
| Card ownership | Every connected player received the immutable dossier for their roster seat; no online-count redistribution occurred |
| Player dossier UI | One private dossier rendered per player, with its fixed clue fragments grouped inside |
| Truth leakage | No player state contained `truth` before S8 |
| Minute-6 event | Present for every player in the same S4 polling cycle |
| Submission locks | Round 1 rejected after S2; round 2 rejected after S6 |
| Star submissions | 52 persisted: 34 human submissions plus 18 AI submissions |
| Team board and assistants | Human findings persisted; Human + AI assistant calls succeeded in mock mode |
| Final drops | All six teams ended with exactly two different drop sites |
| Reveal scoring | Success, both Veil shares, and mean Brier scores matched an independent recalculation from raw submissions |
| Export privacy | All roster names absent; players referenced by team-seat codes |

Final test room: `05T3CZ`.

## Load test

Command:

```text
python scripts/load.py --base-url http://127.0.0.1:8012 --admin-key phase-key
```

Result: **PASS**.

- 50 legal virtual roster clients across three paused S2 sessions
- 200 measured requests
- P95 latency: **0.2688 seconds**
- Maximum latency: **0.2896 seconds**
- All 50 star submissions sent within **0.3041 seconds**
- Persisted submissions: **50/50**
- Errors: **0**

This satisfies the target of at least 95% under one second, all submissions inside five seconds, no errors, and no lost writes.

## Restart test

Command:

```text
python scripts/restart.py
```

Result: **PASS**.

- Stage before shutdown: S5
- Stage after restart: S5
- Clock before shutdown: 428.15 game seconds
- Clock after restart: 454.66 game seconds
- Process restart time: 2.32 real seconds
- Cards, first-round stars, and team-board findings preserved
- Existing player continued posting without rejoining

## Live DeepSeek check

Command:

```text
python scripts/live_check.py --base-url http://127.0.0.1:8013 --admin-key phase-live-key
```

Result: **PASS** with a real key and `deepseek-flash`.

- Five simultaneous Human + AI assistant messages returned successfully
- Assistant latencies: 2906, 2372, 2068, 1891, and 2213 ms
- Nine AI agents completed both star rounds
- A4 and A5 completed card sharing, two discussion rounds, final votes, reveal, and questions
- 18 AI discussion posts persisted
- Global concurrent model-call cap remained five
- Live requests used non-thinking mode and a 256-token output cap to meet the short-answer classroom contract

## Browser and visual checks

Result: **PASS**, with zero browser console errors or warnings in the final flows.

Checked at both **1440 × 900** and **390 × 844**:

- Player room entry and roster selection
- Player lobby and sealed-card state
- S1 briefing and dossier cards
- S2 repeated star placement, removal, submission, and confirmation
- S2 coplanar 3D chart, visible orbit paths, unrestricted horizontal orbit around Reach, limited vertical tilt, wheel zoom, reset view, rotating planet textures, label selection, and persisted submission
- S3 mobile tabs, team-board posting, and assistant reply
- S7 Drop Commander selection and confirmation
- Projector lobby, room code, QR code, and six roster panels
- Projector stage map and six team progress panels
- S8 2 × 3 team reveal, drop-pod landing, result table, and board timeline
- S9 questions and six-team result strip
- Facilitator lobby, controls, live roster, and mobile stacking
- Timeline slider drag and direct Hour 0 / 38 / 48 checks; Orange positions matched the shared model within ±0.2
- Star placement remained clickable after moving the timeline
- The ship marker appeared only at Hour 0
- A Green Planet Hour-26 what-if ring grew to 60 units at Hour 29, hid before its start hour, remained private in player-scoped local storage, and cleared on Reset
- Storm Zone was absent from both the WebGL chart and SVG fallback
- At the Hour-38 Orange/Veil conjunction, automatic label separation kept both bodies independently clickable on mobile
- Desktop navigation uses a narrow left instruction rail and a larger full-height chart; mobile returns to a vertical layout with no horizontal overflow

Polish fixes made during this pass:

- Card dossiers now keep their existing DOM nodes between two-second polls, preventing their entrance animation from restarting and visibly flickering.
- Mobile projector reveal now uses a two-column scrollable layout instead of clipping the third column.
- Mobile question cards stack into a readable single column.
- Mobile result tables and timelines remain reachable by scrolling.
- S7 empty-selection help now says “choose a drop site” instead of “place a star.”
- Reduced-motion handling remains active for all reveal and glow animation.
- The player chart now uses a locally vendored Three.js scene with an SVG fallback; desktop and 390 × 844 framing both keep all selectable bodies reachable.

## Orbital model and paper backup

Result: **PASS**.

- One definition, `app/static/orbit-model.json`, is consumed by Python prompt/test code and browser chart code.
- Required model checks passed: Orange at Hours 0, 38, and 48; Green at Hour 26; Veil fixed at all hours.
- Ring sanity check passed: Green Hour 26 to Hour 29 gives radius 60; the fixed Debris Belt is about 110.3 units away.
- Both live system prompts include the generated chart table for Hours 0, 8, 14, 20, 26, 29, 30, 34, 36, 38, 40, and 48.
- No tool/function schema is sent to DeepSeek.
- Playwright PNG backups exist in `backup/chart_hours/` for Hours 00, 08, 14, 20, 26, 29, 34, 38, 40, and 48.

## Static and deployment checks

Result: **PASS** for all checks available in this environment.

- `python -m compileall -q app scripts`
- `python -m unittest discover -s tests -v` (5 passed)
- `node --check app/static/orbit-model.js`
- `node --check app/static/player.js`
- `node --check app/static/star-map-3d.js`
- `node --check app/static/screen.js`
- `git diff --check`
- `render.yaml` parsed successfully as YAML
- Render `DATABASE_URL` normalization selected SQLAlchemy's `postgresql+psycopg` driver
- `/api/health` returned HTTP 200 throughout test runs
- Render Blueprint defines one paid always-on Docker web instance and one paid managed Postgres instance

Docker was not installed on the test machine, so a local `docker build` was not available. The Dockerfile was inspected and its runtime command matches the required Uvicorn start command; Render YAML and the Python/Postgres driver path were validated independently.

## Final status

All required functional, concurrency, persistence, live-model, privacy, scoring, and visual checks passed. No known release blocker remains.
