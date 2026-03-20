"""Aggregate environmental data from multiple sources"""
from typing import Dict, Optional
import asyncio
from datetime import datetime

from .collectors import noaa, cdip, cimis
import logging

logger = logging.getLogger(__name__)


async def get_all_environmental_data(
    station_code: str,
    latitude: float,
    longitude: float,
    station_id: Optional[str] = None
) -> Dict[str, float]:
    """
    Collect environmental data from all sources and aggregate into predictor format.
    
    Args:
        station_code: Station identifier
        latitude: Station latitude
        longitude: Station longitude
        station_id: NOAA station ID if available
    
    Returns:
        Dictionary with all environmental predictors ready for model input
    """
    try:
        # Fetch data from all sources concurrently
        tide_task = noaa.get_tide_data(station_id, latitude, longitude)
        temp_task = noaa.get_water_temperature(station_id, latitude, longitude)
        wave_task = cdip.get_wave_data(None, latitude, longitude)
        weather_task = cimis.get_weather_data(None, latitude, longitude)
        
        tide_data, temp_data, wave_data, weather_data = await asyncio.gather(
            tide_task,
            temp_task,
            wave_task,
            weather_task,
            return_exceptions=True
        )
        
        # Handle errors gracefully
        if isinstance(tide_data, Exception):
            logger.error(f"Tide data error: {tide_data}")
            tide_data = {"tide_level": 0.0}
        if isinstance(temp_data, Exception):
            logger.error(f"Temperature data error: {temp_data}")
            temp_data = {"water_temperature": 18.0}
        if isinstance(wave_data, Exception):
            logger.error(f"Wave data error: {wave_data}")
            wave_data = {"wave_height": 1.2, "wave_period": 8.0}
        if isinstance(weather_data, Exception):
            logger.error(f"Weather data error: {weather_data}")
            weather_data = {"rainfall_24h": 0.0, "temperature": 20.0, "wind_speed": 8.0}
        
        water_temp = temp_data.get("water_temperature", weather_data.get("temperature", 18.0))
        air_temp = weather_data.get("air_temperature", weather_data.get("temperature", water_temp))

        predictors = {
            "rainfall_24h": weather_data.get("rainfall_24h", 0.0),
            "precipitation_48h": weather_data.get("precipitation_48h", weather_data.get("rainfall_48h", 0.0)),
            "wave_height": wave_data.get("wave_height", 1.2),
            "wave_period": wave_data.get("wave_period", 8.0),
            "tide_level": tide_data.get("tide_level", 0.0),
            "temperature": water_temp,
            "air_temperature": air_temp,
            "wind_speed": weather_data.get("wind_speed", 8.0),
            "wind_direction": weather_data.get("wind_direction", 270.0),
        }
        
        # Determine source for each data type
        tide_source = tide_data.get("source", "noaa") if "error" not in tide_data else "error"
        temp_source = temp_data.get("source", "noaa") if "error" not in temp_data else "error"
        wave_source = wave_data.get("source", "cdip") if "error" not in wave_data else "error"
        weather_source = weather_data.get("source", "cimis") if "error" not in weather_data else "error"
        
        return {
            "success": True,
            "predictors": predictors,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "sources": {
                "tide": tide_source,
                "temperature": temp_source,
                "waves": wave_source,
                "weather": weather_source,
            }
        }
        
    except Exception as e:
        logger.error(f"Error aggregating environmental data: {str(e)}")
        # Return default values on error
        return {
            "success": False,
            "error": str(e),
            "predictors": {
                "rainfall_24h": 0.0,
                "precipitation_48h": 0.0,
                "wave_height": 1.2,
                "wave_period": 8.0,
                "tide_level": 0.0,
                "temperature": 18.0,
                "wind_speed": 8.0,
                "wind_direction": 270.0,
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
