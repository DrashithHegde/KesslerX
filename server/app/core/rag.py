import logging
import time
from typing import Dict, Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# System prompt for the AI Operational Brief panel.
KESSLER_SYSTEM_PROMPT = """You are KesslerX, an orbital risk-assessment AI used by mission operators.

Your job is to produce a concise, deterministic briefing using ONLY the inputs provided.

Output format is mandatory and must always follow this exact template:

Assessment: [briefly explain proximity and uncertainty context]

Contributing Factors:
- Distance Factor: [close / moderate / far, based on min_separation_km]
- Uncertainty Factor: [low / medium / high, based on uncertainty score]
- Debris Context: [describe whether debris outlier context is present]
- Anomaly Level: [describe anomaly score and how it influences confidence]

Mitigation Strategy:
- [action 1]
- [action 2]

Rules:
- Use the displayed uncertainty score exactly as provided; never invent a different score.
- Treat "super_close_call" as a dangerous near-miss that deserves stronger urgency than a routine close approach.
- Treat "collision" or confirmed collision as deterministic impact language, not probabilistic language.
- Keep output to 4-8 lines total.
- Use plain, easy-to-understand language suitable for non-specialist operators.
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
        if self.enabled:
            try:
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-3-flash-preview",
                    api_key=settings.gemini_api_key,
                    temperature=0.2
                )
            except Exception as e:
                logger.error("Failed to initialize LangChain LLM: %s", e)
                self.enabled = False
        else:
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
            return "LLM Explanation Engine offline. Please check API configuration."

        cache_key = self._cache_key(analysis_context)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached
            
        try:
            prompt = (
                "Generate the AI Operational Brief from the telemetry below.\n\n"
                f"Target: {analysis_context.get('object_name', 'Unknown')} (ID: {analysis_context.get('norad_id', 'N/A')})\n"
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
                "Return only the required template."
            )

            messages = [
                SystemMessage(content=KESSLER_SYSTEM_PROMPT),
                HumanMessage(content=prompt)
            ]
            
            response = await self.llm.ainvoke(messages)
            raw_content = response.content if hasattr(response, "content") else ""

            # Gemini may return content as a list of content parts
            # (e.g. [{'type': 'text', 'text': '...', 'extras': {...}}])
            # rather than a plain string. Extract just the text.
            if isinstance(raw_content, list):
                text_parts = []
                for part in raw_content:
                    if isinstance(part, dict) and "text" in part:
                        text_parts.append(part["text"])
                    elif isinstance(part, str):
                        text_parts.append(part)
                content = "\n".join(text_parts)
            else:
                content = str(raw_content or "")

            result = self._coerce_plain_operational_brief(content.strip(), analysis_context)
            self._set_cached(cache_key, result, self.cache_ttl_seconds)
            return result
            
        except Exception as e:
            logger.error("LLM Generation failed: %s", e)
            if "insufficient_quota" in str(e) or "invalid_api_key" in str(e) or "401" in str(e) or "429" in str(e):
                offline_msg = "LLM Explanation Engine offline. Please check API configuration."
                self._set_cached(cache_key, offline_msg, self.error_cache_ttl_seconds)
                return offline_msg
            error_msg = f"Error executing inference: {e}"
            self._set_cached(cache_key, error_msg, self.error_cache_ttl_seconds)
            return error_msg

    def _coerce_plain_operational_brief(self, content: str, analysis_context: Dict[str, Any]) -> str:
        """
        Guarantees a readable, operator-friendly brief structure even if the LLM
        output is verbose or drifts from the required template.
        """
        required_markers = [
            "Assessment:",
            "Contributing Factors:",
            "Mitigation Strategy:",
        ]

        if all(marker in content for marker in required_markers):
            return content

        min_separation = analysis_context.get("min_separation_km")
        uncertainty_score = analysis_context.get("uncertainty_score")
        debris_outlier = analysis_context.get("is_debris_outlier")
        anomaly_score = analysis_context.get("anomaly_score")
        event_class = analysis_context.get("event_class")
        risk_band = analysis_context.get("risk_band")
        tca_minutes = analysis_context.get("tca_minutes")

        distance_factor = self._distance_factor(min_separation)
        uncertainty_factor = self._uncertainty_factor(uncertainty_score)
        debris_factor = self._debris_factor(debris_outlier)
        anomaly_factor = self._anomaly_factor(anomaly_score)
        assessment = self._assessment_line(event_class, risk_band, distance_factor, uncertainty_factor, tca_minutes)
        mitigation_1, mitigation_2 = self._mitigation_lines(event_class, risk_band, distance_factor, uncertainty_factor)

        return "\n".join(
            [
                f"Assessment: {assessment}",
                "Contributing Factors:",
                f"- Distance Factor: {distance_factor}",
                f"- Uncertainty Factor: {uncertainty_factor}",
                f"- Debris Context: {debris_factor}",
                f"- Anomaly Level: {anomaly_factor}",
                "Mitigation Strategy:",
                f"- {mitigation_1}",
                f"- {mitigation_2}",
            ]
        )

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

    @staticmethod
    def _assessment_line(
        event_class: Any,
        risk_band: Any,
        distance_factor: str,
        uncertainty_factor: str,
        tca_minutes: Any,
    ) -> str:
        if distance_factor == "insufficient telemetry" or uncertainty_factor == "insufficient telemetry":
            return "insufficient telemetry for full risk interpretation."
        try:
            tca_value = float(tca_minutes)
        except (TypeError, ValueError):
            tca_value = None
        if bool(event_class == "collision"):
            return "Tracked geometry indicates a collision event inside the active screening window."
        if event_class == "super_close_call":
            if tca_value is not None and tca_value <= 120:
                return "A super-close conjunction is approaching inside the active window and deserves immediate operator attention."
            return "A super-close conjunction is present in the active window and remains operationally dangerous even without confirmed impact."
        if distance_factor in {"collision path", "super close"} and uncertainty_factor in {"medium", "high"}:
            return "Proximity is extremely tight and environmental uncertainty increases residual hazard around the encounter."
        if distance_factor == "close" and uncertainty_factor in {"medium", "high"}:
            return "Proximity is tight and environmental uncertainty is elevated."
        if distance_factor == "moderate" and (uncertainty_factor == "high" or str(risk_band) in {"HIGH", "SEVERE"}):
            return "Separation is moderate, but surrounding risk context keeps the event operationally significant."
        return "Current proximity and uncertainty indicate a manageable but monitored risk posture."

    @staticmethod
    def _mitigation_lines(
        event_class: Any,
        risk_band: Any,
        distance_factor: str,
        uncertainty_factor: str,
    ) -> tuple[str, str]:
        if bool(event_class == "collision"):
            return (
                "Escalate immediately and halt nominal timeline assumptions because the event is collision-confirmed.",
                "Assess mission loss, debris-generation consequences, and downstream conjunction cascade risk.",
            )
        if event_class == "super_close_call" or distance_factor in {"collision path", "super close"}:
            return (
                "Increase tracking cadence immediately and validate the conjunction with higher-fidelity propagation.",
                "Prepare an avoidance option or stand-down decision before the event window tightens further.",
            )
        if uncertainty_factor == "high" or str(risk_band) in {"HIGH", "SEVERE"}:
            return (
                "Increase tracking cadence and validate inputs from additional sources.",
                "Use conservative decision thresholds until uncertainty decreases.",
            )
        return (
            "Maintain nominal monitoring and scheduled conjunction assessments.",
            "Re-check risk after the next telemetry refresh or orbit update.",
        )

rag_engine = RAGEngine()
