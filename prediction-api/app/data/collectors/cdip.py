"""CDIP API client for wave data"""
import httpx
from typing import Dict, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


async def get_wave_data(
    station_id: Optional[str] = None,
    latitude: float = 0,
    longitude: float = 0
) -> Dict[str, float]:
    """
    Get wave height and period data from CDIP.
    
    Args:
        station_id: CDIP station ID (if available)
        latitude: Station latitude
        longitude: Station longitude
    
    Returns:
        Dictionary with wave data
    """
    try:
        # CDIP API endpoint (this is a simplified version)
        # In production, would use actual CDIP API endpoints
        # For now, return location-based estimated values
        
        # Wave conditions vary by location along the coast
        # Use latitude to simulate different wave patterns
        # Southern CA typically has smaller waves, Northern CA has larger
        base_height = 1.2
        height_variation = (latitude - 34.0) * 0.15  # Larger waves as you go north
        wave_height = max(0.5, min(3.0, base_height + height_variation))
        
        # Wave period also varies (longer period = more energy)
        base_period = 8.0
        period_variation = (latitude - 34.0) * 0.2  # Longer period as you go north
        wave_period = max(5.0, min(12.0, base_period + period_variation))
        
        # If we had station_id, we'd fetch real data:
        # url = f"http://cdip.ucsd.edu/api/query/{station_id}/wave"
        
        logger.info(f"Using location-based estimated wave data for lat={latitude}, lon={longitude}")
        
        return {
            "wave_height": wave_height,
            "wave_period": wave_period,
            "timestamp": datetime.utcnow().isoformat(),
            "unit": "meters",
            "source": "estimated",
            "note": "Location-based estimated values - CDIP API integration needed"
        }
        
    except Exception as e:
        logger.error(f"Error fetching CDIP wave data: {str(e)}")
        # Use location-based fallback estimates
        height_variation = (latitude - 34.0) * 0.15 if latitude else 0
        period_variation = (latitude - 34.0) * 0.2 if latitude else 0
        
        return {
            "wave_height": max(0.5, min(3.0, 1.2 + height_variation)),
            "wave_period": max(5.0, min(12.0, 8.0 + period_variation)),
            "timestamp": datetime.utcnow().isoformat(),
            "unit": "meters",
            "source": "estimated",
            "error": str(e)
        }
