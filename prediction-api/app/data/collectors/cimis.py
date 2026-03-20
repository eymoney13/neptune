"""Weather data from Open-Meteo (replaces CIMIS placeholder)"""
import httpx
from typing import Dict, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


async def get_weather_data(
    station_id: Optional[str] = None,
    latitude: float = 0,
    longitude: float = 0
) -> Dict[str, float]:
    """
    Get current weather (precipitation, temp, wind) from Open-Meteo.
    Free, no API key required.
    """
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": round(latitude, 4),
            "longitude": round(longitude, 4),
            "current": "wind_direction_10m",
            "daily": "precipitation_sum,temperature_2m_mean,wind_speed_10m_max",
            "past_days": 2,
            "timezone": "America/Los_Angeles",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        current = data.get("current", {})
        daily = data.get("daily", {})
        precip_vals = daily.get("precipitation_sum", [])
        temp_vals = daily.get("temperature_2m_mean", [])
        wind_vals = daily.get("wind_speed_10m_max", [])

        rainfall_24h = precip_vals[-1] if precip_vals else 0.0
        rainfall_48h = sum(precip_vals[-2:]) if len(precip_vals) >= 2 else rainfall_24h
        air_temp = temp_vals[-1] if temp_vals else 18.0
        wind_speed = wind_vals[-1] if wind_vals else 8.0
        wind_dir = current.get("wind_direction_10m", 270.0)

        logger.info(f"Open-Meteo weather: rain24={rainfall_24h}mm, temp={air_temp}°C, wind_max={wind_speed}m/s")

        return {
            "rainfall_24h": float(rainfall_24h or 0),
            "rainfall_48h": float(rainfall_48h or 0),
            "precipitation_48h": float(rainfall_48h or 0),
            "air_temperature": float(air_temp),
            "temperature": float(air_temp),
            "wind_speed": float(wind_speed or 8.0),
            "wind_direction": float(wind_dir or 270.0),
            "timestamp": datetime.utcnow().isoformat(),
            "unit": "metric",
            "source": "open-meteo",
        }

    except Exception as e:
        logger.warning(f"Open-Meteo weather error, using estimate: {e}")

    coastal_factor = abs(longitude + 118.0) / 2.0 if longitude else 0
    rainfall_24h = max(0.0, (coastal_factor * 0.1) % 2.0)
    temp_var = (latitude - 34.0) * -0.5 if latitude else 0
    wind_var = (abs(longitude + 118.0) / 5.0) % 4.0 if longitude else 0

    return {
        "rainfall_24h": rainfall_24h,
        "rainfall_48h": rainfall_24h * 1.5,
        "precipitation_48h": rainfall_24h * 1.5,
        "air_temperature": 20.0 + temp_var,
        "temperature": 20.0 + temp_var,
        "wind_speed": 8.0 + wind_var,
        "wind_direction": 270.0,
        "timestamp": datetime.utcnow().isoformat(),
        "unit": "metric",
        "source": "estimated",
    }
