import json
import time
from datetime import datetime
from pathlib import Path
import httpx
from fastapi import APIRouter, HTTPException
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

SPACETRACK_LOGIN_URL = "https://www.space-track.org/ajaxauth/login"
# Fetching recent LEO data (General Perturbations class)
SPACETRACK_QUERY_URL = "https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/MEAN_MOTION/%3E11.25/ECCENTRICITY/%3C0.25/orderby/NORAD_CAT_ID/limit/1000/format/json"

CACHE_FILE = Path("tle_cache.json")
CACHE_EXPIRY_SECONDS = 3600  # 1 hour

def is_safe_fetch_window() -> bool:
    """
    Returns True if the current minute is between 10-20 or 40-50.
    Complies with Space-Track's '10-20 minutes before or after the hour' rule.
    """
    minute = datetime.now().minute
    return (10 <= minute <= 20) or (40 <= minute <= 50)

@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "kesslerx-api"}

@router.get("/satellites")
async def get_satellites():
    """Fetches TLE data with a strict 1-hour cache and compliance time-windows."""
    
    # 1. Check existing cache
    if CACHE_FILE.exists():
        file_age = time.time() - CACHE_FILE.stat().st_mtime
        
        # If cache is young, serve it
        if file_age < CACHE_EXPIRY_SECONDS:
            print(f"Serving FRESH cache (Age: {int(file_age/60)} mins)")
            with open(CACHE_FILE, "r") as f:
                data = json.load(f)
            return {"count": len(data), "data": data, "cached": True, "status": "fresh"}
            
        # If cache is old, check if we are allowed to fetch right now
        if not is_safe_fetch_window():
            print(f"Cache expired, but waiting for safe window (Current minute: {datetime.now().minute}). Serving STALE cache.")
            with open(CACHE_FILE, "r") as f:
                data = json.load(f)
            return {"count": len(data), "data": data, "cached": True, "status": "stale_waiting_for_window"}

    print("Cache expired or missing AND inside safe window. Fetching from Space-Track...")

    # 2. Fetch fresh data from Space-Track
    # Ensure credentials exist
    if not getattr(settings, "spacetrack_user", None) or not getattr(settings, "spacetrack_pass", None):
        raise HTTPException(status_code=500, detail="Space-Track credentials not configured.")

    login_data = {
        'identity': settings.spacetrack_user,
        'password': settings.spacetrack_pass
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Login
        login_resp = await client.post(SPACETRACK_LOGIN_URL, data=login_data)
        if login_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Failed to authenticate with Space-Track")

        # Fetch Data
        data_resp = await client.get(SPACETRACK_QUERY_URL)
        if data_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch data from Space-Track")
            
        satellites = data_resp.json()

    # 3. Save the fresh data
    with open(CACHE_FILE, "w") as f:
        json.dump(satellites, f)
        
    return {"count": len(satellites), "data": satellites, "cached": False, "status": "newly_fetched"}