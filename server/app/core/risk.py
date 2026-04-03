import math
from datetime import datetime

import numpy as np
from sgp4.api import Satrec, jday

EARTH_RADIUS_KM = 6371.0

def compute_tca(target_tle: tuple[str, str], candidates_tles: list[tuple[str, str]], start_time: datetime, window_minutes: int, step_minutes: int = 5):
    """
    Computes Time of Closest Approach (TCA) for a target satellite against a list of candidates.
    Returns a list of dictionaries with closest approach metrics.
    """
    target_sat = Satrec.twoline2rv(target_tle[0], target_tle[1])
    candidate_sats = [Satrec.twoline2rv(tle[0], tle[1]) for tle in candidates_tles]
    
    results = []
    
    for candidate in candidate_sats:
        min_dist = float('inf')
        tca_offset = 0
        
        for minute_offset in range(0, window_minutes + 1, step_minutes):
            eval_time = start_time.timestamp() + (minute_offset * 60)
            eval_dt = datetime.fromtimestamp(eval_time)
            
            jd, fr = jday(eval_dt.year, eval_dt.month, eval_dt.day, eval_dt.hour, eval_dt.minute, eval_dt.second)
            
            e_t, r_t, v_t = target_sat.sgp4(jd, fr)
            e_c, r_c, v_c = candidate.sgp4(jd, fr)
            
            if e_t == 0 and e_c == 0:
                dist = math.dist(r_t, r_c)
                if dist < min_dist:
                    min_dist = dist
                    tca_offset = minute_offset
                    
        results.append({
            "min_separation_km": round(min_dist, 2),
            "tca_minutes": tca_offset
        })
        
    return results
