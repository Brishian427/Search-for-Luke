# Search for Luke

A real-time classroom investigation for roughly 18 players. FastAPI serves the player, projector, and facilitator screens; clients poll every two seconds; SQLite is used locally and Postgres in production. There is no frontend build step.

## Local setup

Requirements: Python 3.11.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

export ADMIN_KEY=change-me       # PowerShell: $env:ADMIN_KEY="change-me"
export LLM_MODE=mock             # PowerShell: $env:LLM_MODE="mock"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open:

- Player: `http://localhost:8000/`
- Projector: `http://localhost:8000/screen`
- Facilitator: `http://localhost:8000/admin?key=change-me`
- Health check: `http://localhost:8000/api/health`

The SQLite database is created as `search_for_luke.db`. Delete it only when you intentionally want to discard all local sessions.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./search_for_luke.db` | SQLAlchemy URL. Use a Postgres connection string in production. |
| `ADMIN_KEY` | `classroom` | Protects facilitator actions and `/api/export`. Set a strong value outside local development. |
| `CLOCK_SPEED` | `1` | Game-clock multiplier. `10` makes the 20-minute game run in two minutes for tests. |
| `LLM_MODE` | `mock` | `mock` uses deterministic canned replies; `live` calls DeepSeek. |
| `DEEPSEEK_API_KEY` | unset | Required only for `LLM_MODE=live`. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI-compatible DeepSeek endpoint. |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Model used for assistants and AI teams. |
| `DEEPSEEK_TIMEOUT` | `60` | Per-attempt model timeout in seconds. A failed call is retried once. |
| `PORT` | `8000` in Docker | HTTP port. Render supplies this automatically. |

Model calls are capped at five concurrent requests. The app requests non-thinking responses capped at 256 tokens, which matches the short classroom answers and keeps live latency predictable.

## Start a classroom game

1. Start the server and open `/admin?key=YOUR_ADMIN_KEY` on the facilitator laptop.
2. Open `/screen` on the projector. It shows the room code and QR code.
3. Players open `/`, enter the room code, and select their roster name. Non-roster visitors can join as spectators.
4. Check the six team cards on the facilitator screen, then press **Start game** once. The server clock advances every stage automatically; no further facilitator action is required.
5. Keep Pause, Resume, and Skip for emergencies only.
6. After the reveal, download the anonymized JSON from the facilitator screen or `/api/export?key=YOUR_ADMIN_KEY`.

Use one app instance only. AI stage work runs inside that process, so horizontally scaling the web service would duplicate model calls.

## Automated checks

Start a mock server in one terminal:

```bash
ADMIN_KEY=test-key CLOCK_SPEED=10 LLM_MODE=mock \
  uvicorn app.main:app --host 127.0.0.1 --port 8000
```

PowerShell equivalent:

```powershell
$env:ADMIN_KEY="test-key"
$env:CLOCK_SPEED="10"
$env:LLM_MODE="mock"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then run:

```bash
python scripts/simulate.py --admin-key test-key
python scripts/load.py --admin-key test-key
python scripts/restart.py
```

- `simulate.py` runs a naturally timed full game, including a missing H5 player and an X5 late join.
- `load.py` creates 50 legal roster clients across three paused sessions and sends simultaneous polls and star submissions.
- `restart.py` launches its own temporary server/database, restarts in mid-S5, and verifies continuity.

For the optional paid live-model check, restart the main server with `LLM_MODE=live`, set `DEEPSEEK_API_KEY`, keep `CLOCK_SPEED=10`, and run:

```bash
python scripts/live_check.py --admin-key test-key
```

## Docker

```bash
docker build -t search-for-luke .
docker run --rm -p 8000:8000 \
  -e ADMIN_KEY=change-me -e LLM_MODE=mock search-for-luke
```

For persistent production data, set `DATABASE_URL` to Postgres rather than storing SQLite inside the container.

## Render deployment

`render.yaml` provisions one always-on Docker web service and one managed Postgres database in Ohio.

1. Push this repository to a Git provider supported by Render.
2. In Render, create a **Blueprint** and select the repository. Render reads `render.yaml` from the repository root.
3. Enter `DEEPSEEK_API_KEY` when prompted. `ADMIN_KEY` is generated automatically; copy its value from the service environment for facilitator access.
4. Apply the Blueprint and wait for `/api/health` to pass.
5. Open the service URL, `/screen`, and `/admin?key=...`; run a short mock rehearsal before class if desired.

The Blueprint deliberately uses paid compute (`0.5c-512mb` for the web service and `0.1c-256mb` for Postgres) so the service stays available instead of sleeping. Keep `numInstances: 1` because the in-process AI stage loop is intentionally single-instance.

## Data and recovery

The authoritative clock and all player data are stored in the database. A process restart preserves the current stage, elapsed clock, cards, submissions, boards, assistant history, and drops. Exports replace roster names with `team-seat` codes.
