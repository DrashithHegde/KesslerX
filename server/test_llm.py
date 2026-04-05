import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
from app.core.rag import rag_engine, KESSLER_SYSTEM_PROMPT
from langchain_core.messages import SystemMessage, HumanMessage

async def main():
    ctx = {
        "object_name": "COSMOS 1231",
        "norad_id": "12110",
        "uncertainty_score": 100,
        "is_debris_outlier": True,
        "min_separation_km": 289.8
    }
    resp = await rag_engine.llm.ainvoke([SystemMessage(content=KESSLER_SYSTEM_PROMPT), HumanMessage(content="""Target: COSMOS 1231 (ID: 12110)
ML Uncertainty Score: 100%
Is Debris Outlier Zone: True
TCA Minimum Separation: 289.8 km
Please generate a concise threat assessment and recommended maneuvers/strategy.""")])
    print("OUTPUT:")
    print(resp.content)
    print("METADATA:")
    print(resp.response_metadata)

asyncio.run(main())
