import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

from app.core.config import get_settings

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

SPACETRACK_LOGIN_URL = "https://www.space-track.org/ajaxauth/login"
SPACETRACK_QUERY_URL = (
    "https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/"
    "epoch/%3Enow-10/MEAN_MOTION/%3E11.25/ECCENTRICITY/%3C0.25/orderby/NORAD_CAT_ID/"
    "limit/1000/format/json"
)

CACHE_FILE = Path(__file__).resolve().parents[2] / "tle_cache.json"
CACHE_EXPIRY_SECONDS = 3600


def utc_iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def is_safe_fetch_window() -> bool:
    minute = datetime.now(timezone.utc).minute
    return (10 <= minute <= 20) or (40 <= minute <= 50)


def load_cache() -> list[dict]:
    with CACHE_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_cache(data: list[dict]) -> None:
    with CACHE_FILE.open("w", encoding="utf-8") as handle:
        json.dump(data, handle)


def build_satellite_response(
    data: list[dict],
    *,
    cached: bool,
    status: str,
    cache_age_seconds: int | None,
) -> dict:
    return {
        "count": len(data),
        "data": data,
        "cached": cached,
        "status": status,
        "cache_age_seconds": cache_age_seconds,
        "generated_at": utc_iso_now(),
        "fetch_window_open": is_safe_fetch_window(),
    }


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "kesslerx-api"}


@router.get("/satellites")
async def get_satellites() -> dict:
    if CACHE_FILE.exists():
        file_age = int(time.time() - CACHE_FILE.stat().st_mtime)

        if file_age < CACHE_EXPIRY_SECONDS:
            logger.info("Serving fresh satellite cache (%s seconds old)", file_age)
            data = load_cache()
            return build_satellite_response(
                data,
                cached=True,
                status="fresh_cache",
                cache_age_seconds=file_age,
            )

        if not is_safe_fetch_window():
            logger.info("Serving stale satellite cache while waiting for safe fetch window")
            data = load_cache()
            return build_satellite_response(
                data,
                cached=True,
                status="stale_cache_waiting_for_window",
                cache_age_seconds=file_age,
            )

    if not settings.spacetrack_user or not settings.spacetrack_pass:
        raise HTTPException(
            status_code=500,
            detail="Space-Track credentials not configured.",
        )

    login_data = {
        "identity": settings.spacetrack_user,
        "password": settings.spacetrack_pass,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
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

        satellites = data_response.json()

    save_cache(satellites)
    logger.info("Fetched %s satellite records from Space-Track", len(satellites))
    return build_satellite_response(
        satellites,
        cached=False,
        status="newly_fetched",
        cache_age_seconds=0,
    )
