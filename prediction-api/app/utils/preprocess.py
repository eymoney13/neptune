"""Data preprocessing utilities matching training pipeline"""
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional


def normalize_features(features: Dict[str, float], stats: Optional[Dict[str, Dict[str, float]]] = None) -> Dict[str, float]:
    """
    Normalize features using mean and std from training data.
    
    Args:
        features: Dictionary of feature values
        stats: Optional normalization statistics (mean, std). If None, uses defaults.
    
    Returns:
        Normalized features dictionary
    """
    if stats is None:
        # Default normalization stats (should match training data)
        # Temperature is in Celsius
        stats = {
            'rainfall_24h': {'mean': 0.15, 'std': 0.5},
            'wave_height': {'mean': 1.5, 'std': 0.8},
            'tide_level': {'mean': 0.0, 'std': 1.5},
            'temperature': {'mean': 18.0, 'std': 5.0},  # Celsius: ~65°F = 18°C
            'wind_speed': {'mean': 8.0, 'std': 5.0},
        }
    
    normalized = {}
    for key, value in features.items():
        if key in stats and stats[key]['std'] > 0:
            normalized[key] = (value - stats[key]['mean']) / stats[key]['std']
        else:
            normalized[key] = value
    
    return normalized


def prepare_prediction_input(predictors: Dict[str, float]) -> np.ndarray:
    """
    Convert predictor dictionary to numpy array for model input.
    
    Args:
        predictors: Dictionary of environmental predictors
    
    Returns:
        Numpy array ready for model prediction
    """
    # Define feature order (should match training)
    feature_order = [
        'rainfall_24h',
        'wave_height',
        'tide_level',
        'temperature',
        'wind_speed',
        'wave_period',
        'precipitation_48h',
    ]
    
    # Normalize features
    normalized = normalize_features(predictors)
    
    # Create array in correct order
    feature_array = []
    for feature in feature_order:
        value = normalized.get(feature, 0.0)
        feature_array.append(value)
    
    return np.array(feature_array).reshape(1, -1)


def validate_predictors(predictors: Dict[str, float]) -> tuple[bool, Optional[str]]:
    """
    Validate predictor values are within expected ranges.
    
    Returns:
        (is_valid, error_message)
    """
    ranges = {
        'rainfall_24h': (0, 10),
        'wave_height': (0, 10),
        'tide_level': (-5, 5),
        'temperature': (-5, 35),  # Celsius range (approximately -5°C to 35°C)
        'wind_speed': (0, 50),
    }
    
    for key, (min_val, max_val) in ranges.items():
        if key in predictors:
            if predictors[key] < min_val or predictors[key] > max_val:
                return False, f"{key} value {predictors[key]} outside valid range [{min_val}, {max_val}]"
    
    return True, None
