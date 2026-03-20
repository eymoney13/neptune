"""Wave data from Open-Meteo Marine API (replaces CDIP placeholder)"""
import httpx
from typing import Dict, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


async def get_wave_data(
    station_id: Optional[str] = None,
    latitude: float = 0,
    longitude: float = 0
) -> Dict[str, float]:
    """
    Get current wave height and period from Open-Meteo Marine API.
    Free, no API key required.
    """
    try:
        url = "https://marine-api.open-meteo.com/v1/marine"
        params = {
            "latitude": round(latitude, 4),
            "longitude": round(longitude, 4),
            "current": "wave_height,wave_period",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        current = data.get("current", {})
        wave_height = current.get("wave_height")
        wave_period = current.get("wave_period")

        if wave_height is not None:
            logger.info(f"Open-Meteo marine: wave_height={wave_height}m, period={wave_period}s")
            return {
                "wave_height": float(wave_height),
                "wave_period": float(wave_period or 8.0),
                "timestamp": datetime.utcnow().isoformat(),
                "unit": "meters",
                "source": "open-meteo-marine",
            }

    except Exception as e:
        logger.warning(f"Open-Meteo marine error, using estimate: {e}")

    # Fallback estimate
    height_var = (latitude - 34.0) * 0.15 if latitude else 0
    period_var = (latitude - 34.0) * 0.2 if latitude else 0
    return {
        "wave_height": max(0.5, min(3.0, 1.2 + height_var)),
        "wave_period": max(5.0, min(12.0, 8.0 + period_var)),
        "timestamp": datetime.utcnow().isoformat(),
        "unit": "meters",
        "source": "estimated",
    }
