# Search for Luke — Test Report

Date: 2026-11-15 (America/Chicago)  
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
python scripts/simulate.py --base-url http://127.0.0.1:8000 --admin-key test-key
```

Result: **PASS** in 85.35 seconds.

| Check | Result |
| --- | --- |
| Virtual roster | 18 represented; 17 connected |
| Deliberate H5 absence | Yinyuan Chen never joined; H5 received the four-player deal |
| Late join | Tong Li joined X5 after Start and received the first late card (`AS-A`) |
| Stage polling | 60 complete browser-like polling cycles through S1–S9 |
| Stage/instruction agreement | Every connected player saw the expected stage and instruction |
| Card deals | Exact deal tables matched; no player held both sides of a two-card connection pair |
| Truth leakage | No player state contained `truth` before S8 |
| Minute-6 event | Present for every player in the same S4 polling cycle |
| Submission locks | Round 1 rejected after S2; round 2 rejected after S6 |
| Star submissions | 52 persisted: 34 human submissions plus 18 AI submissions |
| Team board and assistants | Human findings persisted; Human + AI assistant calls succeeded in mock mode |
| Final drops | All six teams ended with exactly two different drop sites |
| Reveal scoring | Success, both Veil shares, and mean Brier scores matched an independent recalculation from raw submissions |
| Export privacy | All roster names absent; players referenced by team-seat codes |

Final test room: `IJ6DHD`.

## Load test

Command:

```text
python scripts/load.py --base-url http://127.0.0.1:8000 --admin-key test-key
```

Result: **PASS**.

- 50 legal virtual roster clients across three paused S2 sessions
- 200 measured requests
- P95 latency: **0.6137 seconds**
- Maximum latency: **0.6984 seconds**
- All 50 star submissions sent within **0.7212 seconds**
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
- Clock before shutdown: 428.22 game seconds
- Clock after restart: 460.24 game seconds
- Process restart time: 2.51 real seconds
- Cards, first-round stars, and team-board findings preserved
- Existing player continued posting without rejoining

## Live DeepSeek check

Command:

```text
python scripts/live_check.py --base-url http://127.0.0.1:8000 --admin-key test-key
```

Result: **PASS** with a real key and `deepseek-flash`.

- Five simultaneous Human + AI assistant messages returned successfully
- Assistant latencies: 4541, 4234, 3509, 2863, and 2303 ms
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
- S2 3D chart drag/orbit, wheel zoom, reset view, rotating planet textures, label selection, and persisted submission
- S3 mobile tabs, team-board posting, and assistant reply
- S7 Drop Commander selection and confirmation
- Projector lobby, room code, QR code, and six roster panels
- Projector stage map and six team progress panels
- S8 2 × 3 team reveal, drop-pod landing, result table, and board timeline
- S9 questions and six-team result strip
- Facilitator lobby, controls, live roster, and mobile stacking

Polish fixes made during this pass:

- Mobile projector reveal now uses a two-column scrollable layout instead of clipping the third column.
- Mobile question cards stack into a readable single column.
- Mobile result tables and timelines remain reachable by scrolling.
- S7 empty-selection help now says “choose a drop site” instead of “place a star.”
- Reduced-motion handling remains active for all reveal and glow animation.
- The player chart now uses a locally vendored Three.js scene with an SVG fallback; desktop and 390 × 844 framing both keep all selectable bodies reachable.

## Static and deployment checks

Result: **PASS** for all checks available in this environment.

- `python -m compileall -q app scripts`
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
