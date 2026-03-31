# KesslerX

KesslerX is a space surveillance and orbital risk intelligence system focused on collision risk under uncertainty.

Instead of claiming exact collision prediction, the project screens tracked-object behavior, estimates debris-heavy operating conditions, and presents explainable operator guidance to help prevent cascading failures associated with Kessler syndrome.

## What the current repo does

- Renders a real-time 3D globe with tracked satellites, rocket bodies, and debris
- Fetches recent LEO GP objects from Space-Track through a FastAPI backend
- Propagates TLEs in the frontend to animate object motion and orbit tracks
- Screens a selected target against nearby tracked objects across a sampled 90-minute window
- Produces a heuristic uncertainty score based on nearby debris density
- Opens a deep-analysis overlay with a risk summary, screened closest approach, and mitigation guidance
- Includes a simulation-control surface for demo playback and scenario interactions

## Repo layout

```text
KesslerX/
|-- client/
|   |-- src/
|   |   |-- components/
|   |   |   |-- hud/
|   |   |   |-- map/
|   |   |   |-- panels/
|   |   |   `-- ui/
|   |   |-- constants/
|   |   |-- hooks/
|   |   |-- styles/
|   |   `-- utils/
|   |-- .env.example
|   |-- package.json
|   `-- vite.config.js
|-- server/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   `-- main.py
|   |-- .env.example
|   |-- requirements.txt
|   |-- run.py
|   `-- tle_cache.json
|-- README.md
`-- package.json
```

## Architecture

```text
React + Three.js globe
        |
        v
Tracked-object selection + orbit propagation
        |
        v
Sampled conjunction screening
        |
        v
Debris-density uncertainty heuristic
        |
        v
Deep analysis briefing + mitigation suggestions
```

## Run locally

### Backend

```powershell
cd server
.venv\Scripts\python.exe run.py
```

If you do not have `server/.venv` yet:

```powershell
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

### Frontend

```powershell
cd client
npm run dev
```

The frontend uses `/api` by default and Vite proxies that to `http://127.0.0.1:8000` in development.

## Important env vars

### Frontend

`client/.env.example`

```env
VITE_API_BASE_URL=/api
VITE_DEV_API_TARGET=http://127.0.0.1:8000
```

### Backend

`server/.env.example`

```env
API_HOST=127.0.0.1
API_PORT=8000
SPACETRACK_USER=
SPACETRACK_PASS=
```

## Current implementation notes

- The tracked-object feed is live and backed by Space-Track caching.
- The current deep-analysis layer is heuristic and operator-facing.
- The repo is structured to support future upgrades such as:
  - higher-fidelity risk engines with exact TCA workflows
  - ML-based uncertainty models
  - retrieval-backed explanation services

## One-line summary

KesslerX screens orbital risk under uncertainty and explains it clearly enough to support safer decisions before cascading collisions occur.
