"""NOAA CO-OPS API client for tide and weather data"""
import httpx
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
import logging
import math

logger = logging.getLogger(__name__)

BASE_URL = "https://api.tidesandcurrents.noaa.gov/api/prod"

# Common NOAA stations for California coast
NOAA_STATIONS = {
    "9410170": {"lat": 32.7142, "lon": -117.1733, "name": "San Diego, CA"},
    "9410230": {"lat": 33.7200, "lon": -118.2644, "name": "Los Angeles, CA"},
    "9410840": {"lat": 34.0531, "lon": -118.2426, "name": "Santa Monica, CA"},
    "9412110": {"lat": 36.9519, "lon": -122.0269, "name": "Monterey, CA"},
    "9413450": {"lat": 37.7749, "lon": -122.4194, "name": "San Francisco, CA"},
    "9414290": {"lat": 38.2324, "lon": -122.6369, "name": "Port Chicago, CA"},
    "9414523": {"lat": 38.1467, "lon": -122.9097, "name": "Martinez-Amorco Pier, CA"},
}


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula. Returns distance in kilometers."""
    R = 6371  # Earth radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c


def find_nearest_noaa_station(latitude: float, longitude: float) -> str:
    """
    Find the nearest NOAA station based on coordinates.
    
    Args:
        latitude: Station latitude
        longitude: Station longitude
    
    Returns:
        Nearest NOAA station ID
    """
    if not latitude or not longitude:
        return "9410170"  # Default: San Diego
    
    nearest_station = "9410170"
    min_distance = float('inf')
    
    for station_id, coords in NOAA_STATIONS.items():
        distance = calculate_distance(latitude, longitude, coords["lat"], coords["lon"])
        if distance < min_distance:
            min_distance = distance
            nearest_station = station_id
    
    logger.info(f"Found nearest NOAA station {nearest_station} ({min_distance:.1f}km away)")
    return nearest_station


async def get_tide_data(
    station_id: str,
    latitude: float,
    longitude: float,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> Dict[str, float]:
    """
    Get tide level data from NOAA CO-OPS API.
    
    Args:
        station_id: NOAA station ID (if available)
        latitude: Station latitude
        longitude: Station longitude
        start_date: Start date for data (defaults to now - 24h)
        end_date: End date for data (defaults to now)
    
    Returns:
        Dictionary with tide data
    """
    try:
        if start_date is None:
            start_date = datetime.utcnow() - timedelta(hours=24)
        if end_date is None:
            end_date = datetime.utcnow()
        
        # Format dates for API
        start_str = start_date.strftime("%Y%m%d %H:%M")
        end_str = end_date.strftime("%Y%m%d %H:%M")
        
        # Try to find nearest station if station_id not provided
        if not station_id:
            station_id = find_nearest_noaa_station(latitude, longitude)
        
        url = f"{BASE_URL}/datagetter"
        params = {
            "product": "predictions",
            "application": "NOS.COOPS.TAC.WL",
            "begin_date": start_str,
            "end_date": end_str,
            "datum": "MLLW",
            "station": station_id,
            "time_zone": "gmt",
            "units": "metric",
            "interval": "h",
            "format": "json"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            # Extract latest tide level
            if "predictions" in data and len(data["predictions"]) > 0:
                latest = data["predictions"][-1]
                tide_level = float(latest.get("v", 0))
                
                return {
                    "tide_level": tide_level,
                    "timestamp": latest.get("t"),
                    "unit": "meters",
                    "source": "noaa"
                }
        
        # Fallback: estimate based on location (tides vary by location)
        # Use a simple estimate based on latitude (higher latitude = slightly different tide patterns)
        estimated_tide = 0.5 + (latitude - 34.0) * 0.1  # Vary by ~0.1m per degree latitude
        logger.warning(f"Could not fetch tide data for {station_id}, using location-based estimate")
        return {
            "tide_level": estimated_tide,
            "timestamp": datetime.utcnow().isoformat(),
            "unit": "meters",
            "source": "estimated"
        }
        
    except Exception as e:
        logger.error(f"Error fetching NOAA tide data: {str(e)}")
        # Use location-based fallback estimate
        estimated_tide = 0.5 + (latitude - 34.0) * 0.1 if latitude else 0.5
        return {
            "tide_level": estimated_tide,
            "timestamp": datetime.utcnow().isoformat(),
            "unit": "meters",
            "source": "estimated",
            "error": str(e)
        }


async def get_water_temperature(
    station_id: str,
    latitude: float,
    longitude: float
) -> Dict[str, float]:
    """
    Get water temperature from NOAA.
    
    Returns:
        Dictionary with water temperature data
    """
    try:
        if not station_id:
            station_id = find_nearest_noaa_station(latitude, longitude)
        
        url = f"{BASE_URL}/datagetter"
        params = {
            "product": "water_temperature",
            "application": "NOS.COOPS.TAC.WL",
            "begin_date": (datetime.utcnow() - timedelta(days=1)).strftime("%Y%m%d"),
            "end_date": datetime.utcnow().strftime("%Y%m%d"),
            "station": station_id,
            "time_zone": "gmt",
            "units": "metric",
            "interval": "h",
            "format": "json"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if "data" in data and len(data["data"]) > 0:
                latest = data["data"][-1]
                temp = float(latest.get("v", 0))
                
                return {
                    "water_temperature": temp,
                    "timestamp": latest.get("t"),
                    "unit": "celsius",
                    "source": "noaa"
                }
        
        # Fallback: estimate based on location (water temp varies by latitude)
        # Southern CA is warmer (~18-20°C), Northern CA is cooler (~12-15°C)
        estimated_temp = 18.0 + (latitude - 34.0) * -0.3  # Cooler as you go north
        logger.warning(f"Could not fetch water temp for {station_id}, using location-based estimate")
        return {
            "water_temperature": estimated_temp,
            "timestamp": datetime.utcnow().isoformat(),
            "unit": "celsius",
            "source": "estimated"
        }
        
    except Exception as e:
        logger.error(f"Error fetching NOAA water temperature: {str(e)}")
        # Use location-based fallback estimate
        estimated_temp = 18.0 + (latitude - 34.0) * -0.3 if latitude else 18.0
        return {
            "water_temperature": estimated_temp,
            "timestamp": datetime.utcnow().isoformat(),
            "unit": "celsius",
            "source": "estimated",
            "error": str(e)
        }
