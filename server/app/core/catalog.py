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
MAX_ALERT_MIN_SEPARATION_KM = 160.0
FALLBACK_ALERT_MIN_SEPARATION_KM = 280.0
ALERT_SHORTLIST_LIMIT = 36
ALERT_TARGET_LIMIT = 320
ALERT_TARGET_ALTITUDE_BAND_KM = 180.0
PER_TARGET_ALERT_LIMIT = 2
GLOBAL_ALERT_LIMIT = 16
MIN_PRIMARY_ALERT_RISK_SCORE = 38.0
MIN_FALLBACK_ALERT_RISK_SCORE = 22.0
UNCERTAINTY_GRID_LAT_STEP_DEG = 12.0
UNCERTAINTY_GRID_LON_STEP_DEG = 12.0
UNCERTAINTY_CELL_LIMIT = 24
HIGH_UNCERTAINTY_ZONE_THRESHOLD = 65.0
ZONE_BASE_RADIUS_KM = 150.0
ZONE_MAX_EXTRA_RADIUS_KM = 900.0
ZONE_DENSITY_SPREAD_LIMIT = 0.22
ZONE_MIN_ALTITUDE_HALF_SPAN_KM = 90.0
ZONE_MAX_ALTITUDE_HALF_SPAN_KM = 320.0
ZONE_SEGMENT_CHECK_STEPS = 5
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


def _distance_xyz(left: tuple[float, float, float], right: tuple[float, float, float]) -> float:
    dx = left[0] - right[0]
    dy = left[1] - right[1]
    dz = left[2] - right[2]
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def _segment_point_distance_km(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    point: tuple[float, float, float],
) -> float:
    sx, sy, sz = start
    ex, ey, ez = end
    px, py, pz = point
    dx = ex - sx
    dy = ey - sy
    dz = ez - sz
    length_sq = dx * dx + dy * dy + dz * dz
    if length_sq <= 0:
        return _distance_xyz(start, point)

    t = ((px - sx) * dx + (py - sy) * dy + (pz - sz) * dz) / length_sq
    t = _clamp(t, 0.0, 1.0)
    closest = (sx + dx * t, sy + dy * t, sz + dz * t)
    return _distance_xyz(closest, point)


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


def _eci_to_ecef_xyz(x: float, y: float, z: float, when: datetime) -> tuple[float, float, float]:
    gmst = _gmst_radians(when)
    cos_gmst = math.cos(gmst)
    sin_gmst = math.sin(gmst)
    return (
        x * cos_gmst + y * sin_gmst,
        -x * sin_gmst + y * cos_gmst,
        z,
    )


def _lat_lon_alt_to_cartesian(lat: float, lon: float, orbital_radius_km: float) -> tuple[float, float, float]:
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    return (
        orbital_radius_km * math.cos(lat_rad) * math.cos(lon_rad),
        orbital_radius_km * math.sin(lat_rad),
        orbital_radius_km * math.cos(lat_rad) * math.sin(lon_rad),
    )


def _zone_effective_radius_km(uncertainty_score: float | None, total_objects: int | None) -> float:
    score = _clamp(_safe_float(uncertainty_score) or 0.0, 0.0, 100.0)
    radius_km = ZONE_BASE_RADIUS_KM + (score / 100.0) * ZONE_MAX_EXTRA_RADIUS_KM
    density_spread_boost = min((total_objects or 0) / 90.0, ZONE_DENSITY_SPREAD_LIMIT)
    return radius_km * (1.0 + density_spread_boost)


def _zone_altitude_half_span_km(effective_radius_km: float | None) -> float:
    radius_km = max(_safe_float(effective_radius_km) or 0.0, 0.0)
    return _clamp(
        radius_km * 0.45,
        ZONE_MIN_ALTITUDE_HALF_SPAN_KM,
        ZONE_MAX_ALTITUDE_HALF_SPAN_KM,
    )


def _normalize_longitude_deg(lon: float) -> float:
    normalized = ((lon + 180.0) % 360.0) - 180.0
    return 180.0 if normalized == -180.0 and lon > 0 else normalized


def _longitude_delta_deg(left: float, right: float) -> float:
    return abs(((left - right + 180.0) % 360.0) - 180.0)


def _lerp_longitude_deg(start: float, end: float, t: float) -> float:
    delta = ((end - start + 180.0) % 360.0) - 180.0
    return _normalize_longitude_deg(start + delta * t)


def _sample_within_zone_region(
    sample: tuple[float, float, float],
    region: dict[str, Any],
) -> bool:
    lat, lon, altitude_km = sample
    return (
        abs(lat - region["lat"]) <= region["cell_half_lat_deg"]
        and _longitude_delta_deg(lon, region["lon"]) <= region["cell_half_lon_deg"]
        and abs(altitude_km - region["avg_altitude_km"]) <= region["altitude_half_span_km"]
    )


def _segment_crosses_zone_region(
    start_sample: tuple[float, float, float],
    end_sample: tuple[float, float, float],
    region: dict[str, Any],
) -> bool:
    if _sample_within_zone_region(start_sample, region) or _sample_within_zone_region(end_sample, region):
        return True

    start_lat, start_lon, start_altitude_km = start_sample
    end_lat, end_lon, end_altitude_km = end_sample

    for index in range(1, ZONE_SEGMENT_CHECK_STEPS):
        t = index / ZONE_SEGMENT_CHECK_STEPS
        interpolated_sample = (
            start_lat + (end_lat - start_lat) * t,
            _lerp_longitude_deg(start_lon, end_lon, t),
            start_altitude_km + (end_altitude_km - start_altitude_km) * t,
        )
        if _sample_within_zone_region(interpolated_sample, region):
            return True

    return False


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

        effective_radius_km = round(_zone_effective_radius_km(uncertainty_score, total), 1)

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
                "effective_radius_km": effective_radius_km,
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


def _alert_target_priority(record: dict[str, Any]) -> tuple[int, int, float]:
    object_type = record.get("object_type")
    if object_type == "PAYLOAD":
        type_priority = 0
    elif object_type == "ROCKET BODY":
        type_priority = 1
    elif object_type == "DEBRIS":
        type_priority = 2
    else:
        type_priority = 3

    synthetic_priority = 0 if record.get("synthetic_anchor_norad_id") else 1
    altitude = record.get("altitude_km") or 0.0
    return (type_priority, synthetic_priority, altitude)


def _risk_band(score: float) -> str:
    if score >= 80:
        return "SEVERE"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "ELEVATED"
    return "LOW"


def _screenable_uncertainty_regions_from_zones(zones: list[dict[str, Any]]) -> list[dict[str, Any]]:
    regions: list[dict[str, Any]] = []
    for zone in zones:
        uncertainty_score = _safe_float(zone.get("uncertainty_score"))
        lat = _safe_float(zone.get("lat"))
        lon = _safe_float(zone.get("lon"))
        avg_altitude_km = _safe_float(zone.get("avg_altitude_km"))
        effective_radius_km = _safe_float(zone.get("effective_radius_km"))
        cell_size_deg = _safe_float(zone.get("cell_size_deg")) or UNCERTAINTY_GRID_LAT_STEP_DEG
        if (
            uncertainty_score is None
            or lat is None
            or lon is None
            or avg_altitude_km is None
            or effective_radius_km is None
        ):
            continue
        cell = _grid_cell(lat, lon)
        regions.append(
            {
                "zone_id": cell,
                "lat": lat,
                "lon": _normalize_longitude_deg(lon),
                "cell_half_lat_deg": cell_size_deg / 2.0,
                "cell_half_lon_deg": cell_size_deg / 2.0,
                "avg_altitude_km": max(0.0, avg_altitude_km),
                "altitude_half_span_km": _zone_altitude_half_span_km(effective_radius_km),
                "radius_km": effective_radius_km,
                "uncertainty_score": uncertainty_score,
                "is_high_uncertainty": uncertainty_score >= HIGH_UNCERTAINTY_ZONE_THRESHOLD,
            }
        )

    return regions


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
    uncertainty_zone_regions: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    target_now = propagate_record(target, when)
    candidate_now = propagate_record(candidate, when)
    if not target_now or not candidate_now:
        return None

    crossed_zones: dict[tuple[int, int], dict[str, Any]] = {}

    def _capture_zone_crossings(
        state: dict[str, float],
        sample_dt: datetime,
        previous_sample: tuple[float, float, float] | None = None,
    ) -> tuple[float, float, float]:
        lat, lon = _eci_to_lat_lon(state["x"], state["y"], state["z"], sample_dt)
        current_sample = (lat, _normalize_longitude_deg(lon), state["altitude_km"])
        if not uncertainty_zone_regions:
            return current_sample

        for region in uncertainty_zone_regions:
            crossed = (
                _segment_crosses_zone_region(previous_sample, current_sample, region)
                if previous_sample is not None
                else _sample_within_zone_region(current_sample, region)
            )
            if crossed:
                crossed_zones[region["zone_id"]] = region

        return current_sample

    target_previous_sample = _capture_zone_crossings(target_now, when)
    candidate_previous_sample = _capture_zone_crossings(candidate_now, when)

    current_separation = distance_km(target_now, candidate_now)
    min_separation = current_separation
    sampled_tca = 0

    for minute_offset in range(SCREENING_STEP_MINUTES, SCREENING_WINDOW_MINUTES + SCREENING_STEP_MINUTES, SCREENING_STEP_MINUTES):
        sample_dt = when + timedelta(minutes=minute_offset)
        target_state = propagate_record(target, sample_dt)
        candidate_state = propagate_record(candidate, sample_dt)
        if not target_state or not candidate_state:
            continue

        target_previous_sample = _capture_zone_crossings(target_state, sample_dt, target_previous_sample)
        candidate_previous_sample = _capture_zone_crossings(candidate_state, sample_dt, candidate_previous_sample)

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
    zone_crossing_cells = len(crossed_zones)
    zone_crossing_penalty = min(
        10.0,
        sum(
            min(2.5, max(1.0, (region.get("uncertainty_score") or 0.0) / 30.0))
            for region in crossed_zones.values()
        ),
    )
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
    uncertainty_zone_regions: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    targeted_anchor_ids = {
        record["synthetic_anchor_norad_id"]
        for record in records
        if record.get("is_synthetic") and record.get("synthetic_anchor_norad_id")
    }
    target_candidates = [
        record
        for record in records
        if record["object_type"] in {"PAYLOAD", "ROCKET BODY"}
    ]
    for record in records:
        if (
            not record.get("is_synthetic")
            and record["norad_id"] in targeted_anchor_ids
            and not any(existing["norad_id"] == record["norad_id"] for existing in target_candidates)
        ):
            target_candidates.append(record)

    target_candidates.sort(key=_alert_target_priority)
    payloads = target_candidates[:ALERT_TARGET_LIMIT]
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
            and abs(candidate["altitude_km"] - target["altitude_km"]) <= ALERT_TARGET_ALTITUDE_BAND_KM
        ]
        candidates.sort(key=lambda candidate: _candidate_score(target, candidate))
        target_alerts: list[dict[str, Any]] = []
        target_fallback_alerts: list[dict[str, Any]] = []

        for candidate in candidates[:ALERT_SHORTLIST_LIMIT]:
            pair_key = tuple(sorted((target["norad_id"], candidate["norad_id"])))
            if pair_key in seen_pairs:
                continue

            seen_pairs.add(pair_key)
            alert = _screen_pair(target, candidate, when, uncertainty_zone_regions=uncertainty_zone_regions)
            if not alert:
                continue

            # Relaxed candidate pool used only if strict filtering yields no alerts.
            if (
                alert["min_separation_km"] <= FALLBACK_ALERT_MIN_SEPARATION_KM
                and alert["risk_score"] >= MIN_FALLBACK_ALERT_RISK_SCORE
            ):
                target_fallback_alerts.append(alert)

            if (
                alert["min_separation_km"] <= MAX_ALERT_MIN_SEPARATION_KM
                and alert["risk_score"] >= MIN_PRIMARY_ALERT_RISK_SCORE
            ):
                target_alerts.append(alert)

        target_alerts.sort(
            key=lambda alert: (
                1 if alert.get("is_confirmed_collision") else 0,
                alert["risk_score"],
                -alert["min_separation_km"],
            ),
            reverse=True,
        )
        target_fallback_alerts.sort(
            key=lambda alert: (
                1 if alert.get("is_confirmed_collision") else 0,
                alert["risk_score"],
                -alert["min_separation_km"],
            ),
            reverse=True,
        )

        if target_alerts:
            alerts.extend(target_alerts[:PER_TARGET_ALERT_LIMIT])
        elif target_fallback_alerts:
            fallback_alerts.extend(target_fallback_alerts[:PER_TARGET_ALERT_LIMIT])

    alerts.sort(
        key=lambda alert: (
            1 if alert.get("is_confirmed_collision") else 0,
            alert["risk_score"],
            -alert["min_separation_km"],
        ),
        reverse=True,
    )
    if alerts:
        return alerts[:GLOBAL_ALERT_LIMIT]

    fallback_alerts.sort(
        key=lambda alert: (
            1 if alert.get("is_confirmed_collision") else 0,
            alert["risk_score"],
            -alert["min_separation_km"],
        ),
        reverse=True,
    )
    return fallback_alerts[:GLOBAL_ALERT_LIMIT]


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
        uncertainty_zone_regions = _screenable_uncertainty_regions_from_zones(build_uncertainty_zones(records, when))
    except Exception:
        logger.exception("Failed to derive uncertainty-zone map for target analysis")
        uncertainty_zone_regions = []

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
        alert = _screen_pair(target, candidate, when, uncertainty_zone_regions=uncertainty_zone_regions)
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
    uncertainty_zone_regions: list[dict[str, Any]] = []
    try:
        zones = build_uncertainty_zones(records, simulated_at)
        uncertainty_zone_regions = _screenable_uncertainty_regions_from_zones(zones)
    except Exception:
        logger.exception("Failed to build uncertainty zones")
    try:
        alerts = build_global_risk_alerts(records, simulated_at, uncertainty_zone_regions=uncertainty_zone_regions)
    except Exception:
        logger.exception("Failed to build global risk alerts")

    return {
        "simulated_at": utc_iso(simulated_at),
        "zones": zones,
        "alerts": alerts,
        "catalog_count": len(records),
    }
