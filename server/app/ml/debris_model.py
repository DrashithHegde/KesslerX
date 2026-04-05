import json
import logging
import math
from pathlib import Path
from typing import Dict, Any

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from app.core.redis import get_redis

logger = logging.getLogger(__name__)
LOCAL_CACHE_PATH = Path(__file__).resolve().parents[2] / "tle_cache.json"


def _safe_float(value):
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _altitude_from_mean_motion(mean_motion: float | None) -> float | None:
    if not mean_motion or mean_motion <= 0:
        return None
    mean_motion_rad_s = mean_motion * 2 * math.pi / 86400.0
    semi_major_axis = (398600.4418 / (mean_motion_rad_s**2)) ** (1 / 3)
    return semi_major_axis - 6371.0


def _altitude_band_score(altitude_km: float | None) -> int:
    if altitude_km is None:
        return 20
    if 300 <= altitude_km <= 1200:
        return 82
    if 1200 < altitude_km <= 2000:
        return 68
    if 2000 < altitude_km < 35786:
        return 34
    if 35700 <= altitude_km <= 36050:
        return 42
    return 24


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))

class DebrisUncertaintyModel:
    def __init__(self):
        self.scaler = StandardScaler()
        # Contamination defines the proportion of outliers in the data set (debris/anomalies)
        self.model = IsolationForest(n_estimators=100, contamination=0.15, random_state=42)
        self._is_fitted = False

    def _load_catalog(self):
        redis_client = get_redis()
        if redis_client:
          dataset_json = redis_client.get("kesslerx:satellites")
          if dataset_json:
              return json.loads(dataset_json)

        try:
            return json.loads(LOCAL_CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return []

    def train_on_current_catalog(self) -> bool:
        """
        Pulls the current orbiting catalog from Redis, extracts orbital parameters,
        and trains an Isolation Forest to identify dense, uncertain debris regimes.
        """
        try:
            satellites = self._load_catalog()
            if not satellites:
                return False
            
            features = []
            
            for sat in satellites:
                # We extract mean motion and eccentricity to map the orbital shell geometry
                # Space-Track provides MEAN_MOTION (revs/day) and ECCENTRICITY
                mm = _safe_float(sat.get("MEAN_MOTION"))
                ecc = _safe_float(sat.get("ECCENTRICITY"))
                inc = _safe_float(sat.get("INCLINATION")) or 0.0
                
                if mm is not None and ecc is not None:
                    features.append([mm, ecc, inc])
            
            if len(features) < 10:
                logger.warning("Not enough orbital data features to train Isolation Forest.")
                return False

            X = np.array(features)
            X_scaled = self.scaler.fit_transform(X)
            
            self.model.fit(X_scaled)
            self._is_fitted = True
            logger.info("Successfully trained IsolationForest on %d objects.", len(X))
            return True

        except Exception as e:
            logger.error("Failed to train uncertainty model: %s", e)
            return False

    def get_uncertainty_score(self, target_norad_id: str) -> Dict[str, Any]:
        """
        Scores a specific satellite based on how far it is into known fragmentation outliers.
        Returns a normalized uncertainty score (0-100).
        """
        if not self._is_fitted:
            # Reattempt training if memory pipeline is fresh
            if not self.train_on_current_catalog():
               return {"error": "Model not fitted or Redis unavailable.", "score": None}

        try:
            satellites = self._load_catalog()
            if not satellites:
                return {"error": "No active catalog available.", "score": None}
            
            target_sat = next((s for s in satellites if s.get("NORAD_CAT_ID") == str(target_norad_id)), None)
            
            if not target_sat:
                return {"error": "Satellite not found in active catalog.", "score": None}
                
            mm = _safe_float(target_sat.get("MEAN_MOTION"))
            ecc = _safe_float(target_sat.get("ECCENTRICITY"))
            inc = _safe_float(target_sat.get("INCLINATION")) or 0.0
            
            if mm is None or ecc is None:
                return {"error": "Target satellite missing orbital metrics.", "score": None}

            feature = np.array([[mm, ecc, inc]])
            scaled_feature = self.scaler.transform(feature)
            
            # anomaly_score ranges from -0.5 to 0.5 roughly, lower means more anomalous
            # Standardizing into a 0-100 "Uncertainty / Risk" heuristic
            raw_score = self.model.decision_function(scaled_feature)[0]
            anomaly_score = round(_clamp((0.18 - raw_score) * 180, 0.0, 100.0), 1)
            altitude_km = _altitude_from_mean_motion(mm)
            altitude_score = _altitude_band_score(altitude_km)

            neighbors = []
            for sat in satellites:
                sat_id = str(sat.get("NORAD_CAT_ID") or "").strip()
                if not sat_id or sat_id == str(target_norad_id):
                    continue
                sat_mm = _safe_float(sat.get("MEAN_MOTION"))
                sat_altitude = _altitude_from_mean_motion(sat_mm)
                if sat_altitude is None or altitude_km is None:
                    continue
                if abs(sat_altitude - altitude_km) <= 100:
                    neighbors.append(sat)

            local_density = len(neighbors)
            density_score = round(_clamp(local_density * 2.1, 0.0, 100.0), 1)
            debris_neighbors = sum(1 for sat in neighbors if (sat.get("OBJECT_TYPE") or "").upper() == "DEBRIS")
            debris_share = round((debris_neighbors / local_density) * 100.0, 1) if local_density else 0.0

            uncertainty_percentage = round(
                _clamp(
                    density_score * 0.45
                    + anomaly_score * 0.35
                    + altitude_score * 0.2,
                    0.0,
                    100.0,
                ),
                1,
            )
            
            is_outlier = bool(self.model.predict(scaled_feature)[0] == -1)

            return {
                "norad_id": str(target_norad_id),
                "uncertainty_score": uncertainty_percentage,
                "density_score": density_score,
                "local_density": local_density,
                "debris_share": debris_share,
                "anomaly_score": anomaly_score,
                "altitude_band_score": altitude_score,
                "altitude_km": round(altitude_km, 1) if altitude_km is not None else None,
                "is_debris_outlier": is_outlier,
                "raw_decision_score": round(float(raw_score), 4)
            }
            
        except Exception as e:
            logger.error("Failed to predict uncertainty for %s: %s", target_norad_id, e)
            return {"error": str(e), "score": None}

    def get_anomaly_score(self, mean_motion: float | None, eccentricity: float | None, inclination: float | None) -> float | None:
        if mean_motion is None or eccentricity is None:
            return None
        if not self._is_fitted:
            if not self.train_on_current_catalog():
                return None

        try:
            inc = inclination or 0.0
            feature = np.array([[mean_motion, eccentricity, inc]])
            scaled_feature = self.scaler.transform(feature)
            raw_score = self.model.decision_function(scaled_feature)[0]
            return round(_clamp((0.18 - raw_score) * 180, 0.0, 100.0), 1)
        except Exception as e:
            logger.error("Failed to score anomaly: %s", e)
            return None

# Singleton instance
debris_model = DebrisUncertaintyModel()
