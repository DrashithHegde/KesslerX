from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String
from sqlalchemy.sql import func

from app.core.db import Base


class SatelliteRecord(Base):
    __tablename__ = "satellite_records"

    id = Column(Integer, primary_key=True, index=True)
    norad_cat_id = Column(String, index=True, unique=True, nullable=False)
    object_name = Column(String, index=True)
    object_type = Column(String, index=True)
    classification = Column(String)
    
    # TLE data
    tle_line1 = Column(String, nullable=False)
    tle_line2 = Column(String, nullable=False)
    epoch = Column(DateTime(timezone=True))
    
    # Orbital parameters cached
    mean_motion = Column(Float)
    eccentricity = Column(Float)
    inclination = Column(Float)
    
    # Raw payload
    raw_data = Column(JSON)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
