"""Prediction logic"""
import numpy as np
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
import logging

from .loader import get_model_for_station, get_mock_model
from ..utils.preprocess import prepare_prediction_input, validate_predictors

logger = logging.getLogger(__name__)


def predict_water_quality(
    station_code: str,
    predictors: Dict[str, float],
    models_dir: str = "models",
    use_mock: bool = False
) -> Dict[str, Any]:
    """
    Generate water quality prediction for a station.
    
    Args:
        station_code: Station identifier
        predictors: Environmental predictor values
        models_dir: Directory containing model files
        use_mock: If True, use mock model (for development)
    
    Returns:
        Dictionary with prediction results
    """
    # Validate inputs
    is_valid, error_msg = validate_predictors(predictors)
    if not is_valid:
        return {
            "error": error_msg,
            "success": False
        }
    
    try:
        # Get model
        if use_mock:
            model = get_mock_model()
        else:
            model = get_model_for_station(station_code, models_dir)
            if model is None:
                logger.warning(f"No model found for station {station_code}, using mock")
                model = get_mock_model()
        
        # Prepare input
        X = prepare_prediction_input(predictors)
        
        # Generate prediction
        prediction = model.predict(X)
        predicted_value = float(prediction[0, 0]) if prediction.ndim > 1 else float(prediction[0])
        
        # Calculate confidence interval (simplified - should use model's prediction interval if available)
        std_dev = predicted_value * 0.3  # 30% coefficient of variation (should come from model)
        confidence_lower = max(0, predicted_value - 1.96 * std_dev)
        confidence_upper = predicted_value + 1.96 * std_dev
        
        # Determine risk level
        risk_level = determine_risk_level(predicted_value)
        
        return {
            "success": True,
            "station_code": station_code,
            "prediction": {
                "fecal_coliform_cfu": round(predicted_value, 2),
                "confidence_interval": [
                    round(confidence_lower, 2),
                    round(confidence_upper, 2)
                ],
                "risk_level": risk_level,
                "prediction_date": datetime.utcnow().isoformat() + "Z"
            },
            "model_info": {
                "model_type": get_model_type(model),
                "use_mock": use_mock
            }
        }
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


def determine_risk_level(cfu_value: float) -> str:
    """
    Determine risk level based on fecal coliform count.
    
    Args:
        cfu_value: Predicted CFU/100mL value
    
    Returns:
        Risk level: "safe", "caution", or "unsafe"
    """
    if cfu_value < 70:
        return "safe"  # Low risk
    elif cfu_value <= 104:
        return "caution"  # Poor water quality
    else:
        return "unsafe"  # Not recommended to swim


def get_model_type(model: Any) -> str:
    """Get the type of model (for informational purposes)"""
    model_type = type(model).__name__
    
    # Map common model types
    type_map = {
        "EnhancedHeuristicModel": "heuristic",
        "MockModel": "mock",
        "RandomForestRegressor": "random_forest",
        "GradientBoostingRegressor": "gradient_boosting",
        "LinearRegression": "linear",
    }
    
    return type_map.get(model_type, model_type.lower())
