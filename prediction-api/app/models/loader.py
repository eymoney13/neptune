"""Model loading utilities"""
import pickle
import os
from pathlib import Path
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Cache loaded models in memory
_loaded_models: Dict[str, Any] = {}


def load_model(model_path: str, model_key: str = "default") -> Optional[Any]:
    """
    Load a trained model from disk.
    
    Args:
        model_path: Path to the .pkl model file
        model_key: Key to cache the model in memory
    
    Returns:
        Loaded model object or None if loading fails
    """
    # Check cache first
    if model_key in _loaded_models:
        logger.info(f"Using cached model: {model_key}")
        return _loaded_models[model_key]
    
    # Check if file exists
    if not os.path.exists(model_path):
        logger.warning(f"Model file not found: {model_path}")
        return None
    
    try:
        with open(model_path, 'rb') as f:
            model = pickle.load(f)
        
        # Cache the model
        _loaded_models[model_key] = model
        logger.info(f"Successfully loaded model: {model_path}")
        return model
    except Exception as e:
        logger.error(f"Error loading model {model_path}: {str(e)}")
        return None


def get_model_for_station(station_code: str, models_dir: str = "models") -> Optional[Any]:
    """
    Get the appropriate model for a station.
    
    Args:
        station_code: Station identifier
        models_dir: Directory containing model files
    
    Returns:
        Model object or None
    """
    # Try station-specific model first
    station_model_path = os.path.join(models_dir, f"station_{station_code}.pkl")
    if os.path.exists(station_model_path):
        return load_model(station_model_path, f"station_{station_code}")
    
    # Fall back to default/general model
    default_model_path = os.path.join(models_dir, "default_model.pkl")
    return load_model(default_model_path, "default")


def clear_model_cache():
    """Clear the model cache (useful for hot-reloading)"""
    global _loaded_models
    _loaded_models = {}


# Mock model class for development/testing
class MockModel:
    """Mock model for testing when no trained model is available"""
    
    def predict(self, X):
        """Generate mock predictions based on input features"""
        import numpy as np
        # Simple heuristic: higher rainfall and wave height = higher bacterial count
        base_prediction = 50.0
        if X.shape[1] >= 2:
            rainfall_effect = X[0, 0] * 100 if X[0, 0] > 0 else 0
            wave_effect = X[0, 1] * 30 if X[0, 1] > 1.0 else 0
            prediction = base_prediction + rainfall_effect + wave_effect
        else:
            prediction = base_prediction
        
        # Add some randomness to simulate confidence intervals
        return np.array([[max(10.0, min(500.0, prediction))]])


def get_mock_model() -> MockModel:
    """Get a mock model for development"""
    return MockModel()
