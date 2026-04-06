# KesslerX Server (FastAPI)

Backend service for catalog ingestion, orbital risk analysis, scenario simulation, and AI/ML endpoints.

## Responsibilities

- Serve satellite catalog data to the frontend
- Compute global alerts and uncertainty zones
- Produce target-level risk analysis
- Run scenario operations (inject, collision, reset)
- Provide uncertainty scoring via ML and optional AI explanation generation

## API Groups

- `/api/*` -> health + satellites
- `/api/analysis/*` -> overview, target analysis, uncertainty, explain
- `/api/scenario/*` -> simulation mutation endpoints

## Cache Mode (Important)

The backend is configured for **local JSON cache by default**.

- Default: `CACHE_BACKEND=local`
- Optional future mode: `CACHE_BACKEND=redis`

This keeps local development simple while preserving Redis support for scale-out deployments.

### Local cache files

- `tle_cache.json`
- `tle_cache_meta.json`
- `tle_cache_baseline.json`
- `tle_cache_baseline_meta.json`

## Setup

```bash
cd server
python -m venv .venv
```

Activate env:

- Windows:

```bash
.venv\Scripts\activate
```

- macOS/Linux:

```bash
source .venv/bin/activate
```

Install and run:

```bash
pip install -r requirements.txt
python run.py
```

Server default URL: `http://127.0.0.1:8000`

## Environment

Create `server/.env`:

```env
SPACETRACK_USER=your_username
SPACETRACK_PASS=your_password

# Optional AI
GEMINI_API_KEY=your_gemini_key

# Cache mode
CACHE_BACKEND=local
# REDIS_URL=redis://localhost:6379/0
```

## Endpoint Reference

- `GET /api/health`
- `GET /api/satellites`
- `GET /api/analysis/overview`
- `GET /api/analysis/target/{norad_id}`
- `GET /api/analysis/uncertainty/{norad_id}`
- `POST /api/analysis/explain`
- `POST /api/scenario/inject`
- `POST /api/scenario/trigger-collision`
- `POST /api/scenario/reset`

## Verification

Quick health/analysis smoke test:

```bash
python -c "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); print(c.get('/api/health').json()); print(c.get('/api/analysis/overview?sim_hours=0').status_code)"
```

## Notes

- If Gemini key is missing, explain endpoint returns a safe fallback message.
- Redis remains supported but is intentionally optional in the current architecture.
