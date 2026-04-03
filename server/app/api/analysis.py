import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.catalog import build_analysis_overview, build_catalog_records, build_target_analysis, load_cached_catalog
from app.ml.debris_model import debris_model
from app.core.rag import rag_engine

router = APIRouter()
logger = logging.getLogger(__name__)

class ExplanationRequest(BaseModel):
    norad_id: str
    object_name: str
    min_separation_km: float | None = None
    uncertainty_score: float | None = None
    risk_band: str | None = None
    regime: str | None = None


@router.get("/overview")
async def get_analysis_overview(sim_hours: float = 0.0):
    """
    Returns global uncertainty-zone and conjunction-alert analytics for the
    current catalog at an optional simulated time offset.
    """
    return {
        "status": "success",
        "data": build_analysis_overview(sim_hours=sim_hours),
    }


@router.get("/target/{norad_id}")
async def get_target_analysis(norad_id: str, sim_hours: float = 0.0):
    raw_catalog = load_cached_catalog()
    records = build_catalog_records(raw_catalog)
    when = datetime.now(timezone.utc) + timedelta(hours=sim_hours)
    analysis = build_target_analysis(records, norad_id, when)
    if not analysis:
        raise HTTPException(status_code=404, detail="Target analysis unavailable")

    return {
        "status": "success",
        "data": analysis,
    }

@router.get("/uncertainty/{norad_id}")
async def get_uncertainty(norad_id: str):
    """
    Retrieves the ML-driven uncertainty and undocumented probability score 
    for a specific orbital object based on IsolationForest anomaly detection.
    """
    result = debris_model.get_uncertainty_score(norad_id)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
        
    return {
        "status": "success",
        "data": result
    }

@router.post("/explain")
async def generate_rag_explanation(req: ExplanationRequest):
    """
    Feeds the current ML risk profile into the LLM chain to generate 
    an actionable mitigation overlay for the UI.
    """
    # 1. Gather Context
    uncertainty_result = debris_model.get_uncertainty_score(req.norad_id)
    resolved_uncertainty = req.uncertainty_score
    if resolved_uncertainty is None and "error" not in uncertainty_result:
        resolved_uncertainty = uncertainty_result.get("uncertainty_score")
    if resolved_uncertainty is None:
        resolved_uncertainty = 0
    
    context = {
        "norad_id": req.norad_id,
        "object_name": req.object_name,
        "min_separation_km": req.min_separation_km,
        "uncertainty_score": resolved_uncertainty,
        "is_debris_outlier": uncertainty_result.get("is_debris_outlier", False) if "error" not in uncertainty_result else None,
        "risk_band": req.risk_band,
        "regime": req.regime,
    }
    
    # 2. Generate
    explanation = await rag_engine.generate_explanation(context)
    
    return {
        "status": "success",
        "explanation": explanation,
        "uncertainty_score": context.get("uncertainty_score", 0),
        "uncertainty_source": "client" if req.uncertainty_score is not None else "ml",
    }
