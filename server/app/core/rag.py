import logging
from typing import Dict, Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Basic system prompt governing the AI persona
KESSLER_SYSTEM_PROMPT = """You are KesslerX, an advanced orbital mechanics and risk assessment AI designed by the Space Sustainability Coalition. 
Your objective is to provide actionable, succinct mitigation advice to satellite operators.
You will be provided with live metrics including:
1. Target Satellite details.
2. An ML-derived 'Uncertainty Score' (0-100%) indicating how anomalous the orbital regime is (higher means more undocumented debris risk).
3. Evaluated Time of Closest Approach (TCA) metrics from our kinematics engine.

Respond in standard technical language without sounding overly conversational. Include a short 'Assessment' and a 'Mitigation Strategy'.
If the OpenAI API key is missing or invalid, do not apologize, just state: "LLM Explanation Engine offline. Please check API configuration."
"""

class RAGEngine:
    def __init__(self):
        self.enabled = bool(settings.gemini_api_key)
        if self.enabled:
            try:
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-2.5-flash",
                    api_key=settings.gemini_api_key,
                    temperature=0.2
                )
            except Exception as e:
                logger.error("Failed to initialize LangChain LLM: %s", e)
                self.enabled = False
        else:
            self.llm = None

    async def generate_explanation(self, analysis_context: Dict[str, Any]) -> str:
        """
        Ingests the structured data objects from the kinematics and ML engines 
        and turns them into a human-readable threat assessment.
        """
        if not self.enabled or not self.llm:
            return "Advanced AI diagnostics unavailable. [System: GEMINI_API_KEY not configured]."
            
        try:
            prompt = (
                f"Target: {analysis_context.get('object_name', 'Unknown')} (ID: {analysis_context.get('norad_id', 'N/A')})\n"
                f"Displayed Uncertainty Score: {analysis_context.get('uncertainty_score', 0)}%\n"
                f"Risk Band: {analysis_context.get('risk_band', 'Unknown')}\n"
                f"Orbital Regime: {analysis_context.get('regime', 'Unknown')}\n"
                f"Is Debris Outlier Zone: {analysis_context.get('is_debris_outlier', 'Unknown')}\n"
                f"TCA Minimum Separation: {analysis_context.get('min_separation_km', 'None detected')} km\n"
                "Use the displayed uncertainty score exactly as provided. Do not invent a different score. "
                "Please generate a concise threat assessment and recommended maneuvers/strategy."
            )

            messages = [
                SystemMessage(content=KESSLER_SYSTEM_PROMPT),
                HumanMessage(content=prompt)
            ]
            
            response = await self.llm.ainvoke(messages)
            return response.content
            
        except Exception as e:
            logger.error("LLM Generation failed: %s", e)
            if "insufficient_quota" in str(e) or "invalid_api_key" in str(e) or "401" in str(e) or "429" in str(e):
                return "LLM Explanation Engine offline. Please check API configuration."
            return f"Error executing inference: {e}"

rag_engine = RAGEngine()
