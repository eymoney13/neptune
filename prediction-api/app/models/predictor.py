"""Prediction logic"""
import numpy as np
from typing import Dict, Any, Optional
from datetime import datetime
import logging
import os

from .loader import get_model_for_station, get_model_path_for_station, get_mock_model
from ..utils.preprocess import prepare_prediction_input, validate_predictors

logger = logging.getLogger(__name__)


def _is_trained_model(model: Any) -> bool:
    model_type = type(model).__name__
    return model_type in (
        "GradientBoostingRegressor",
        "RandomForestRegressor",
        "LinearRegression",
        "XGBRegressor",
    )


def predict_water_quality(
    station_code: str,
    predictors: Dict[str, float],
    models_dir: str = "models",
    use_mock: bool = False,
    region: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate water quality prediction for a station.

    Looks up: station-specific → regional → default model.
    Trained models output log10(MPN) which gets converted back.
    """
    is_valid, error_msg = validate_predictors(predictors)
    if not is_valid:
        return {"error": error_msg, "success": False}

    try:
        if use_mock:
            model = get_mock_model()
            model_path = ""
        else:
            model = get_model_for_station(station_code, models_dir, region=region)
            model_path = get_model_path_for_station(station_code, models_dir, region=region)
            if model is None:
                logger.warning(f"No trained model for {station_code}, using heuristic")
                model = get_mock_model()
                model_path = ""

        trained = _is_trained_model(model)

        X = prepare_prediction_input(
            predictors,
            use_trained=trained,
            model_path=model_path,
        )

        raw = model.predict(X)
        raw_value = float(raw[0, 0]) if raw.ndim > 1 else float(raw[0])

        if trained:
            predicted_mpn = 10 ** raw_value
            ci_log_lo = raw_value - 0.4
            ci_log_hi = raw_value + 0.4
            confidence_lower = max(1.0, 10 ** ci_log_lo)
            confidence_upper = 10 ** ci_log_hi
        else:
            predicted_mpn = raw_value
            std_dev = predicted_mpn * 0.3
            confidence_lower = max(0, predicted_mpn - 1.96 * std_dev)
            confidence_upper = predicted_mpn + 1.96 * std_dev

        predicted_mpn = max(1.0, predicted_mpn)
        risk_level = determine_risk_level(predicted_mpn)

        used_model = os.path.basename(model_path) if model_path else "heuristic"

        return {
            "success": True,
            "station_code": station_code,
            "prediction": {
                "fecal_coliform_cfu": round(predicted_mpn, 2),
                "confidence_interval": [
                    round(confidence_lower, 2),
                    round(confidence_upper, 2),
                ],
                "risk_level": risk_level,
                "prediction_date": datetime.utcnow().isoformat() + "Z",
            },
            "model_info": {
                "model_type": get_model_type(model),
                "model_file": used_model,
                "use_mock": not trained,
            },
        }
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return {"success": False, "error": str(e)}


def determine_risk_level(mpn_value: float) -> str:
    if mpn_value <= 35:
        return "safe"
    elif mpn_value <= 103:
        return "caution"
    else:
        return "unsafe"


def get_model_type(model: Any) -> str:
    model_type = type(model).__name__
    type_map = {
        "EnhancedHeuristicModel": "heuristic",
        "MockModel": "mock",
        "RandomForestRegressor": "random_forest",
        "GradientBoostingRegressor": "gradient_boosting",
        "LinearRegression": "linear",
    }
    return type_map.get(model_type, model_type.lower())
