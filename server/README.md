# KesslerX Server (FastAPI)

Backend for the tracked-object feed used by the KesslerX globe.

## Structure

- `app/main.py` -> FastAPI app and `/api` router mount
- `app/api/routes.py` -> health and satellite feed endpoints
- `app/core/config.py` -> env-driven settings
- `run.py` -> local development entrypoint
- `tle_cache.json` -> cached Space-Track response data

## Quick start

```bash
cd server
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

API runs at `http://127.0.0.1:8000`.

## Environment

`/api/satellites` requires Space-Track credentials in `.env`:

```env
SPACETRACK_USER=your-email
SPACETRACK_PASS=your-password
```

## Endpoints

- `GET /api/health`
- `GET /api/satellites`

The satellites endpoint returns:

- tracked GP objects from Space-Track
- a cache status (`fresh_cache`, `stale_cache_waiting_for_window`, `newly_fetched`)
- whether the response came from cache
- cache age and fetch-window metadata
