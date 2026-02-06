"""FastAPI application for water quality predictions"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional, List
import logging
import os

from .models.predictor import predict_water_quality
from .data.aggregator import get_all_environmental_data

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
    use_env_data: bool = True  # Whether to fetch environmental data automatically
    use_mock_model: bool = True  # Use mock model if no trained model available


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
        # Determine if we should use mock model
        use_mock = request.use_mock_model or not os.path.exists("models")
        
        # Get predictors
        if request.use_env_data and request.predictors is None:
            # Fetch environmental data automatically
            env_data = await get_all_environmental_data(
                request.station_code,
                request.latitude,
                request.longitude,
                request.station_id
            )
            
            if not env_data.get("success", False):
                logger.warning(f"Environmental data fetch failed: {env_data.get('error')}")
                # Use default predictors
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
        
        # Generate prediction
        result = predict_water_quality(
            request.station_code,
            predictors,
            models_dir="models",
            use_mock=use_mock
        )
        
        if not result.get("success", False):
            raise HTTPException(status_code=400, detail=result.get("error", "Prediction failed"))
        
        return result
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/env-data/{station_code}")
async def get_env_data(
    station_code: str,
    latitude: float,
    longitude: float,
    station_id: Optional[str] = None
):
    """
    Get current environmental data for a station.
    """
    try:
        result = await get_all_environmental_data(
            station_code,
            latitude,
            longitude,
            station_id
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Environmental data error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
