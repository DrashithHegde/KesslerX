import logging
import time
import re
from typing import Dict, Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# List of Gemini models to try in order of preference
GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash", 
    "gemini-1.5-pro",
]

# System prompt for the AI Operational Brief panel.
KESSLER_SYSTEM_PROMPT = """You are KesslerX, an orbital risk-assessment AI used by mission operators.

Your job is to produce a concise, deterministic briefing using ONLY the inputs provided.

Output format is mandatory and must always follow this exact template:

Assessment: [briefly explain the encounter and its operational meaning]

Contributing Factors:
- Event Severity: [state encounter severity using distance and TCA]
- Zone Transit: [explicitly say whether the screened path crosses uncertainty-zone cells or not]
- Environment: [briefly combine uncertainty, debris context, and anomaly state]

Mitigation Strategy:
- [action 1]
- [action 2]

Rules:
- Use the displayed uncertainty score exactly as provided; never invent a different score.
- Explicitly mention uncertainty-zone crossing. If there is no crossing, say "no uncertainty-zone crossing detected in the screened path."
- Treat "super_close_call" as a dangerous near-miss that deserves stronger urgency than a routine close approach.
- Treat "collision" or confirmed collision as deterministic impact language, not probabilistic language.
- Keep output to 6-8 lines total.
- Use plain, easy-to-understand language suitable for non-specialist operators.
- Keep each line short, practical, and tactical.
- If any factor input is missing, state "insufficient telemetry" for that factor.
- If model service/config is unavailable, return exactly:
    "LLM Explanation Engine offline. Please check API configuration."
"""

class RAGEngine:
    def __init__(self):
        self.cache_ttl_seconds = 600
        self.error_cache_ttl_seconds = 45
        self.max_cache_entries = 512
        self._explain_cache: dict[str, tuple[float, str]] = {}

        self.enabled = bool(settings.gemini_api_key)
        self.llm = None
        self.model_used = None
        
        if not self.enabled:
            logger.warning("Gemini API key not configured. RAG will return fallback explanations.")
            return
            
        # Try to initialize with available models
        for model in GEMINI_MODELS:
            try:
                logger.info(f"Attempting to initialize ChatGoogleGenerativeAI with model: {model}")
                self.llm = ChatGoogleGenerativeAI(
                    model=model,
                    api_key=settings.gemini_api_key,
                    temperature=0.2,
                    timeout=12,
                    max_retries=1,
                )
                self.model_used = model
                logger.info(f"Successfully initialized Gemini LLM with model: {model}")
                self.enabled = True
                return
            except Exception as e:
                logger.warning(
                    f"Failed to initialize Gemini LLM with model {model}: {type(e).__name__}: {str(e)}"
                )
                continue
        
        # If all models failed, disable RAG
        logger.error(
            "Failed to initialize Gemini LLM with any available model. "
            "Please verify GEMINI_API_KEY is valid and models are accessible."
        )
        self.enabled = False
        self.llm = None

    def _cache_key(self, analysis_context: Dict[str, Any]) -> str:
        """Build a stable cache key from fields that influence prompt output."""

        def _num(value: Any, digits: int = 1) -> Any:
            try:
                return round(float(value), digits)
            except (TypeError, ValueError):
                return None

        payload = {
            "norad_id": str(analysis_context.get("norad_id") or ""),
            "risk_band": str(analysis_context.get("risk_band") or ""),
            "regime": str(analysis_context.get("regime") or ""),
            "event_class": str(analysis_context.get("event_class") or ""),
            "event_label": str(analysis_context.get("event_label") or ""),
            "is_confirmed_collision": bool(analysis_context.get("is_confirmed_collision")) if analysis_context.get("is_confirmed_collision") is not None else None,
            "is_debris_outlier": bool(analysis_context.get("is_debris_outlier")) if analysis_context.get("is_debris_outlier") is not None else None,
            "min_separation_km": _num(analysis_context.get("min_separation_km"), 1),
            "closest_distance_km": _num(analysis_context.get("closest_distance_km"), 1),
            "tca_minutes": _num(analysis_context.get("tca_minutes"), 0),
            "uncertainty_score": _num(analysis_context.get("uncertainty_score"), 1),
            "risk_score": _num(analysis_context.get("risk_score"), 1),
            "debris_share": _num(analysis_context.get("debris_share"), 1),
            "density_band": str(analysis_context.get("density_band") or ""),
            "tracked_debris": _num(analysis_context.get("tracked_debris"), 0),
            "objects_in_orbital_band": _num(analysis_context.get("objects_in_orbital_band"), 0),
            "density_score": _num(analysis_context.get("density_score"), 1),
            "anomaly_score": _num(analysis_context.get("anomaly_score"), 1),
            "zone_crossing_detected": bool(analysis_context.get("zone_crossing_detected")) if analysis_context.get("zone_crossing_detected") is not None else None,
            "zone_crossing_cells": _num(analysis_context.get("zone_crossing_cells"), 0),
            "zone_risk_penalty": _num(analysis_context.get("zone_risk_penalty"), 1),
        }

        # Deterministic string without external dependencies.
        return "|".join(f"{k}={payload[k]}" for k in sorted(payload.keys()))

    def _get_cached(self, key: str) -> str | None:
        cached = self._explain_cache.get(key)
        if not cached:
            return None
        expires_at, value = cached
        if expires_at <= time.time():
            self._explain_cache.pop(key, None)
            return None
        return value

    def _set_cached(self, key: str, value: str, ttl_seconds: int) -> None:
        if len(self._explain_cache) >= self.max_cache_entries:
            # Remove oldest expiring entry to cap memory usage.
            oldest_key = min(self._explain_cache, key=lambda k: self._explain_cache[k][0])
            self._explain_cache.pop(oldest_key, None)
        self._explain_cache[key] = (time.time() + ttl_seconds, value)

    async def generate_explanation(self, analysis_context: Dict[str, Any]) -> str:
        """
        Ingests the structured data objects from the kinematics and ML engines 
        and turns them into a human-readable threat assessment.
        """
        if not self.enabled or not self.llm:
            logger.warning("RAG engine not enabled or LLM not initialized")
            return "LLM Explanation Engine offline. Please check API configuration."

        cache_key = self._cache_key(analysis_context)
        cached = self._get_cached(cache_key)
        if cached is not None:
            logger.debug(f"Returning cached explanation for norad_id: {analysis_context.get('norad_id')}")
            return cached
            
        try:
            target_norad = analysis_context.get('norad_id', 'N/A')
            logger.info(f"Generating RAG explanation for target {target_norad} using model: {self.model_used}")
            
            prompt = (
                "Generate the AI Operational Brief from the telemetry below.\n\n"
                f"Target: {analysis_context.get('object_name', 'Unknown')} (ID: {target_norad})\n"
                f"Displayed Uncertainty Score: {analysis_context.get('uncertainty_score', 'insufficient telemetry')}%\n"
                f"Risk Score: {analysis_context.get('risk_score', 'insufficient telemetry')}%\n"
                f"Risk Band: {analysis_context.get('risk_band', 'insufficient telemetry')}\n"
                f"Event Class: {analysis_context.get('event_class', 'insufficient telemetry')}\n"
                f"Event Label: {analysis_context.get('event_label', 'insufficient telemetry')}\n"
                f"Confirmed Collision: {analysis_context.get('is_confirmed_collision', 'insufficient telemetry')}\n"
                f"Orbital Regime: {analysis_context.get('regime', 'insufficient telemetry')}\n"
                f"TCA Minimum Separation (km): {analysis_context.get('min_separation_km', 'insufficient telemetry')}\n"
                f"Closest Distance (km): {analysis_context.get('closest_distance_km', analysis_context.get('min_separation_km', 'insufficient telemetry'))}\n"
                f"Time to Closest Approach (min): {analysis_context.get('tca_minutes', 'insufficient telemetry')}\n"
                f"Debris Share (%): {analysis_context.get('debris_share', 'insufficient telemetry')}\n"
                f"Region Density: {analysis_context.get('density_band', 'insufficient telemetry')}\n"
                f"Tracked Debris Objects: {analysis_context.get('tracked_debris', 'insufficient telemetry')}\n"
                f"Objects in Orbital Band: {analysis_context.get('objects_in_orbital_band', 'insufficient telemetry')}\n"
                f"Debris Outlier Flag: {analysis_context.get('is_debris_outlier', 'insufficient telemetry')}\n"
                f"Debris Density Score (0-100): {analysis_context.get('density_score', 'insufficient telemetry')}\n"
                f"Anomaly Score (0-100): {analysis_context.get('anomaly_score', 'insufficient telemetry')}\n\n"
                f"Zone Crossing Detected: {analysis_context.get('zone_crossing_detected', 'insufficient telemetry')}\n"
                f"Zone Crossing Cells: {analysis_context.get('zone_crossing_cells', 'insufficient telemetry')}\n"
                f"Zone Risk Penalty: {analysis_context.get('zone_risk_penalty', 'insufficient telemetry')}\n\n"
                "Return only the required template."
            )

            messages = [
                SystemMessage(content=KESSLER_SYSTEM_PROMPT),
                HumanMessage(content=prompt)
            ]
            
            logger.debug(f"Invoking LLM for target {target_norad}")
            response = await self.llm.ainvoke(messages)
            raw_content = response.content if hasattr(response, "content") else ""
            
            logger.debug(f"Raw LLM response type: {type(raw_content)}, content: {str(raw_content)[:200]}")

            # Gemini may return content as a list of content parts
            # (e.g. [{'type': 'text', 'text': '...', 'extras': {...}}])
            # rather than a plain string. Extract just the text.
            if isinstance(raw_content, list):
                logger.debug("Response is a list, extracting text parts")
                text_parts = []
                for part in raw_content:
                    if isinstance(part, dict) and "text" in part:
                        text_parts.append(part["text"])
                    elif isinstance(part, str):
                        text_parts.append(part)
                content = "\n".join(text_parts)
            else:
                content = str(raw_content or "")

            logger.info(f"Successfully generated explanation for target {target_norad}")
            result = self._coerce_plain_operational_brief(content.strip(), analysis_context)
            self._set_cached(cache_key, result, self.cache_ttl_seconds)
            return result
            
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            logger.error(
                f"LLM Generation failed for target {analysis_context.get('norad_id')}: "
                f"{error_type}: {error_msg}", 
                exc_info=True
            )
            
            # Check for specific error types that need different handling
            if any(keyword in error_msg.lower() for keyword in ["quota", "rate", "429", "503"]):
                logger.warning("API quota or rate limit issue detected")
                retry_seconds = None
                # Best-effort extraction from common Gemini/RetryInfo messages.
                # Examples: "Please retry in 42.07s." or "retryDelay': '42s'"
                match = re.search(r"retry in\s+(\d+(?:\.\d+)?)s", error_msg, flags=re.IGNORECASE)
                if not match:
                    match = re.search(r"retryDelay'\s*:\s*'(\d+)s'", error_msg)
                if match:
                    try:
                        retry_seconds = int(float(match.group(1)))
                    except Exception:
                        retry_seconds = None

                offline_msg = "LLM Explanation Engine rate limited (quota exceeded). Please retry shortly."
                if retry_seconds is not None and retry_seconds > 0:
                    offline_msg = f"{offline_msg} Retry after ~{retry_seconds}s."
                self._set_cached(cache_key, offline_msg, self.error_cache_ttl_seconds)
                return offline_msg
            elif any(keyword in error_msg.lower() for keyword in ["invalid_api_key", "401", "unauthenticated"]):
                logger.error("API key authentication failed")
                offline_msg = "LLM Explanation Engine offline. Invalid or expired API key."
                self._set_cached(cache_key, offline_msg, self.error_cache_ttl_seconds)
                return offline_msg
            
            # For other errors, return fallback brief
            logger.info(f"Generating fallback explanation for target {analysis_context.get('norad_id')}")
            fallback_msg = self._coerce_plain_operational_brief("", analysis_context)
            self._set_cached(cache_key, fallback_msg, self.error_cache_ttl_seconds)
            return fallback_msg

    def _coerce_plain_operational_brief(self, content: str, analysis_context: Dict[str, Any]) -> str:
        """
        Guarantees a readable, operator-friendly brief structure even if the LLM
        output is verbose or drifts from the required template.
        """
        min_separation = analysis_context.get("min_separation_km")
        uncertainty_score = analysis_context.get("uncertainty_score")
        debris_outlier = analysis_context.get("is_debris_outlier")
        anomaly_score = analysis_context.get("anomaly_score")
        event_class = analysis_context.get("event_class")
        risk_band = analysis_context.get("risk_band")
        tca_minutes = analysis_context.get("tca_minutes")
        density_band = analysis_context.get("density_band")
        zone_crossing_detected = analysis_context.get("zone_crossing_detected")
        zone_crossing_cells = analysis_context.get("zone_crossing_cells")
        zone_risk_penalty = analysis_context.get("zone_risk_penalty")
        confirmed_collision = analysis_context.get("is_confirmed_collision")

        distance_factor = self._distance_factor(min_separation)
        uncertainty_factor = self._uncertainty_factor(uncertainty_score)
        assessment = self._clean_line(self._extract_assessment(content)) or self._assessment_line(
            event_class,
            confirmed_collision,
            risk_band,
            distance_factor,
            uncertainty_factor,
            tca_minutes,
            zone_crossing_detected,
        )
        event_severity = self._event_severity_line(
            event_class,
            confirmed_collision,
            min_separation,
            analysis_context.get("closest_distance_km"),
            tca_minutes,
        )
        zone_transit = self._zone_transit_line(
            zone_crossing_detected,
            zone_crossing_cells,
            zone_risk_penalty,
        )
        environment = self._environment_line(
            uncertainty_score,
            density_band,
            debris_outlier,
            anomaly_score,
        )
        mitigation_1, mitigation_2 = self._mitigation_lines(
            event_class,
            confirmed_collision,
            risk_band,
            distance_factor,
            uncertainty_factor,
            zone_crossing_detected,
        )
        extracted_mitigations = self._extract_mitigation_lines(content)
        mitigation_1 = self._clean_line(extracted_mitigations[0]) if extracted_mitigations else mitigation_1
        mitigation_2 = self._clean_line(extracted_mitigations[1]) if len(extracted_mitigations) > 1 else mitigation_2

        return "\n".join(
            [
                f"Assessment: {assessment}",
                "Contributing Factors:",
                f"- Event Severity: {event_severity}",
                f"- Zone Transit: {zone_transit}",
                f"- Environment: {environment}",
                "Mitigation Strategy:",
                f"- {mitigation_1}",
                f"- {mitigation_2}",
            ]
        )

    @staticmethod
    def _clean_line(value: Any) -> str | None:
        text = " ".join(str(value or "").strip().split())
        return text or None

    def _extract_assessment(self, content: str) -> str | None:
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("Assessment:"):
                return stripped.partition(":")[2].strip()
        return None

    def _extract_mitigation_lines(self, content: str) -> list[str]:
        lines = []
        capture = False
        for raw_line in content.splitlines():
            stripped = raw_line.strip()
            if not stripped:
                continue
            if stripped.startswith("Mitigation Strategy:"):
                capture = True
                continue
            if capture and stripped.endswith(":") and not stripped.startswith("-"):
                break
            if capture and stripped.startswith("-"):
                lines.append(stripped.lstrip("-").strip())
        return lines

    @staticmethod
    def _distance_factor(min_separation: Any) -> str:
        if min_separation is None:
            return "insufficient telemetry"
        try:
            value = float(min_separation)
        except (TypeError, ValueError):
            return "insufficient telemetry"
        if value <= 1.0:
            return "collision path"
        if value <= 20.0:
            return "super close"
        if value <= 80.0:
            return "close"
        if value <= 300.0:
            return "moderate"
        return "far"

    @staticmethod
    def _uncertainty_factor(uncertainty_score: Any) -> str:
        if uncertainty_score is None:
            return "insufficient telemetry"
        try:
            value = float(uncertainty_score)
        except (TypeError, ValueError):
            return "insufficient telemetry"
        if value >= 70:
            return "high"
        if value >= 35:
            return "medium"
        return "low"

    @staticmethod
    def _debris_factor(debris_outlier: Any) -> str:
        if debris_outlier is None:
            return "insufficient telemetry"
        if bool(debris_outlier):
            return "debris outlier context detected"
        return "no debris outlier context detected"

    @staticmethod
    def _anomaly_factor(anomaly_score: Any) -> str:
        if anomaly_score is None:
            return "insufficient telemetry"
        try:
            value = float(anomaly_score)
        except (TypeError, ValueError):
            return "insufficient telemetry"
        if value >= 70:
            return "high anomaly signal; lower confidence in surrounding environment"
        if value >= 35:
            return "medium anomaly signal; monitor confidence changes"
        return "low anomaly signal; confidence is relatively stable"

    def _event_severity_line(
        self,
        event_class: Any,
        confirmed_collision: Any,
        min_separation: Any,
        closest_distance: Any,
        tca_minutes: Any,
    ) -> str:
        try:
            separation_value = float(
                min_separation if min_separation is not None else closest_distance
            )
        except (TypeError, ValueError):
            separation_value = None
        try:
            tca_value = float(tca_minutes)
        except (TypeError, ValueError):
            tca_value = None

        if bool(confirmed_collision) or event_class == "collision":
            headline = "collision-confirmed geometry"
        elif event_class == "super_close_call":
            headline = "dangerous near-miss"
        elif event_class == "close_approach":
            headline = "close approach"
        else:
            headline = f"{self._distance_factor(separation_value)} conjunction"

        details = []
        if separation_value is not None:
            details.append(f"min separation {separation_value:.1f} km")
        if tca_value is not None:
            details.append(f"TCA T+{int(round(tca_value))} min")
        if not details:
            return f"{headline}; insufficient telemetry."
        return f"{headline}; {', '.join(details)}."

    @staticmethod
    def _zone_transit_line(
        zone_crossing_detected: Any,
        zone_crossing_cells: Any,
        zone_risk_penalty: Any,
    ) -> str:
        if zone_crossing_detected is None:
            return "insufficient telemetry."
        if not bool(zone_crossing_detected):
            return "no uncertainty-zone crossing detected in the screened path."

        try:
            cells = int(zone_crossing_cells)
        except (TypeError, ValueError):
            cells = None
        try:
            penalty = float(zone_risk_penalty)
        except (TypeError, ValueError):
            penalty = None

        cell_text = (
            f"crosses {cells} uncertainty-zone cell{'s' if cells != 1 else ''}"
            if cells is not None
            else "crosses an uncertainty-zone segment"
        )
        if penalty is not None and penalty > 0:
            return f"{cell_text}; corridor hazard is elevated."
        return f"{cell_text}; use conservative margins through that segment."

    def _environment_line(
        self,
        uncertainty_score: Any,
        density_band: Any,
        debris_outlier: Any,
        anomaly_score: Any,
    ) -> str:
        parts: list[str] = []

        if uncertainty_score is not None:
            try:
                uncertainty_value = float(uncertainty_score)
                parts.append(
                    f"uncertainty {uncertainty_value:.0f}% ({self._uncertainty_factor(uncertainty_value)})"
                )
            except (TypeError, ValueError):
                pass

        if density_band:
            parts.append(f"density {str(density_band).lower()}")

        debris_factor = self._debris_factor(debris_outlier)
        if debris_factor != "insufficient telemetry":
            if bool(debris_outlier):
                parts.append("debris outlier present")
            else:
                parts.append("no debris outlier flag")

        if anomaly_score is not None:
            try:
                anomaly_value = float(anomaly_score)
                if anomaly_value >= 70:
                    parts.append(f"anomaly {anomaly_value:.0f}% (high)")
                elif anomaly_value >= 35:
                    parts.append(f"anomaly {anomaly_value:.0f}% (moderate)")
                else:
                    parts.append(f"anomaly {anomaly_value:.0f}% (low)")
            except (TypeError, ValueError):
                pass

        if not parts:
            return "insufficient telemetry."
        return f"{', '.join(parts)}."

    @staticmethod
    def _assessment_line(
        event_class: Any,
        confirmed_collision: Any,
        risk_band: Any,
        distance_factor: str,
        uncertainty_factor: str,
        tca_minutes: Any,
        zone_crossing_detected: Any,
    ) -> str:
        if distance_factor == "insufficient telemetry" or uncertainty_factor == "insufficient telemetry":
            return "insufficient telemetry for full risk interpretation."
        try:
            tca_value = float(tca_minutes)
        except (TypeError, ValueError):
            tca_value = None
        if bool(confirmed_collision) or bool(event_class == "collision"):
            return "Tracked geometry indicates a collision event inside the active screening window."
        if event_class == "super_close_call":
            if bool(zone_crossing_detected):
                return "A dangerous near-miss is forming and the path crosses an uncertainty zone, so treat the pass conservatively."
            if tca_value is not None and tca_value <= 120:
                return "A super-close conjunction is approaching inside the active window and deserves immediate operator attention."
            return "A super-close conjunction is present in the active window and remains operationally dangerous even without confirmed impact."
        if distance_factor in {"collision path", "super close"} and uncertainty_factor in {"medium", "high"}:
            return "Proximity is extremely tight and environmental uncertainty increases residual hazard around the encounter."
        if distance_factor == "close" and uncertainty_factor in {"medium", "high"}:
            if zone_crossing_detected is False:
                return "A close approach is being tracked, but no uncertainty-zone crossing is detected in the screened path."
            return "Proximity is tight and environmental uncertainty is elevated."
        if distance_factor == "moderate" and (uncertainty_factor == "high" or str(risk_band) in {"HIGH", "SEVERE"}):
            return "Separation is moderate, but surrounding risk context keeps the event operationally significant."
        return "Current proximity and uncertainty indicate a manageable but monitored risk posture."

    @staticmethod
    def _mitigation_lines(
        event_class: Any,
        confirmed_collision: Any,
        risk_band: Any,
        distance_factor: str,
        uncertainty_factor: str,
        zone_crossing_detected: Any,
    ) -> tuple[str, str]:
        if bool(confirmed_collision) or bool(event_class == "collision"):
            return (
                "Escalate immediately and halt nominal timeline assumptions because the event is collision-confirmed.",
                "Assess mission loss, debris-generation consequences, and downstream conjunction cascade risk.",
            )
        if zone_crossing_detected is True:
            zone_action = "Use conservative thresholds while the track crosses the uncertainty-zone segment."
        elif zone_crossing_detected is False:
            zone_action = "No uncertainty-zone crossing detected; focus on conjunction validation and TCA updates."
        else:
            zone_action = "Zone-transit telemetry is incomplete; verify corridor risk before committing to action."
        if event_class == "super_close_call" or distance_factor in {"collision path", "super close"}:
            return (
                "Increase tracking cadence immediately and validate the conjunction with higher-fidelity propagation.",
                zone_action,
            )
        if uncertainty_factor == "high" or str(risk_band) in {"HIGH", "SEVERE"}:
            return (
                "Increase tracking cadence and validate inputs from additional sources.",
                zone_action,
            )
        return (
            "Maintain nominal monitoring and scheduled conjunction assessments.",
            zone_action,
        )

rag_engine = RAGEngine()
