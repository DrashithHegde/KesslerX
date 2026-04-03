import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sgp4.api import Satrec, jday

from app.core.redis import get_redis
from app.ml.debris_model import debris_model

EARTH_RADIUS_KM = 6371.0
MU_EARTH_KM3_S2 = 398600.4418
SCREENING_WINDOW_MINUTES = 90
SCREENING_STEP_MINUTES = 5
MAX_ALERT_MIN_SEPARATION_KM = 1500.0
ALERT_SHORTLIST_LIMIT = 18
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
    redis_client = get_redis()
    if redis_client:
        payload = redis_client.get(REDIS_CACHE_KEY)
        if payload:
            try:
                data = json.loads(payload)
                return data if isinstance(data, list) else []
            except json.JSONDecodeError:
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


def _shell_key(altitude_km: float | None, shell_width_km: int = 150) -> int | None:
    if altitude_km is None:
        return None
    return int(math.floor(max(0.0, altitude_km) / shell_width_km) * shell_width_km)


def build_uncertainty_zones(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    shells: dict[int, dict[str, Any]] = {}

    for record in records:
        key = _shell_key(record["altitude_km"])
        if key is None:
            continue

        shell = shells.setdefault(
            key,
            {
                "shell_start_km": key,
                "shell_end_km": key + 150,
                "shell_mid_km": key + 75,
                "total_objects": 0,
                "payloads": 0,
                "debris": 0,
                "rocket_bodies": 0,
                "synthetic_objects": 0,
                "regime": orbital_regime(key + 75),
                "avg_inclination": 0.0,
                "inclination_samples": 0,
            },
        )

        shell["total_objects"] += 1
        if record["object_type"] == "PAYLOAD":
            shell["payloads"] += 1
        elif record["object_type"] == "DEBRIS":
            shell["debris"] += 1
        elif record["object_type"] == "ROCKET BODY":
            shell["rocket_bodies"] += 1

        if record["is_synthetic"]:
            shell["synthetic_objects"] += 1

        if record["inclination"] is not None:
            shell["avg_inclination"] += record["inclination"]
            shell["inclination_samples"] += 1

    zones: list[dict[str, Any]] = []
    for shell in shells.values():
        total = shell["total_objects"]
        debris_ratio = shell["debris"] / total if total else 0.0
        traffic_score = min(42.0, total * 1.45)
        debris_score = debris_ratio * 42.0
        synthetic_score = min(16.0, shell["synthetic_objects"] * 3.0)
        uncertainty_score = round(_clamp(12.0 + traffic_score + debris_score + synthetic_score, 0.0, 100.0), 1)
        density_band = (
            "SATURATED"
            if total >= 80
            else "DENSE"
            if total >= 40
            else "MODERATE"
            if total >= 18
            else "SPARSE"
        )

        avg_inclination = None
        if shell["inclination_samples"]:
            avg_inclination = round(shell["avg_inclination"] / shell["inclination_samples"], 1)

        zones.append(
            {
                "shell_start_km": shell["shell_start_km"],
                "shell_end_km": shell["shell_end_km"],
                "shell_mid_km": shell["shell_mid_km"],
                "regime": shell["regime"],
                "total_objects": total,
                "payloads": shell["payloads"],
                "debris": shell["debris"],
                "rocket_bodies": shell["rocket_bodies"],
                "synthetic_objects": shell["synthetic_objects"],
                "debris_ratio": round(debris_ratio * 100.0, 1),
                "uncertainty_score": uncertainty_score,
                "density_band": density_band,
                "avg_inclination": avg_inclination,
            }
        )

    zones.sort(
        key=lambda zone: (
            zone["uncertainty_score"],
            zone["debris"],
            zone["total_objects"],
        ),
        reverse=True,
    )
    return zones[:8]


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


def _risk_color(score: float) -> str:
    if score >= 80:
        return "#ff5f57"
    if score >= 60:
        return "#ff8c42"
    if score >= 40:
        return "#ffd166"
    return "#00d1ff"


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

    if target["object_type"] == "PAYLOAD":
        actions.append("Preserve payload mission value by keeping maneuver authority, contact windows, and fuel margins available.")

    return actions[:4]


def _separation_score(min_separation: float) -> float:
    if min_separation <= 0:
        return 100.0
    return _clamp(100.0 * math.exp(-min_separation / 250.0), 0.0, 100.0)


def _timing_score(sampled_tca: int) -> float:
    return _clamp(16.0 - sampled_tca * 0.16, 0.0, 16.0)


def _screen_pair(target: dict[str, Any], candidate: dict[str, Any], when: datetime) -> dict[str, Any] | None:
    target_now = propagate_record(target, when)
    candidate_now = propagate_record(candidate, when)
    if not target_now or not candidate_now:
        return None

    current_separation = distance_km(target_now, candidate_now)
    min_separation = current_separation
    sampled_tca = 0

    for minute_offset in range(SCREENING_STEP_MINUTES, SCREENING_WINDOW_MINUTES + SCREENING_STEP_MINUTES, SCREENING_STEP_MINUTES):
        sample_dt = when + timedelta(minutes=minute_offset)
        target_state = propagate_record(target, sample_dt)
        candidate_state = propagate_record(candidate, sample_dt)
        if not target_state or not candidate_state:
            continue

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
            + altitude_score * 0.18,
            0.0,
            100.0,
        ),
        1,
    )

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
        "risk_score": risk_score,
        "risk_band": _risk_band(risk_score),
    }


def build_global_risk_alerts(records: list[dict[str, Any]], when: datetime) -> list[dict[str, Any]]:
    payloads = [record for record in records if record["object_type"] == "PAYLOAD"][:160]
    alerts: list[dict[str, Any]] = []
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

        for candidate in candidates[:ALERT_SHORTLIST_LIMIT]:
            pair_key = tuple(sorted((target["norad_id"], candidate["norad_id"])))
            if pair_key in seen_pairs:
                continue

            seen_pairs.add(pair_key)
            alert = _screen_pair(target, candidate, when)
            if (
                alert
                and alert["min_separation_km"] <= MAX_ALERT_MIN_SEPARATION_KM
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

    alerts.sort(
        key=lambda alert: (
            alert["risk_score"],
            -alert["min_separation_km"],
        ),
        reverse=True,
    )
    return alerts[:8]


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
        alert = _screen_pair(target, candidate, when)
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
                "pairRiskScore": alert["risk_score"],
                "pairRiskBand": alert["risk_band"],
                "pairRiskColor": _risk_color(alert["risk_score"]),
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
        "riskColor": _risk_color(risk_score),
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

    return {
        "simulated_at": utc_iso(simulated_at),
        "zones": build_uncertainty_zones(records),
        "alerts": build_global_risk_alerts(records, simulated_at),
        "catalog_count": len(records),
    }
