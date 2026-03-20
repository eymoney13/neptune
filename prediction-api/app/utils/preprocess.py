"""Data preprocessing utilities matching training pipeline"""
import json
import math
import os
from datetime import datetime

import numpy as np
from typing import Dict, Optional

# Full feature order for trained models (must match train_model.py FEATURES)
TRAINED_FEATURE_ORDER = [
    "antecedent_fib_log10",
    "days_since_last_sample",
    "precipitation_mm",
    "precipitation_48h_mm",
    "precipitation_72h_mm",
    "precipitation_7d_mm",
    "log_precip_mm",
    "log_precip_48h_mm",
    "tide_level_m",
    "tide_range_m",
    "water_temp_c",
    "air_temp_c",
    "wind_speed_ms",
    "wave_height_m",
    "wave_period_s",
    "month",
    "day_of_year",
    "season_sin",
    "season_cos",
]

# Legacy feature order for heuristic model
LEGACY_FEATURE_ORDER = [
    "rainfall_24h",
    "wave_height",
    "tide_level",
    "temperature",
    "wind_speed",
    "wave_period",
    "precipitation_48h",
]

# Mapping from aggregator keys → trained model keys
_PREDICTOR_MAP = {
    "rainfall_24h": "precipitation_mm",
    "precipitation_48h": "precipitation_48h_mm",
    "tide_level": "tide_level_m",
    "temperature": "water_temp_c",
    "wind_speed": "wind_speed_ms",
    "wave_height": "wave_height_m",
    "wave_period": "wave_period_s",
}


def load_model_meta(model_path: str) -> Optional[dict]:
    meta_path = model_path.replace(".pkl", "_meta.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            return json.load(f)
    return None


def prepare_prediction_input(
    predictors: Dict[str, float],
    use_trained: bool = False,
    model_path: str = "models/default_model.pkl",
    prediction_date: Optional[datetime] = None,
) -> np.ndarray:
    """
    Convert predictor dictionary to numpy array for model input.

    When use_trained=True, maps aggregator keys to the trained model's
    feature order.  The model's actual feature list is read from its
    _meta.json so the array always matches.
    """
    if use_trained:
        # Determine which features this specific model expects
        meta = load_model_meta(model_path)
        feature_list = meta["features"] if meta else TRAINED_FEATURE_ORDER

        mapped: Dict[str, float] = {}

        # Map aggregator keys
        for old_key, new_key in _PREDICTOR_MAP.items():
            mapped[new_key] = predictors.get(old_key, 0.0)

        # Antecedent FIB
        ant_fib = predictors.get("antecedent_fib", 10.0)
        mapped["antecedent_fib_log10"] = float(np.log10(max(ant_fib, 1.0)))

        # Days since last sample
        mapped["days_since_last_sample"] = predictors.get("days_since_last_sample", 7.0)

        # Air temp: prefer separate air_temperature, fall back to water temp
        mapped["air_temp_c"] = predictors.get(
            "air_temperature", predictors.get("temperature", 18.0)
        )

        # Tide range: default small range if not provided
        mapped["tide_range_m"] = predictors.get("tide_range", 1.2)

        # Cumulative rainfall: build from 24h if not explicitly provided
        p24 = mapped.get("precipitation_mm", 0.0)
        p48 = mapped.get("precipitation_48h_mm", 0.0)
        mapped["precipitation_72h_mm"] = predictors.get("precipitation_72h", p48)
        mapped["precipitation_7d_mm"] = predictors.get("precipitation_7d", p48)

        # Log-transformed precipitation
        mapped["log_precip_mm"] = math.log10(p24 + 1)
        mapped["log_precip_48h_mm"] = math.log10(p48 + 1)

        # Temporal features
        now = prediction_date or datetime.now()
        mapped["month"] = now.month
        doy = now.timetuple().tm_yday
        mapped["day_of_year"] = doy
        mapped["season_sin"] = math.sin(2 * math.pi * doy / 365.25)
        mapped["season_cos"] = math.cos(2 * math.pi * doy / 365.25)

        arr = [mapped.get(f, 0.0) for f in feature_list]
        return np.array(arr, dtype=np.float64).reshape(1, -1)

    # Legacy path for heuristic model
    arr = [predictors.get(f, 0.0) for f in LEGACY_FEATURE_ORDER]
    return np.array(arr, dtype=np.float64).reshape(1, -1)


def validate_predictors(predictors: Dict[str, float]) -> tuple[bool, Optional[str]]:
    ranges = {
        "rainfall_24h": (0, 200),
        "wave_height": (0, 15),
        "tide_level": (-5, 5),
        "temperature": (-5, 45),
        "wind_speed": (0, 80),
    }
    for key, (mn, mx) in ranges.items():
        if key in predictors:
            if predictors[key] < mn or predictors[key] > mx:
                return False, f"{key} value {predictors[key]} outside [{mn}, {mx}]"
    return True, None
