# KesslerX HCAT Tech Handover

## 1. System Snapshot
- Frontend: React + Vite tactical HUD and landing/app routes.
- Backend: FastAPI service for satellite catalog, simulation scenarios, ML analysis, and AI explanation.
- Core data path: catalog cache -> orbital analysis -> alert/zone generation -> target analysis -> UI overlays.

## 2. AI/ML Components
- ML uncertainty model: `IsolationForest` + `StandardScaler` in `server/app/ml/debris_model.py`.
- Global analytics: conjunction alerts + uncertainty zones in `server/app/core/catalog.py`.
- AI explanation engine: Gemini via LangChain in `server/app/core/rag.py`.

## 3. Runtime Health Check (latest)
Environment tested: local venv Python 3.12.5, Redis not running.

- `/api/health`: PASS (`redis_connected: no`, service responsive).
- `/api/analysis/overview`: PASS (returns zones + alerts).
- `/api/analysis/target/{norad_id}`: PASS (target risk payload returned).
- `/api/analysis/uncertainty/{norad_id}`: PASS (model trains/scores from local cache fallback).
- RAG engine: PASS with graceful fallback (Gemini disabled because `GEMINI_API_KEY` not configured).

## 4. Bugs Fixed During This Verification
### A. Health endpoint crash when Redis was down
- File: `server/app/api/routes.py`
- Fix: wrapped Redis ping in safe `try/except`; endpoint now returns healthy service status even if Redis is unavailable.

### B. Catalog load hard-failed on Redis connection errors
- File: `server/app/core/catalog.py`
- Fix: wrapped Redis `get` in safe `try/except`; now correctly falls back to local `tle_cache.json`.

### C. ML model training/scoring failed without Redis
- File: `server/app/ml/debris_model.py`
- Fix: wrapped Redis read in safe `try/except`; model now trains and scores using local cache if Redis is offline.

## 5. Operational Notes
- Redis is optional for local operation now (graceful fallback enabled in health/catalog/model paths).
- Cache mode is now configurable via `cache_backend` in `server/app/core/config.py`.
- Default cache mode is local JSON. Set `CACHE_BACKEND=redis` in `server/.env` to enable Redis cache mode.
- For full AI explanation generation (not fallback message), set `GEMINI_API_KEY` in `server/.env`.
- Existing local cache (`server/tle_cache.json`) is currently sufficient for model training and analysis routes.

## 6. Quick Validation Commands
- Backend health and routes:
  - `python -m uvicorn app.main:app --reload --app-dir server`
  - open `/docs`, test `/api/health`, `/api/analysis/overview`, `/api/analysis/target/{id}`, `/api/analysis/uncertainty/{id}`
- Frontend build:
  - `npm run client:build`

## 7. Remaining Known Gap
- AI explanation endpoint uses fallback text until Gemini API key is configured. This is expected behavior, not a runtime bug.
