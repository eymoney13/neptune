"""FastAPI application for water quality predictions"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional, List
from datetime import datetime, timedelta
import logging
import os

import httpx

import math

from .models.predictor import predict_water_quality
from .data.aggregator import get_all_environmental_data
from .data.collectors.noaa import find_nearest_noaa_station, get_tide_data

# Station filter: only process stations whose code contains this string.
# Set to None to process all stations.
# To restore all California beaches, set STATION_FILTER = None
STATION_FILTER = "Hermosa Beach"

# Region mapping (matches build_training_data.py)
_NOAA_REGIONS = {
    "9410170": (32.7142, -117.1733, "san_diego"),
    "9410230": (33.7200, -118.2644, "los_angeles"),
    "9410840": (34.0531, -118.2426, "santa_monica"),
    "9411340": (34.4083, -119.6856, "santa_barbara"),
    "9412110": (36.9519, -122.0269, "monterey"),
    "9413450": (37.7749, -122.4194, "san_francisco"),
    "9414290": (38.2324, -122.6369, "north_bay"),
}


def _resolve_region(lat: float, lon: float) -> str:
    best_region, best_d = "san_diego", float("inf")
    for sid, (slat, slon, rname) in _NOAA_REGIONS.items():
        dlat = math.radians(slat - lat)
        dlon = math.radians(slon - lon)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(slat)) * math.sin(dlon / 2) ** 2
        d = 6371 * 2 * math.asin(math.sqrt(a))
        if d < best_d:
            best_d, best_region = d, rname
    return best_region

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Water Quality Prediction API",
    description="API for predicting water quality based on environmental conditions",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class PredictorsRequest(BaseModel):
    """Environmental predictor values"""
    rainfall_24h: Optional[float] = 0.0
    precipitation_48h: Optional[float] = 0.0
    wave_height: Optional[float] = None
    wave_period: Optional[float] = None
    tide_level: Optional[float] = None
    temperature: Optional[float] = None
    wind_speed: Optional[float] = None


class PredictionRequest(BaseModel):
    """Request for water quality prediction"""
    station_code: str
    latitude: float
    longitude: float
    predictors: Optional[PredictorsRequest] = None
    station_id: Optional[str] = None
    use_env_data: bool = True
    use_mock_model: bool = True
    antecedent_fib: Optional[float] = None  # Latest test result (MPN) for this station


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Water Quality Prediction API",
        "version": "1.0.0"
    }


@app.post("/api/predict")
async def predict(request: PredictionRequest):
    """
    Generate water quality prediction for a station.
    
    If use_env_data is True, automatically fetches environmental data.
    Otherwise, uses provided predictors.
    """
    try:
        if STATION_FILTER and STATION_FILTER.lower() not in request.station_code.lower():
            raise HTTPException(status_code=403, detail=f"Station '{request.station_code}' is not in the allowed filter")

        # Auto-detect trained model: if default_model.pkl exists, prefer it
        trained_model_exists = os.path.exists("models/default_model.pkl")
        use_mock = request.use_mock_model and not trained_model_exists

        # Get predictors
        if request.use_env_data and request.predictors is None:
            env_data = await get_all_environmental_data(
                request.station_code,
                request.latitude,
                request.longitude,
                request.station_id
            )
            
            if not env_data.get("success", False):
                logger.warning(f"Environmental data fetch failed: {env_data.get('error')}")
                predictors = {
                    "rainfall_24h": 0.0,
                    "precipitation_48h": 0.0,
                    "wave_height": 1.2,
                    "wave_period": 8.0,
                    "tide_level": 0.0,
                    "temperature": 18.0,
                    "wind_speed": 8.0,
                }
            else:
                predictors = env_data["predictors"]
        elif request.predictors:
            # Use provided predictors
            predictors = {
                "rainfall_24h": request.predictors.rainfall_24h or 0.0,
                "precipitation_48h": request.predictors.precipitation_48h or 0.0,
                "wave_height": request.predictors.wave_height or 1.2,
                "wave_period": request.predictors.wave_period or 8.0,
                "tide_level": request.predictors.tide_level or 0.0,
                "temperature": request.predictors.temperature or 18.0,
                "wind_speed": request.predictors.wind_speed or 8.0,
            }
        else:
            # Default predictors
            predictors = {
                "rainfall_24h": 0.0,
                "precipitation_48h": 0.0,
                "wave_height": 1.2,
                "wave_period": 8.0,
                "tide_level": 0.0,
                "temperature": 18.0,
                "wind_speed": 8.0,
            }
        
        # Pass antecedent FIB (latest test result) to the predictor
        if request.antecedent_fib is not None:
            predictors["antecedent_fib"] = request.antecedent_fib

        region = _resolve_region(request.latitude, request.longitude)
        result = predict_water_quality(
            request.station_code,
            predictors,
            models_dir="models",
            use_mock=use_mock,
            region=region,
        )
        
        if not result.get("success", False):
            raise HTTPException(status_code=400, detail=result.get("error", "Prediction failed"))
        
        return result
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class ForecastRequest(BaseModel):
    station_code: str
    latitude: float
    longitude: float
    antecedent_fib: Optional[float] = None
    days: int = 3


async def _fetch_forecast_weather(lat: float, lon: float, days: int) -> List[dict]:
    """Fetch multi-day forecast weather + marine data from Open-Meteo."""
    weather_days: List[dict] = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            w_resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": round(lat, 4),
                    "longitude": round(lon, 4),
                    "daily": "precipitation_sum,temperature_2m_mean,wind_speed_10m_max",
                    "timezone": "America/Los_Angeles",
                    "forecast_days": days + 1,
                },
            )
            w_resp.raise_for_status()
            w_daily = w_resp.json().get("daily", {})

            m_resp = await client.get(
                "https://marine-api.open-meteo.com/v1/marine",
                params={
                    "latitude": round(lat, 4),
                    "longitude": round(lon, 4),
                    "daily": "wave_height_max,wave_period_max",
                    "timezone": "America/Los_Angeles",
                    "forecast_days": days + 1,
                },
            )
            m_resp.raise_for_status()
            m_daily = m_resp.json().get("daily", {})

        dates = w_daily.get("time", [])
        for i in range(len(dates)):
            precip = (w_daily.get("precipitation_sum") or [])[i] if i < len(w_daily.get("precipitation_sum", [])) else 0
            prev_precip = (w_daily.get("precipitation_sum") or [])[i - 1] if i > 0 else 0
            weather_days.append({
                "date": dates[i],
                "rainfall_24h": precip or 0,
                "precipitation_48h": (precip or 0) + (prev_precip or 0),
                "air_temperature": (w_daily.get("temperature_2m_mean") or [])[i] if i < len(w_daily.get("temperature_2m_mean", [])) else 18,
                "wind_speed": (w_daily.get("wind_speed_10m_max") or [])[i] if i < len(w_daily.get("wind_speed_10m_max", [])) else 8,
                "wave_height": (m_daily.get("wave_height_max") or [])[i] if i < len(m_daily.get("wave_height_max", [])) else 1.2,
                "wave_period": (m_daily.get("wave_period_max") or [])[i] if i < len(m_daily.get("wave_period_max", [])) else 8,
            })
    except Exception as e:
        logger.warning(f"Forecast weather fetch error: {e}")
        for d in range(days + 1):
            weather_days.append({
                "date": (datetime.now() + timedelta(days=d)).strftime("%Y-%m-%d"),
                "rainfall_24h": 0, "precipitation_48h": 0,
                "air_temperature": 18, "wind_speed": 8,
                "wave_height": 1.2, "wave_period": 8,
            })
    return weather_days


@app.post("/api/forecast")
async def forecast(request: ForecastRequest):
    """
    Generate multi-day water quality forecast.
    Uses real forecast weather data and iterates the trained model,
    feeding each day's prediction as the next day's antecedent FIB.
    """
    try:
        if STATION_FILTER and STATION_FILTER.lower() not in request.station_code.lower():
            raise HTTPException(status_code=403, detail=f"Station '{request.station_code}' is not in the allowed filter")

        trained_model_exists = os.path.exists("models/default_model.pkl")
        use_mock = not trained_model_exists

        # Fetch today's env data for the nowcast (day 0)
        env_data = await get_all_environmental_data(
            request.station_code, request.latitude, request.longitude
        )
        today_predictors = env_data.get("predictors", {}) if env_data.get("success") else {}

        # Fetch NOAA tide for today (we already have it from env_data)
        noaa_id = find_nearest_noaa_station(request.latitude, request.longitude)

        # Fetch multi-day forecast weather
        weather_forecast = await _fetch_forecast_weather(
            request.latitude, request.longitude, request.days
        )

        ant_fib = request.antecedent_fib or 10.0
        results = []

        for day_idx in range(request.days + 1):
            if day_idx == 0:
                predictors = dict(today_predictors)
            elif day_idx < len(weather_forecast):
                wf = weather_forecast[day_idx]
                # Fetch tide for this day
                target_date = datetime.now() + timedelta(days=day_idx)
                try:
                    tide_data = await get_tide_data(
                        noaa_id, request.latitude, request.longitude,
                        start_date=target_date - timedelta(hours=12),
                        end_date=target_date,
                    )
                    tide = tide_data.get("tide_level", 0)
                except Exception:
                    tide = 0
                predictors = {
                    "rainfall_24h": wf.get("rainfall_24h", 0),
                    "precipitation_48h": wf.get("precipitation_48h", 0),
                    "wave_height": wf.get("wave_height", 1.2),
                    "wave_period": wf.get("wave_period", 8),
                    "tide_level": tide,
                    "temperature": wf.get("air_temperature", 18),
                    "air_temperature": wf.get("air_temperature", 18),
                    "wind_speed": wf.get("wind_speed", 8),
                }
            else:
                predictors = dict(today_predictors)

            predictors["antecedent_fib"] = ant_fib

            region = _resolve_region(request.latitude, request.longitude)
            result = predict_water_quality(
                request.station_code, predictors,
                models_dir="models", use_mock=use_mock,
                region=region,
            )

            pred_mpn = result.get("prediction", {}).get("fecal_coliform_cfu", ant_fib)
            target_date = (datetime.now() + timedelta(days=day_idx)).strftime("%Y-%m-%d")

            results.append({
                "day": day_idx,
                "date": target_date,
                "prediction": result.get("prediction", {}),
            })

            # Use this day's prediction as next day's antecedent
            ant_fib = pred_mpn

        return {
            "success": True,
            "station_code": request.station_code,
            "forecasts": results,
            "model_info": {"model_type": "gradient_boosting" if trained_model_exists else "heuristic"},
        }

    except Exception as e:
        logger.error(f"Forecast error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/env-data/{station_code}")
async def get_env_data(
    station_code: str,
    latitude: float,
    longitude: float,
    station_id: Optional[str] = None
):
    """Get current environmental data for a station."""
    try:
        result = await get_all_environmental_data(
            station_code, latitude, longitude, station_id
        )
        return result
    except Exception as e:
        logger.error(f"Environmental data error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
