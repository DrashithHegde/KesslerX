import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.core.redis import get_redis
from app.ml.debris_model import debris_model

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)
redis_client = get_redis() if settings.use_redis_cache else None

SPACETRACK_LOGIN_URL = "https://www.space-track.org/ajaxauth/login"
SPACETRACK_QUERY_URL = (
    "https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/"
    "epoch/%3Enow-10/MEAN_MOTION/%3E11.25/ECCENTRICITY/%3C0.25/orderby/NORAD_CAT_ID/"
    "limit/1000/format/json"
)

REDIS_CACHE_KEY = "kesslerx:satellites"
CACHE_SOURCE_KEY = f"{REDIS_CACHE_KEY}:source"
REDIS_OVERVIEW_CACHE_PREFIX = "kesslerx:analysis_overview"
CACHE_EXPIRY_SECONDS = 3600
LOCAL_CACHE_PATH = Path(__file__).resolve().parents[2] / "tle_cache.json"
LOCAL_CACHE_META_PATH = Path(__file__).resolve().parents[2] / "tle_cache_meta.json"
LOCAL_OVERVIEW_CACHE_PATH = Path(__file__).resolve().parents[2] / "analysis_overview_cache.json"
LOCAL_BASELINE_CACHE_PATH = Path(__file__).resolve().parents[2] / "tle_cache_baseline.json"
LOCAL_BASELINE_META_PATH = Path(__file__).resolve().parents[2] / "tle_cache_baseline_meta.json"

def utc_iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def is_safe_fetch_window() -> bool:
    minute = datetime.now(timezone.utc).minute
    return (10 <= minute <= 20) or (40 <= minute <= 50)

def load_cache() -> list[dict] | None:
    if redis_client:
        try:
            data = redis_client.get(REDIS_CACHE_KEY)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error("Redis read error: %s", e)

    try:
        if LOCAL_CACHE_PATH.exists():
            return json.loads(LOCAL_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error("Local cache read error: %s", e)
    return None


def load_baseline_cache() -> list[dict] | None:
    try:
        if LOCAL_BASELINE_CACHE_PATH.exists():
            return json.loads(LOCAL_BASELINE_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error("Baseline cache read error: %s", e)
    return None


def load_cache_source() -> str | None:
    if redis_client:
        try:
            source = redis_client.get(CACHE_SOURCE_KEY)
            if source:
                return str(source)
        except Exception as e:
            logger.error("Redis source read error: %s", e)

    try:
        if LOCAL_CACHE_META_PATH.exists():
            meta = json.loads(LOCAL_CACHE_META_PATH.read_text(encoding="utf-8"))
            source = meta.get("source")
            if source:
                return str(source)
    except Exception as e:
        logger.error("Local source read error: %s", e)
    return None

def get_cache_age() -> int:
    if redis_client:
        try:
            ts = redis_client.get(f"{REDIS_CACHE_KEY}:timestamp")
            if ts:
                return int(time.time()) - int(ts)
        except Exception:
            pass

    try:
        if LOCAL_CACHE_META_PATH.exists():
            meta = json.loads(LOCAL_CACHE_META_PATH.read_text(encoding="utf-8"))
            ts = meta.get("timestamp")
            if ts:
                return int(time.time()) - int(ts)
    except Exception:
        pass
    return 999999

def save_cache(data: list[dict], source: str) -> None:
    try:
        LOCAL_CACHE_PATH.write_text(json.dumps(data), encoding="utf-8")
        LOCAL_CACHE_META_PATH.write_text(
            json.dumps({"timestamp": int(time.time()), "source": source}),
            encoding="utf-8",
        )
        if source != "baseline":
            LOCAL_BASELINE_CACHE_PATH.write_text(json.dumps(data), encoding="utf-8")
            LOCAL_BASELINE_META_PATH.write_text(
                json.dumps({"timestamp": int(time.time()), "source": source}),
                encoding="utf-8",
            )
    except Exception as e:
        logger.error("Local cache write error: %s", e)

    if not redis_client:
        return
    try:
        # cache for extended duration to allow stale serve
        redis_client.setex(REDIS_CACHE_KEY, CACHE_EXPIRY_SECONDS * 3, json.dumps(data))
        redis_client.setex(f"{REDIS_CACHE_KEY}:timestamp", CACHE_EXPIRY_SECONDS * 3, str(int(time.time())))
        redis_client.setex(CACHE_SOURCE_KEY, CACHE_EXPIRY_SECONDS * 3, source)
    except Exception as e:
        logger.error("Redis write error: %s", e)

def build_satellite_response(
    data: list[dict],
    *,
    cached: bool,
    status: str,
    cache_age_seconds: int | None,
    source: str,
) -> dict:
    return {
        "count": len(data),
        "data": data,
        "cached": cached,
        "status": status,
        "cache_age_seconds": cache_age_seconds,
        "generated_at": utc_iso_now(),
        "fetch_window_open": is_safe_fetch_window(),
        "source": source,
    }


async def fetch_spacetrack_catalog(client: httpx.AsyncClient) -> list[dict]:
    login_data = {
        "identity": settings.spacetrack_user,
        "password": settings.spacetrack_pass,
    }

    login_response = await client.post(SPACETRACK_LOGIN_URL, data=login_data)
    if login_response.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail="Failed to authenticate with Space-Track.",
        )

    data_response = await client.get(SPACETRACK_QUERY_URL)
    if data_response.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch data from Space-Track.",
        )

    return data_response.json()

@router.get("/health")
def health() -> dict[str, str]:
    redis_connected = "no"
    if redis_client:
        try:
            redis_connected = "yes" if redis_client.ping() else "no"
        except Exception:
            redis_connected = "no"

    return {
        "status": "ok", 
        "service": "kesslerx-api",
        "cache_backend": "redis" if settings.use_redis_cache else "local",
        "redis_connected": redis_connected,
        "tle_source": settings.tle_source,
    }

@router.get("/satellites")
async def get_satellites() -> dict:
    data = load_cache()
    cache_source = load_cache_source() or settings.tle_source
    if data:
        file_age = get_cache_age()

        if file_age < CACHE_EXPIRY_SECONDS:
            logger.info("Serving fresh satellite cache (%s seconds old)", file_age)
            return build_satellite_response(
                data,
                cached=True,
                status="fresh_cache",
                cache_age_seconds=file_age,
                source=cache_source,
            )

        if not is_safe_fetch_window():
            logger.info("Serving stale satellite cache while waiting for safe fetch window")
            return build_satellite_response(
                data,
                cached=True,
                status="stale_cache_waiting_for_window",
                cache_age_seconds=file_age,
                source=cache_source,
            )

    baseline_data = load_baseline_cache()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            source = "spacetrack"
            if not settings.spacetrack_user or not settings.spacetrack_pass:
                raise RuntimeError("Space-Track credentials not configured.")
            satellites = await fetch_spacetrack_catalog(client)
    except Exception as exc:
        logger.error("Space-Track fetch failed, attempting cache fallback: %s", exc)
        fallback_data = data or baseline_data
        fallback_source = cache_source if data else "baseline"
        if fallback_data:
            fallback_age = get_cache_age() if data else None
            return build_satellite_response(
                fallback_data,
                cached=True,
                status="degraded_cache_fallback",
                cache_age_seconds=fallback_age,
                source=fallback_source,
            )

        detail = str(exc) or "Satellite catalog unavailable."
        if isinstance(exc, HTTPException):
            raise exc
        raise HTTPException(status_code=500, detail=detail)

    save_cache(satellites, source)
    logger.info("Fetched %s satellite records from %s and updated cache", len(satellites), source)
    return build_satellite_response(
        satellites,
        cached=False,
        status="newly_fetched",
        cache_age_seconds=0,
        source=source,
    )

@router.post("/reset")
async def reset_catalog():
    """
    Clears the current session cache and restores the system to the
    last-saved baseline Space-Track dataset.
    """
    try:
        if redis_client:
            redis_client.delete(REDIS_CACHE_KEY)
            redis_client.delete(f"{REDIS_CACHE_KEY}:timestamp")
            redis_client.delete(CACHE_SOURCE_KEY)
            for key in redis_client.scan_iter(f"{REDIS_OVERVIEW_CACHE_PREFIX}:*"):
                redis_client.delete(key)

        if LOCAL_BASELINE_CACHE_PATH.exists():
            baseline_data = json.loads(LOCAL_BASELINE_CACHE_PATH.read_text(encoding="utf-8"))
            source = "baseline"
            if LOCAL_BASELINE_META_PATH.exists():
                try:
                    meta = json.loads(LOCAL_BASELINE_META_PATH.read_text(encoding="utf-8"))
                    source = meta.get("source") or "baseline"
                except Exception:
                    source = "baseline"
            save_cache(baseline_data, source)
        else:
            if LOCAL_CACHE_PATH.exists():
                LOCAL_CACHE_PATH.unlink()
            if LOCAL_CACHE_META_PATH.exists():
                LOCAL_CACHE_META_PATH.unlink()

        if LOCAL_OVERVIEW_CACHE_PATH.exists():
            LOCAL_OVERVIEW_CACHE_PATH.unlink()

        debris_model._is_fitted = False
        return {"status": "success", "message": "System re-baselined to catalog epoch."}
    except Exception as e:
        logger.error("Catalog reset failed: %s", e)
        raise HTTPException(status_code=500, detail="Internal reset error.")
