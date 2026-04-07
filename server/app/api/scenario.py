import json
import logging
import random
import time
from datetime import timedelta
from typing import Any, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.routes import (
    LOCAL_BASELINE_CACHE_PATH,
    LOCAL_BASELINE_META_PATH,
    LOCAL_CACHE_META_PATH,
    LOCAL_CACHE_PATH,
)
from app.core.catalog import _screen_pair, build_catalog_records, utc_now, utc_iso
from app.core.config import get_settings
from app.core.redis import get_redis
from app.ml.debris_model import debris_model
from sgp4.api import Satrec, jday

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()
SIM_WINDOW_MINUTES = 6 * 60
SYNTHETIC_OBJECT_TYPES = ["PAYLOAD", "ROCKET BODY", "DEBRIS"]

class ScenarioInjectRequest(BaseModel):
    tle_line1: str | None = None
    tle_line2: str | None = None
    object_name: str | None = None
    object_type: str = "PAYLOAD"
    anchor_norad_id: str | None = None


class ScenarioCollisionRequest(BaseModel):
    anchor_norad_id: str | None = None


def load_active_satellites() -> list[dict]:
    redis_client = get_redis() if settings.use_redis_cache else None
    if redis_client:
        dataset_json = redis_client.get("kesslerx:satellites")
        if dataset_json:
            return json.loads(dataset_json)

    if LOCAL_CACHE_PATH.exists():
        return json.loads(LOCAL_CACHE_PATH.read_text(encoding="utf-8"))

    raise HTTPException(status_code=400, detail="Base dataset not loaded yet.")


def save_active_satellites(satellites: list[dict], source: str = "scenario") -> None:
    redis_client = get_redis() if settings.use_redis_cache else None
    if redis_client:
        redis_client.set("kesslerx:satellites", json.dumps(satellites))
        redis_client.set("kesslerx:satellites:timestamp", str(int(time.time())))
        redis_client.set("kesslerx:satellites:source", source)

    LOCAL_CACHE_PATH.write_text(json.dumps(satellites), encoding="utf-8")
    LOCAL_CACHE_META_PATH.write_text(
        json.dumps({"timestamp": int(time.time()), "source": source}),
        encoding="utf-8",
    )


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _replace_segment(text: str, start: int, end: int, value: str) -> str:
    base = (text or "").ljust(max(69, end))
    segment = value.rjust(end - start)[: end - start]
    return f"{base[:start]}{segment}{base[end:]}"


def _build_line2_variant(
    line2: str,
    *,
    inclination_delta: float = 0.0,
    raan_delta: float = 0.0,
    arg_perigee_delta: float = 0.0,
    eccentricity_delta: float = 0.0,
    mean_anomaly_delta: float = 0.0,
    mean_motion_delta: float = 0.0,
) -> str:
    base = (line2 or "").ljust(69)
    inclination = (_safe_float(base[8:16]) + inclination_delta) % 180.0
    raan = (_safe_float(base[17:25]) + raan_delta) % 360.0
    arg_perigee = (_safe_float(base[34:42]) + arg_perigee_delta) % 360.0
    eccentricity = min(max(_safe_float(f"0.{base[26:33].strip()}", 0.0) + eccentricity_delta, 0.0), 0.9999999)
    mean_anomaly = (_safe_float(base[43:51]) + mean_anomaly_delta) % 360.0
    mean_motion = max(0.00000001, _safe_float(base[52:63]) + mean_motion_delta)

    updated = base
    updated = _replace_segment(updated, 8, 16, f"{inclination:8.4f}")
    updated = _replace_segment(updated, 17, 25, f"{raan:8.4f}")
    updated = _replace_segment(updated, 34, 42, f"{arg_perigee:8.4f}")
    updated = _replace_segment(updated, 26, 33, f"{int(round(eccentricity * 10_000_000)):07d}")
    updated = _replace_segment(updated, 43, 51, f"{mean_anomaly:8.4f}")
    updated = _replace_segment(updated, 52, 63, f"{mean_motion:11.8f}")
    return updated


def _pick_anchor_satellite(
    satellites: list[dict[str, Any]],
    anchor_norad_id: str | None = None,
) -> dict[str, Any]:
    if anchor_norad_id:
        match = next(
            (sat for sat in satellites if str(sat.get("NORAD_CAT_ID")) == str(anchor_norad_id)),
            None,
        )
        if match:
            return match

    payload = next((sat for sat in satellites if sat.get("OBJECT_TYPE") == "PAYLOAD"), None)
    if payload:
        return payload

    if not satellites:
        raise HTTPException(status_code=400, detail="Base dataset not loaded yet.")
    return satellites[0]


def _catalog_fields_from_tle(line2: str) -> dict[str, str]:
    base = (line2 or "").ljust(69)
    return {
        "MEAN_MOTION": base[52:63].strip(),
        "ECCENTRICITY": f"0.{base[26:33].strip()}",
        "INCLINATION": base[8:16].strip(),
    }


def _make_synthetic_object(
    *,
    norad_id: str,
    object_name: str,
    object_type: str,
    anchor: dict[str, Any],
    inclination_delta: float = 0.0,
    raan_delta: float = 0.0,
    arg_perigee_delta: float = 0.0,
    eccentricity_delta: float = 0.0,
    mean_anomaly_delta: float = 0.0,
    mean_motion_delta: float = 0.0,
    synthetic_event_class: str | None = None,
    synthetic_anchor_norad_id: str | None = None,
    synthetic_event_time_minutes: int | None = None,
) -> dict[str, Any]:
    line1 = anchor.get("TLE_LINE1")
    line2 = anchor.get("TLE_LINE2")
    if not line1 or not line2:
        raise HTTPException(status_code=400, detail="Selected anchor is missing TLE data.")

    new_line2 = _build_line2_variant(
        line2,
        inclination_delta=inclination_delta,
        raan_delta=raan_delta,
        arg_perigee_delta=arg_perigee_delta,
        eccentricity_delta=eccentricity_delta,
        mean_anomaly_delta=mean_anomaly_delta,
        mean_motion_delta=mean_motion_delta,
    )

    return {
        "NORAD_CAT_ID": norad_id,
        "OBJECT_NAME": object_name,
        "OBJECT_TYPE": object_type,
        "TLE_LINE1": line1,
        "TLE_LINE2": new_line2,
        "is_synthetic": True,
        "synthetic_event_class": synthetic_event_class,
        "synthetic_anchor_norad_id": synthetic_anchor_norad_id,
        "synthetic_event_time_minutes": synthetic_event_time_minutes,
        **_catalog_fields_from_tle(new_line2),
    }


def _build_pair_preview(
    satellites: list[dict[str, Any]],
    target_norad_id: str,
    candidate_norad_id: str,
) -> dict[str, Any] | None:
    records = build_catalog_records(satellites)
    target = next((record for record in records if record["norad_id"] == str(target_norad_id)), None)
    candidate = next((record for record in records if record["norad_id"] == str(candidate_norad_id)), None)
    if not target or not candidate:
        return None

    now = utc_now()
    pair = _screen_pair(target, candidate, now)
    if not pair:
        return None

    return {
        **pair,
        "sampled_at": utc_iso(now),
        "risk_color": pair.get("risk_color"),
    }


def _delta_days_from_anchor_epoch(anchor: dict[str, Any], event_time) -> float:
    try:
        satrec = Satrec.twoline2rv(anchor.get("TLE_LINE1", ""), anchor.get("TLE_LINE2", ""))
        epoch_jd = satrec.jdsatepoch + satrec.jdsatepochF
        jd_event, fr_event = jday(
            event_time.year,
            event_time.month,
            event_time.day,
            event_time.hour,
            event_time.minute,
            event_time.second + event_time.microsecond / 1_000_000,
        )
        delta_days = (jd_event + fr_event) - epoch_jd
    except Exception:
        delta_days = 0.0
    return delta_days


def _pick_injection_anchors(
    satellites: list[dict[str, Any]],
    preferred_anchor_norad_id: str | None = None,
    count: int = 3,
) -> list[dict[str, Any]]:
    candidates = [
        sat
        for sat in satellites
        if sat.get("TLE_LINE1") and sat.get("TLE_LINE2") and not sat.get("is_synthetic")
    ]
    if not candidates:
        raise HTTPException(status_code=400, detail="Base dataset not loaded yet.")

    chosen: list[dict[str, Any]] = []
    if preferred_anchor_norad_id:
        preferred = next(
            (
                sat
                for sat in candidates
                if str(sat.get("NORAD_CAT_ID")) == str(preferred_anchor_norad_id)
            ),
            None,
        )
        if preferred:
            chosen.append(preferred)

    remaining = [sat for sat in candidates if sat not in chosen]
    random.shuffle(remaining)
    chosen.extend(remaining[: max(0, count - len(chosen))])
    return chosen[:count]


def _random_event_minute(lower: int, upper: int) -> int:
    start = max(0, lower - (lower % 5))
    end = min(SIM_WINDOW_MINUTES, upper)
    values = list(range(start, end + 1, 5))
    return random.choice(values) if values else lower


def _build_scheduled_synthetic_threat(
    *,
    anchor: dict[str, Any],
    norad_id: str,
    object_name: str,
    event_class: str,
    event_time_minutes: int,
) -> dict[str, Any]:
    profiles = {
        "collision": {
            "name": "IMPACT VECTOR",
            "mean_motion_range": (0.0020, 0.0034),
            "inclination_delta": 0.14,
            "raan_delta": 0.28,
            "arg_perigee_delta": 5.5,
            "eccentricity_range": (0.00008, 0.00018),
            "mean_anomaly_bias_range": (-4.0, 4.0),
        },
        "super_close_call": {
            "name": "NEAR PASS ALPHA",
            "mean_motion_range": (0.0017, 0.0032),
            "inclination_delta": 0.24,
            "raan_delta": 0.54,
            "arg_perigee_delta": 8.0,
            "eccentricity_range": (0.00016, 0.0005),
            "mean_anomaly_bias_range": (-8.0, 8.0),
        },
        "close_approach": {
            "name": "NEAR PASS BETA",
            "mean_motion_range": (0.0012, 0.0024),
            "inclination_delta": 0.42,
            "raan_delta": 1.15,
            "arg_perigee_delta": 14.0,
            "eccentricity_range": (0.00035, 0.0009),
            "mean_anomaly_bias_range": (-12.0, 12.0),
        },
    }
    profile = profiles[event_class]
    event_time = utc_now() + timedelta(minutes=event_time_minutes)
    delta_days_to_event = _delta_days_from_anchor_epoch(anchor, event_time)

    direction = random.choice((-1, 1))
    mm_delta = direction * random.uniform(*profile["mean_motion_range"])
    ma_delta = (
        -(mm_delta * delta_days_to_event * 360.0)
        + random.uniform(*profile["mean_anomaly_bias_range"])
    )

    return _make_synthetic_object(
        norad_id=norad_id,
        object_name=object_name,
        object_type=random.choice(SYNTHETIC_OBJECT_TYPES),
        anchor=anchor,
        inclination_delta=random.uniform(-profile["inclination_delta"], profile["inclination_delta"]),
        raan_delta=random.uniform(-profile["raan_delta"], profile["raan_delta"]),
        arg_perigee_delta=random.uniform(-profile["arg_perigee_delta"], profile["arg_perigee_delta"]),
        eccentricity_delta=random.uniform(*profile["eccentricity_range"]),
        mean_anomaly_delta=ma_delta,
        mean_motion_delta=mm_delta,
        synthetic_event_class=event_class,
        synthetic_anchor_norad_id=str(anchor.get("NORAD_CAT_ID")),
        synthetic_event_time_minutes=event_time_minutes,
    )


def _build_injected_risk_bundle(
    satellites: list[dict[str, Any]],
    preferred_anchor_norad_id: str | None,
    base_num: int,
) -> list[dict[str, Any]]:
    anchors = _pick_injection_anchors(satellites, preferred_anchor_norad_id, count=3)
    event_plan = [
        ("collision", _random_event_minute(175, 255)),
        ("super_close_call", _random_event_minute(95, 165)),
        ("close_approach", _random_event_minute(40, 105)),
    ]
    scenarios: list[dict[str, Any]] = []

    for index, (event_class, event_time_minutes) in enumerate(event_plan):
        anchor = anchors[index % len(anchors)]
        synthetic = _build_scheduled_synthetic_threat(
            anchor=anchor,
            norad_id=f"DUMM-{base_num + index}",
            object_name=f"DUMM{index + 1}",
            event_class=event_class,
            event_time_minutes=event_time_minutes,
        )
        scenarios.append(
            {
                "anchor": anchor,
                "synthetic": synthetic,
                "event_class": event_class,
                "event_time_minutes": event_time_minutes,
            }
        )

    return scenarios

@router.post("/inject")
async def inject_satellite(req: ScenarioInjectRequest):
    """
    Injects a synthetic satellite TLE into the current Redis session dataset.
    This allows players/planners to simulate adding objects to the swarm.
    """
    try:
        satellites = load_active_satellites()

        anchor = _pick_anchor_satellite(satellites, req.anchor_norad_id)
        synthetic_id = f"SYNTHE-{len(satellites)}"
        synthetic_name = req.object_name or f"{anchor.get('OBJECT_NAME', 'ANCHOR')} PROX-1"

        if req.tle_line1 and req.tle_line2:
            synthetic_sat = {
                "NORAD_CAT_ID": synthetic_id,
                "OBJECT_NAME": synthetic_name,
                "OBJECT_TYPE": req.object_type,
                "TLE_LINE1": req.tle_line1,
                "TLE_LINE2": req.tle_line2,
                "is_synthetic": True,
                **_catalog_fields_from_tle(req.tle_line2),
            }
        else:
            synthetic_sat = _make_synthetic_object(
                norad_id=synthetic_id,
                object_name=synthetic_name,
                object_type=req.object_type,
                anchor=anchor,
                inclination_delta=0.01,
                raan_delta=0.04,
                mean_anomaly_delta=0.18,
                mean_motion_delta=0.004,
                eccentricity_delta=0.00012,
            )

        satellites.append(synthetic_sat)

        save_active_satellites(satellites)

        debris_model._is_fitted = False
        debris_model.train_on_current_catalog()

        pair_preview = _build_pair_preview(
            satellites,
            str(anchor.get("NORAD_CAT_ID")),
            synthetic_sat["NORAD_CAT_ID"],
        )

        return {
            "status": "success",
            "synthetic_id": synthetic_sat["NORAD_CAT_ID"],
            "synthetic_name": synthetic_sat["OBJECT_NAME"],
            "focus_norad_id": str(anchor.get("NORAD_CAT_ID")),
            "anchor_name": anchor.get("OBJECT_NAME"),
            "compare_norad_id": synthetic_sat["NORAD_CAT_ID"],
            "pair_preview": pair_preview,
            "total_satellites": len(satellites),
        }

    except Exception as e:
        logger.error("Simulation injection failed: %s", e)
        raise HTTPException(status_code=500, detail="Internal scenario error.")

@router.post("/trigger-collision")
async def trigger_collision(req: ScenarioCollisionRequest):
    """
    Simulates a collision event by generating a cloud of 150 debris objects
    spreading out from a target baseline orbit, immediately injecting them into Redis
    to be propagated and assessed by the UI.
    """
    try:
        satellites = load_active_satellites()
        base_num = len(satellites)
        scenarios = _build_injected_risk_bundle(satellites, req.anchor_norad_id, base_num)
        synthetic_objects = [scenario["synthetic"] for scenario in scenarios]
        satellites.extend(synthetic_objects)
        save_active_satellites(satellites)

        debris_model._is_fitted = False
        debris_model.train_on_current_catalog()
        scenario_events = []
        for scenario in scenarios:
            preview = _build_pair_preview(
                satellites,
                str(scenario["anchor"].get("NORAD_CAT_ID")),
                scenario["synthetic"]["NORAD_CAT_ID"],
            )
            if preview:
                scenario_events.append(preview)

        scenario_events.sort(
            key=lambda event: (
                0 if event.get("is_confirmed_collision") else 1,
                event.get("sampled_tca_minutes") or SIM_WINDOW_MINUTES,
            )
        )
        pair_preview = scenario_events[0] if scenario_events else None
        primary_anchor_name = pair_preview["target_name"] if pair_preview else None
        primary_threat_name = pair_preview["candidate_name"] if pair_preview else None

        return {
            "status": "success",
            "focus_norad_id": pair_preview["target_norad_id"] if pair_preview else None,
            "anchor_name": primary_anchor_name,
            "compare_norad_id": pair_preview["candidate_norad_id"] if pair_preview else None,
            "threat_name": primary_threat_name,
            "pair_preview": pair_preview,
            "scenario_events": scenario_events,
            "injected_count": len(synthetic_objects),
            "fragment_ids": [],
            "synthetic_ids": [item["NORAD_CAT_ID"] for item in synthetic_objects],
            "total_satellites": len(satellites),
        }

    except Exception as e:
        logger.error("Collision event failed: %s", e)
        raise HTTPException(status_code=500, detail="Internal collision scenario error.")

@router.post("/reset")
async def reset_scenario():
    """
    Clears the modified Redis satellite cache and forces a fresh query 
    to SpaceTrack on the next frontend load.
    """
    try:
        redis_client = get_redis() if settings.use_redis_cache else None
        if redis_client:
            redis_client.delete("kesslerx:satellites")
            redis_client.delete("kesslerx:satellites:timestamp")
            redis_client.delete("kesslerx:satellites:source")

        if LOCAL_BASELINE_CACHE_PATH.exists():
            baseline_data = json.loads(LOCAL_BASELINE_CACHE_PATH.read_text(encoding="utf-8"))
            source = "baseline"
            if LOCAL_BASELINE_META_PATH.exists():
                try:
                    source = json.loads(LOCAL_BASELINE_META_PATH.read_text(encoding="utf-8")).get("source") or "baseline"
                except Exception:
                    source = "baseline"
            save_active_satellites(baseline_data, source=source)
        else:
            if LOCAL_CACHE_PATH.exists():
                LOCAL_CACHE_PATH.unlink()
            if LOCAL_CACHE_META_PATH.exists():
                LOCAL_CACHE_META_PATH.unlink()

        # Reset ML status
        debris_model._is_fitted = False
        
        return {"status": "success", "message": "Scenario environment reset to baseline."}
    except Exception as e:
        logger.error("Simulation reset failed: %s", e)
        raise HTTPException(status_code=500, detail="Internal scenario reset error.")
