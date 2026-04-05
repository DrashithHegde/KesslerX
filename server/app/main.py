from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.scenario import router as scenario_router
from app.api.analysis import router as analysis_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="KesslerX API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api", tags=["KesslerX"])
app.include_router(scenario_router, prefix="/api/scenario", tags=["Scenario", "Simulation"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["ML", "Analysis"])
