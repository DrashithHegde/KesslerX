import json
import logging
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sklearn.ensemble import IsolationForest

from sgp4.api import Satrec, jday

from app.core.config import get_settings
from app.core.redis import get_redis
from app.ml.debris_model import debris_model

logger = logging.getLogger(__name__)
settings = get_settings()

EARTH_RADIUS_KM = 6371.0
MU_EARTH_KM3_S2 = 398600.4418
SCREENING_WINDOW_MINUTES = 90
SCREENING_STEP_MINUTES = 5
MAX_ALERT_MIN_SEPARATION_KM = 120.0
ALERT_SHORTLIST_LIMIT = 18
UNCERTAINTY_GRID_LAT_STEP_DEG = 12.0
UNCERTAINTY_GRID_LON_STEP_DEG = 12.0
UNCERTAINTY_CELL_LIMIT = 24
HIGH_UNCERTAINTY_ZONE_THRESHOLD = 65.0
REDIS_CACHE_KEY = "kesslerx:satellites"
LOCAL_CACHE_PATH = Path(__file__).resolve().parents[2] / "tle_cache.json"


def _safe_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_object_type(raw_type: str | None) -> str:
    normalized = (raw_type or "").strip().upper()
    if normalized in {"PAYLOAD", "ROCKET BODY", "DEBRIS"}:
        return normalized
    return "OTHER"


def altitude_from_mean_motion(mean_motion: float | None) -> float | None:
    if not mean_motion or mean_motion <= 0:
        return None

    mean_motion_rad_s = mean_motion * 2 * math.pi / 86400.0
    semi_major_axis = (MU_EARTH_KM3_S2 / (mean_motion_rad_s**2)) ** (1 / 3)
    return semi_major_axis - EARTH_RADIUS_KM


def orbital_regime(altitude_km: float | None) -> str:
    if altitude_km is None:
        return "UNKNOWN"
    if altitude_km < 2000:
        return "LEO"
    if altitude_km < 35786:
        return "MEO"
    if altitude_km < 36050:
        return "GEO"
    return "HIGH EARTH"


def load_cached_catalog() -> list[dict[str, Any]]:
    redis_client = get_redis() if settings.use_redis_cache else None
    if redis_client:
        try:
            payload = redis_client.get(REDIS_CACHE_KEY)
            if payload:
                try:
                    data = json.loads(payload)
                    return data if isinstance(data, list) else []
                except json.JSONDecodeError:
                    pass
        except Exception:
            # Redis is optional; continue with local cache fallback.
            pass

    try:
        data = json.loads(LOCAL_CACHE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def build_catalog_records(raw_catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for item in raw_catalog:
        line1 = item.get("TLE_LINE1")
        line2 = item.get("TLE_LINE2")
        norad_id = str(item.get("NORAD_CAT_ID") or "").strip()
        if not line1 or not line2 or not norad_id:
            continue

        mean_motion = _safe_float(item.get("MEAN_MOTION"))
        eccentricity = _safe_float(item.get("ECCENTRICITY"))
        inclination = _safe_float(item.get("INCLINATION"))
        altitude_km = altitude_from_mean_motion(mean_motion)

        try:
            satrec = Satrec.twoline2rv(line1, line2)
        except Exception:
            continue

        records.append(
            {
                "norad_id": norad_id,
                "object_name": item.get("OBJECT_NAME") or f"OBJECT {norad_id}",
                "object_type": normalize_object_type(item.get("OBJECT_TYPE")),
                "mean_motion": mean_motion,
                "eccentricity": eccentricity,
                "inclination": inclination,
                "altitude_km": altitude_km,
                "regime": orbital_regime(altitude_km),
                "is_synthetic": bool(item.get("is_synthetic")),
                "synthetic_event_class": item.get("synthetic_event_class"),
                "synthetic_anchor_norad_id": str(item.get("synthetic_anchor_norad_id") or "").strip() or None,
                "synthetic_event_time_minutes": int(item.get("synthetic_event_time_minutes"))
                if str(item.get("synthetic_event_time_minutes") or "").strip().isdigit()
                else None,
                "satrec": satrec,
            }
        )

    return records


def propagate_record(record: dict[str, Any], when: datetime) -> dict[str, float] | None:
    jd, fr = jday(
        when.year,
        when.month,
        when.day,
        when.hour,
        when.minute,
        when.second + when.microsecond / 1_000_000,
    )
    error_code, position, velocity = record["satrec"].sgp4(jd, fr)
    if error_code != 0 or not position:
        return None

    px, py, pz = position
    radius = math.sqrt(px * px + py * py + pz * pz)
    speed_kps = 0.0
    if velocity:
        vx, vy, vz = velocity
        speed_kps = math.sqrt(vx * vx + vy * vy + vz * vz)

    return {
        "x": px,
        "y": py,
        "z": pz,
        "altitude_km": radius - EARTH_RADIUS_KM,
        "speed_kps": speed_kps,
    }


def distance_km(left: dict[str, float], right: dict[str, float]) -> float:
    dx = left["x"] - right["x"]
    dy = left["y"] - right["y"]
    dz = left["z"] - right["z"]
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def _julian_date(dt: datetime) -> float:
    jd, fr = jday(
        dt.year,
        dt.month,
        dt.day,
        dt.hour,
        dt.minute,
        dt.second + dt.microsecond / 1_000_000,
    )
    return jd + fr


def _gmst_radians(dt: datetime) -> float:
    jd = _julian_date(dt)
    t = (jd - 2451545.0) / 36525.0
    gmst_deg = (
        280.46061837
        + 360.98564736629 * (jd - 2451545.0)
        + 0.000387933 * t * t
        - (t * t * t) / 38710000.0
    )
    return math.radians(gmst_deg % 360.0)


def _eci_to_lat_lon(x: float, y: float, z: float, when: datetime) -> tuple[float, float]:
    gmst = _gmst_radians(when)
    cos_gmst = math.cos(gmst)
    sin_gmst = math.sin(gmst)
    x_ecef = x * cos_gmst + y * sin_gmst
    y_ecef = -x * sin_gmst + y * cos_gmst
    z_ecef = z

    lon = math.atan2(y_ecef, x_ecef)
    hyp = math.sqrt(x_ecef * x_ecef + y_ecef * y_ecef)
    lat = math.atan2(z_ecef, hyp)
    return math.degrees(lat), math.degrees(lon)


def _grid_cell(lat: float, lon: float) -> tuple[int, int]:
    lat_index = int(math.floor((lat + 90.0) / UNCERTAINTY_GRID_LAT_STEP_DEG))
    lon_index = int(math.floor((lon + 180.0) / UNCERTAINTY_GRID_LON_STEP_DEG))
    lat_index = max(0, min(lat_index, int(180.0 / UNCERTAINTY_GRID_LAT_STEP_DEG) - 1))
    lon_index = max(0, min(lon_index, int(360.0 / UNCERTAINTY_GRID_LON_STEP_DEG) - 1))
    return lat_index, lon_index


def build_uncertainty_zones(records: list[dict[str, Any]], when: datetime) -> list[dict[str, Any]]:
    cells: dict[tuple[int, int], dict[str, Any]] = {}

    for record in records:
        state = propagate_record(record, when)
        if not state:
            continue

        lat, lon = _eci_to_lat_lon(state["x"], state["y"], state["z"], when)
        lat_index, lon_index = _grid_cell(lat, lon)
        key = (lat_index, lon_index)
        cell = cells.setdefault(
            key,
            {
                "lat_index": lat_index,
                "lon_index": lon_index,
                "total_objects": 0,
                "debris": 0,
                "synthetic_objects": 0,
                "altitude_sum": 0.0,
                "altitude_sum_sq": 0.0,
                "altitude_samples": 0,
            },
        )

        cell["total_objects"] += 1
        if record["object_type"] == "DEBRIS":
            cell["debris"] += 1
        if record["is_synthetic"]:
            cell["synthetic_objects"] += 1
        if state.get("altitude_km") is not None:
            altitude = state["altitude_km"]
            cell["altitude_sum"] += altitude
            cell["altitude_sum_sq"] += altitude * altitude
            cell["altitude_samples"] += 1

    if not cells:
        return []

    max_total = max(cell["total_objects"] for cell in cells.values()) or 1
    max_variance = 0.0
    min_altitude = None
    max_altitude = None
    cell_list: list[dict[str, Any]] = []

    for cell in cells.values():
        avg_altitude = None
        altitude_variance = 0.0
        if cell["altitude_samples"]:
            avg_altitude = cell["altitude_sum"] / cell["altitude_samples"]
            altitude_variance = max(
                0.0,
                cell["altitude_sum_sq"] / cell["altitude_samples"] - avg_altitude * avg_altitude,
            )
            max_variance = max(max_variance, altitude_variance)
            min_altitude = avg_altitude if min_altitude is None else min(min_altitude, avg_altitude)
            max_altitude = avg_altitude if max_altitude is None else max(max_altitude, avg_altitude)

        cell_list.append(
            {
                **cell,
                "avg_altitude": avg_altitude,
                "altitude_variance": altitude_variance,
            }
        )

    feature_rows: list[list[float]] = []
    for cell in cell_list:
        total = cell["total_objects"]
        debris_ratio = cell["debris"] / total if total else 0.0
        normalized_count = total / max_total
        if cell["avg_altitude"] is None or min_altitude is None or max_altitude is None or max_altitude == min_altitude:
            normalized_altitude = 0.0
        else:
            normalized_altitude = (cell["avg_altitude"] - min_altitude) / (max_altitude - min_altitude)
        normalized_variance = cell["altitude_variance"] / max_variance if max_variance > 0 else 0.0

        cell["normalized_count"] = normalized_count
        cell["debris_ratio"] = debris_ratio
        cell["normalized_altitude"] = normalized_altitude
        cell["normalized_variance"] = normalized_variance
        feature_rows.append([normalized_count, debris_ratio, normalized_altitude, normalized_variance])

    anomaly_factors = [0.0 for _ in feature_rows]
    if len(feature_rows) >= 10:
        model = IsolationForest(n_estimators=120, contamination=0.1, random_state=42)
        model.fit(feature_rows)
        decision_scores = model.decision_function(feature_rows)
        anomaly_raw = [-score for score in decision_scores]
        min_raw = min(anomaly_raw)
        max_raw = max(anomaly_raw)
        if max_raw > min_raw:
            anomaly_factors = [(raw - min_raw) / (max_raw - min_raw) for raw in anomaly_raw]

    zones: list[dict[str, Any]] = []
    for cell, anomaly_factor in zip(cell_list, anomaly_factors):
        total = cell["total_objects"]
        debris_ratio = cell["debris_ratio"]
        density_factor = cell["normalized_count"]
        instability_factor = cell["normalized_variance"]

        uncertainty_score = round(
            _clamp(
                (0.4 * density_factor
                 + 0.25 * debris_ratio
                 + 0.2 * instability_factor
                 + 0.15 * anomaly_factor)
                * 100.0,
                0.0,
                100.0,
            ),
            1,
        )

        if total < 5 or uncertainty_score < 40.0:
            continue

        lat_center = -90.0 + (cell["lat_index"] + 0.5) * UNCERTAINTY_GRID_LAT_STEP_DEG
        lon_center = -180.0 + (cell["lon_index"] + 0.5) * UNCERTAINTY_GRID_LON_STEP_DEG

        zones.append(
            {
                "lat": round(lat_center, 3),
                "lon": round(lon_center, 3),
                "cell_size_deg": UNCERTAINTY_GRID_LAT_STEP_DEG,
                "total_objects": total,
                "debris": cell["debris"],
                "synthetic_objects": cell["synthetic_objects"],
                "debris_ratio": round(debris_ratio * 100.0, 1),
                "avg_altitude_km": round(cell["avg_altitude"], 1) if cell["avg_altitude"] is not None else None,
                "altitude_variance": round(cell["altitude_variance"], 2),
                "instability_score": round(instability_factor * 100.0, 1),
                "anomaly_score": round(anomaly_factor * 100.0, 1),
                "uncertainty_score": uncertainty_score,
            }
        )

    zones.sort(
        key=lambda zone: (
            zone["uncertainty_score"],
            zone["total_objects"],
            zone["debris"],
        ),
        reverse=True,
    )
    return zones[:UNCERTAINTY_CELL_LIMIT]


def _candidate_score(target: dict[str, Any], candidate: dict[str, Any]) -> float:
    altitude_delta = abs((candidate["altitude_km"] or 0.0) - (target["altitude_km"] or 0.0))
    inclination_delta = abs((candidate["inclination"] or 0.0) - (target["inclination"] or 0.0))
    return altitude_delta * 1.1 + inclination_delta * 0.45


def _risk_band(score: float) -> str:
    if score >= 80:
        return "SEVERE"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "ELEVATED"
    return "LOW"


def _high_uncertainty_cells_from_zones(zones: list[dict[str, Any]]) -> set[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    for zone in zones:
        uncertainty_score = _safe_float(zone.get("uncertainty_score"))
        if uncertainty_score is None or uncertainty_score < HIGH_UNCERTAINTY_ZONE_THRESHOLD:
            continue

        lat = _safe_float(zone.get("lat"))
        lon = _safe_float(zone.get("lon"))
        if lat is None or lon is None:
            continue
        cells.add(_grid_cell(lat, lon))

    return cells


def _risk_color(score: float) -> str:
    if score >= 80:
        return "#ff5f57"
    if score >= 60:
        return "#ff8c42"
    if score >= 40:
        return "#ffd166"
    return "#00d1ff"


def _event_style(event_class: str | None, risk_score: float) -> tuple[str, str, str]:
    if event_class == "collision":
        return "COLLISION", "#ff4d5a", "SEVERE"
    if event_class == "super_close_call":
        return "SUPER CLOSE CALL", "#ff8c42", "HIGH"
    if event_class == "close_approach":
        return "CLOSE APPROACH", "#ffd166", "ELEVATED"
    return "RISK", _risk_color(risk_score), _risk_band(risk_score)


def _classify_alert_event(min_separation_km: float | None) -> str | None:
    if min_separation_km is None:
        return None
    if min_separation_km <= 20.0:
        return "super_close_call"
    if min_separation_km <= 80.0:
        return "close_approach"
    return None


def _synthetic_event_profile_for_pair(
    target: dict[str, Any],
    candidate: dict[str, Any],
) -> tuple[str | None, int | None]:
    for left, right in ((target, candidate), (candidate, target)):
        anchor_id = left.get("synthetic_anchor_norad_id")
        event_class = left.get("synthetic_event_class")
        event_time_minutes = left.get("synthetic_event_time_minutes")
        if anchor_id and event_class and anchor_id == right["norad_id"]:
            return event_class, event_time_minutes
    return None, None


def _density_band(total: int) -> str:
    return (
        "SATURATED"
        if total >= 40
        else "DENSE"
        if total >= 22
        else "MODERATE"
        if total >= 10
        else "SPARSE"
    )


def _build_mitigations(
    target: dict[str, Any],
    closest_approach: dict[str, Any] | None,
    uncertainty_score: float,
) -> list[str]:
    if not closest_approach:
        return [
            "Continue routine screening; no tight tracked conjunction is currently inside the active window.",
            "Maintain nominal surveillance because debris uncertainty still reflects incomplete knowledge of small fragments.",
        ]

    actions: list[str] = []
    min_sep = closest_approach["minSeparationKm"]
    tca_minutes = closest_approach["sampledTcaMinutes"]

    if min_sep <= 50:
        actions.append("Immediate maneuver planning recommended: prepare an along-track or radial offset before the predicted closest approach.")
    elif min_sep <= 150:
        actions.append("Open a collision review window now and evaluate a small pre-planned avoidance burn before TCA.")
    else:
        actions.append("Keep the conjunction under active review; current miss distance is not critical but still warrants targeted screening.")

    if tca_minutes <= 30:
        actions.append("Escalate operational urgency because the time-to-closest-approach is short.")
    elif tca_minutes <= 90:
        actions.append("Increase propagation cadence until the encounter window has passed.")

    if uncertainty_score >= 70:
        actions.append("Treat the surrounding shell as debris-rich and avoid holding station in the same altitude band longer than necessary.")
    elif uncertainty_score >= 45:
        actions.append("Prefer conservative planning because environmental uncertainty is elevated even if the tracked miss distance is moderate.")

    if closest_approach.get("zoneCrossingDetected"):
        actions.append("Adjust along-track timing to avoid high-uncertainty corridor crossings near the predicted encounter window.")

    if target["object_type"] == "PAYLOAD":
        actions.append("Preserve payload mission value by keeping maneuver authority, contact windows, and fuel margins available.")

    return actions[:4]


def _separation_score(min_separation: float) -> float:
    if min_separation <= 0:
        return 100.0
    return _clamp(100.0 * math.exp(-min_separation / 250.0), 0.0, 100.0)


def _timing_score(sampled_tca: int) -> float:
    return _clamp(16.0 - sampled_tca * 0.16, 0.0, 16.0)


def _screen_pair(
    target: dict[str, Any],
    candidate: dict[str, Any],
    when: datetime,
    high_uncertainty_cells: set[tuple[int, int]] | None = None,
) -> dict[str, Any] | None:
    target_now = propagate_record(target, when)
    candidate_now = propagate_record(candidate, when)
    if not target_now or not candidate_now:
        return None

    crossed_cells: set[tuple[int, int]] = set()

    def _capture_zone_cell(state: dict[str, float], sample_dt: datetime) -> None:
        if not high_uncertainty_cells:
            return
        lat, lon = _eci_to_lat_lon(state["x"], state["y"], state["z"], sample_dt)
        cell = _grid_cell(lat, lon)
        if cell in high_uncertainty_cells:
            crossed_cells.add(cell)

    _capture_zone_cell(target_now, when)
    _capture_zone_cell(candidate_now, when)

    current_separation = distance_km(target_now, candidate_now)
    min_separation = current_separation
    sampled_tca = 0

    for minute_offset in range(SCREENING_STEP_MINUTES, SCREENING_WINDOW_MINUTES + SCREENING_STEP_MINUTES, SCREENING_STEP_MINUTES):
        sample_dt = when + timedelta(minutes=minute_offset)
        target_state = propagate_record(target, sample_dt)
        candidate_state = propagate_record(candidate, sample_dt)
        if not target_state or not candidate_state:
            continue

        _capture_zone_cell(target_state, sample_dt)
        _capture_zone_cell(candidate_state, sample_dt)

        separation = distance_km(target_state, candidate_state)
        if separation < min_separation:
            min_separation = separation
            sampled_tca = minute_offset

    current_altitude = target_now["altitude_km"]
    shell_penalty = 0.0
    if abs((candidate["altitude_km"] or 0.0) - current_altitude) <= 80:
        shell_penalty = 10.0

    type_penalty = 6.0 if target["object_type"] == "PAYLOAD" else 2.0
    debris_penalty = 2.0 if candidate["object_type"] == "DEBRIS" else 0.0
    zone_crossing_cells = len(crossed_cells)
    zone_crossing_penalty = min(10.0, zone_crossing_cells * 2.5)
    altitude_delta = abs((candidate["altitude_km"] or 0.0) - current_altitude)
    altitude_score = _clamp(14.0 - altitude_delta * 0.12, 0.0, 14.0)
    separation_score = _separation_score(min_separation)
    urgency_score = _timing_score(sampled_tca)
    risk_score = round(
        _clamp(
            separation_score
            + urgency_score * 0.3
            + shell_penalty * 0.2
            + debris_penalty * 0.2
            + type_penalty * 0.2
            + altitude_score * 0.18
            + zone_crossing_penalty,
            0.0,
            100.0,
        ),
        1,
    )
    event_class, event_time_minutes = _synthetic_event_profile_for_pair(target, candidate)
    event_label, event_color, forced_band = _event_style(event_class, risk_score)
    if event_class == "collision":
        sampled_tca = event_time_minutes if event_time_minutes is not None else min(sampled_tca or 0, 15)
        min_separation = 0.0
        current_separation = min(current_separation, 12.0)
        risk_score = 100.0
    elif event_class == "super_close_call":
        sampled_tca = event_time_minutes if event_time_minutes is not None else sampled_tca
        min_separation = min(min_separation, 8.0)
        risk_score = max(risk_score, 92.0)
    elif event_class == "close_approach":
        sampled_tca = event_time_minutes if event_time_minutes is not None else sampled_tca
        min_separation = min(min_separation, 35.0)
        risk_score = max(risk_score, 76.0)
    elif risk_score >= 100.0:
        risk_score = 99.0
    if event_class is None:
        event_class = _classify_alert_event(min_separation)
        event_label, event_color, forced_band = _event_style(event_class, risk_score)
    risk_score = round(risk_score, 1)

    return {
        "target_norad_id": target["norad_id"],
        "target_name": target["object_name"],
        "target_type": target["object_type"],
        "candidate_norad_id": candidate["norad_id"],
        "candidate_name": candidate["object_name"],
        "candidate_type": candidate["object_type"],
        "regime": target["regime"],
        "current_separation_km": round(current_separation, 1),
        "min_separation_km": round(min_separation, 1),
        "sampled_tca_minutes": sampled_tca,
        "zone_crossing_detected": zone_crossing_cells > 0,
        "zone_crossing_cells": zone_crossing_cells,
        "zone_risk_penalty": round(zone_crossing_penalty, 1),
        "risk_score": risk_score,
        "risk_band": forced_band,
        "risk_color": event_color,
        "event_class": event_class,
        "event_label": event_label,
        "event_time_minutes": event_time_minutes,
        "is_confirmed_collision": event_class == "collision",
    }


def build_global_risk_alerts(
    records: list[dict[str, Any]],
    when: datetime,
    high_uncertainty_cells: set[tuple[int, int]] | None = None,
) -> list[dict[str, Any]]:
    targeted_anchor_ids = {
        record["synthetic_anchor_norad_id"]
        for record in records
        if record.get("is_synthetic") and record.get("synthetic_anchor_norad_id")
    }
    target_candidates = [record for record in records if record["object_type"] == "PAYLOAD"][:160]
    for record in records:
        if (
            not record.get("is_synthetic")
            and record["norad_id"] in targeted_anchor_ids
            and not any(existing["norad_id"] == record["norad_id"] for existing in target_candidates)
        ):
            target_candidates.append(record)

    payloads = target_candidates
    alerts: list[dict[str, Any]] = []
    fallback_alerts: list[dict[str, Any]] = []
    seen_pairs: set[tuple[str, str]] = set()

    for target in payloads:
        candidates = [
            candidate
            for candidate in records
            if candidate["norad_id"] != target["norad_id"]
            and candidate["altitude_km"] is not None
            and target["altitude_km"] is not None
            and abs(candidate["altitude_km"] - target["altitude_km"]) <= 120
        ]
        candidates.sort(key=lambda candidate: _candidate_score(target, candidate))
        best_alert: dict[str, Any] | None = None
        best_fallback_alert: dict[str, Any] | None = None

        for candidate in candidates[:ALERT_SHORTLIST_LIMIT]:
            pair_key = tuple(sorted((target["norad_id"], candidate["norad_id"])))
            if pair_key in seen_pairs:
                continue

            seen_pairs.add(pair_key)
            alert = _screen_pair(target, candidate, when, high_uncertainty_cells=high_uncertainty_cells)
            if not alert:
                continue

            # Relaxed candidate pool used only if strict filtering yields no alerts.
            if (
                alert["min_separation_km"] <= (MAX_ALERT_MIN_SEPARATION_KM * 2.0)
                and alert["risk_score"] >= 25
            ):
                if (
                    best_fallback_alert is None
                    or alert["risk_score"] > best_fallback_alert["risk_score"]
                    or (
                        alert["risk_score"] == best_fallback_alert["risk_score"]
                        and alert["min_separation_km"] < best_fallback_alert["min_separation_km"]
                    )
                ):
                    best_fallback_alert = alert

            if (
                alert["min_separation_km"] <= MAX_ALERT_MIN_SEPARATION_KM
                and alert["risk_score"] >= 45
            ):
                if (
                    best_alert is None
                    or alert["risk_score"] > best_alert["risk_score"]
                    or (
                        alert["risk_score"] == best_alert["risk_score"]
                        and alert["min_separation_km"] < best_alert["min_separation_km"]
                    )
                ):
                    best_alert = alert

        if best_alert:
            alerts.append(best_alert)
        elif best_fallback_alert:
            fallback_alerts.append(best_fallback_alert)

    alerts.sort(
        key=lambda alert: (
            1 if alert.get("is_confirmed_collision") else 0,
            alert["risk_score"],
            -alert["min_separation_km"],
        ),
        reverse=True,
    )
    if alerts:
        return alerts[:8]

    fallback_alerts.sort(
        key=lambda alert: (
            1 if alert.get("is_confirmed_collision") else 0,
            alert["risk_score"],
            -alert["min_separation_km"],
        ),
        reverse=True,
    )
    return fallback_alerts[:8]


def build_target_analysis(records: list[dict[str, Any]], target_norad_id: str, when: datetime) -> dict[str, Any] | None:
    target = next((record for record in records if record["norad_id"] == str(target_norad_id)), None)
    if not target:
        return None

    target_now = propagate_record(target, when)
    if not target_now:
        return None

    target_altitude = target_now["altitude_km"]
    shell_records = [
        candidate
        for candidate in records
        if candidate["norad_id"] != target["norad_id"]
        and candidate["altitude_km"] is not None
        and abs(candidate["altitude_km"] - target_altitude) <= 100
    ]
    shell_debris_count = sum(1 for candidate in shell_records if candidate["object_type"] == "DEBRIS")
    shell_debris_ratio = round((shell_debris_count / len(shell_records)) * 100.0, 1) if shell_records else 0.0
    try:
        high_uncertainty_cells = _high_uncertainty_cells_from_zones(build_uncertainty_zones(records, when))
    except Exception:
        logger.exception("Failed to derive high-uncertainty cell map for target analysis")
        high_uncertainty_cells = set()

    uncertainty_profile = debris_model.get_uncertainty_score(target["norad_id"])
    heuristic_uncertainty = round(
        _clamp(
            18.0
            + len(shell_records) * 0.02
            + ((shell_debris_count / len(shell_records)) * 48.0 if shell_records else 0.0),
            0.0,
            100.0,
        ),
        1,
    )

    candidates = [
        candidate
        for candidate in records
        if candidate["norad_id"] != target["norad_id"]
        and candidate["altitude_km"] is not None
        and abs(candidate["altitude_km"] - target_altitude) <= 120
    ]
    candidates.sort(key=lambda candidate: _candidate_score(target, candidate))

    screened_objects: list[dict[str, Any]] = []
    for candidate in candidates[:ALERT_SHORTLIST_LIMIT]:
        alert = _screen_pair(target, candidate, when, high_uncertainty_cells=high_uncertainty_cells)
        if not alert:
            continue
        screened_objects.append(
            {
                "objectName": alert["candidate_name"],
                "objectType": alert["candidate_type"],
                "noradId": alert["candidate_norad_id"],
                "currentSeparationKm": alert["current_separation_km"],
                "minSeparationKm": alert["min_separation_km"],
                "sampledTcaMinutes": alert["sampled_tca_minutes"],
                "altitudeDeltaKm": round(abs((candidate["altitude_km"] or 0.0) - target_altitude), 1),
                "zoneCrossingDetected": alert["zone_crossing_detected"],
                "zoneCrossingCells": alert["zone_crossing_cells"],
                "zoneRiskPenalty": alert["zone_risk_penalty"],
                "pairRiskScore": alert["risk_score"],
                "pairRiskBand": alert["risk_band"],
                "pairRiskColor": alert["risk_color"],
                "eventClass": alert.get("event_class"),
                "eventLabel": alert.get("event_label"),
                "eventTimeMinutes": alert.get("event_time_minutes"),
                "isConfirmedCollision": alert.get("is_confirmed_collision", False),
            }
        )

    screened_objects.sort(
        key=lambda item: (
            item["pairRiskScore"],
            -item["minSeparationKm"],
        ),
        reverse=True,
    )

    closest_approach = screened_objects[0] if screened_objects else None
    risk_score = closest_approach["pairRiskScore"] if closest_approach else 0.0
    uncertainty_score = (
        uncertainty_profile.get("uncertainty_score")
        if "error" not in uncertainty_profile
        else heuristic_uncertainty
    )
    mitigations = _build_mitigations(target, closest_approach, uncertainty_score)

    return {
        "sampledAt": utc_iso(when),
        "regime": orbital_regime(target_altitude),
        "riskScore": risk_score,
        "riskBand": _risk_band(risk_score),
        "riskColor": closest_approach["pairRiskColor"] if closest_approach else _risk_color(risk_score),
        "shellPopulation": len(shell_records),
        "shellDebrisCount": shell_debris_count,
        "shellDebrisRatio": shell_debris_ratio,
        "densityBand": _density_band(len(shell_records)),
        "uncertaintyScore": uncertainty_score,
        "uncertaintyComponents": {
            "heuristicScore": heuristic_uncertainty,
            "densityScore": uncertainty_profile.get("density_score", 0) if "error" not in uncertainty_profile else 0,
            "anomalyScore": uncertainty_profile.get("anomaly_score", 0) if "error" not in uncertainty_profile else 0,
            "altitudeBandScore": uncertainty_profile.get("altitude_band_score", 0) if "error" not in uncertainty_profile else 0,
        },
        "uncertaintySource": "ml-combined" if "error" not in uncertainty_profile else "heuristic",
        "closestApproach": closest_approach,
        "nearbyObjects": screened_objects[:4],
        "mitigations": mitigations,
    }


def build_analysis_overview(sim_hours: float = 0.0) -> dict[str, Any]:
    raw_catalog = load_cached_catalog()
    records = build_catalog_records(raw_catalog)
    simulated_at = utc_now() + timedelta(hours=sim_hours)

    zones: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []
    high_uncertainty_cells: set[tuple[int, int]] = set()
    try:
        zones = build_uncertainty_zones(records, simulated_at)
        high_uncertainty_cells = _high_uncertainty_cells_from_zones(zones)
    except Exception:
        logger.exception("Failed to build uncertainty zones")
    try:
        alerts = build_global_risk_alerts(records, simulated_at, high_uncertainty_cells=high_uncertainty_cells)
    except Exception:
        logger.exception("Failed to build global risk alerts")

    return {
        "simulated_at": utc_iso(simulated_at),
        "zones": zones,
        "alerts": alerts,
        "catalog_count": len(records),
    }
