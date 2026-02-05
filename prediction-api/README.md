# Water Quality Prediction API

FastAPI backend for water quality predictions using machine learning models.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. (Optional) Place trained model files in `models/` directory:
   - `station_{code}.pkl` for station-specific models
   - `default_model.pkl` for general model

3. Run the API:
```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

### POST /api/predict

Generate a water quality prediction.

**Request:**
```json
{
  "station_code": "0",
  "latitude": 33.6293,
  "longitude": -117.96,
  "use_env_data": true,
  "use_mock_model": true
}
```

**Response:**
```json
{
  "success": true,
  "station_code": "0",
  "prediction": {
    "fecal_coliform_cfu": 185.3,
    "confidence_interval": [120.5, 250.1],
    "risk_level": "safe",
    "prediction_date": "2024-01-16T12:00:00Z"
  },
  "model_info": {
    "model_type": "mock"
  }
}
```

### GET /api/env-data/{station_code}

Get current environmental data for a station.

**Query Parameters:**
- `latitude`: Station latitude
- `longitude`: Station longitude
- `station_id`: Optional NOAA station ID

## Development

The API uses a mock model by default when no trained models are available. To use real models:

1. Train models using scripts from `wq-models-high-frequency-data` repository
2. Save model files (.pkl) in the `models/` directory
3. Set `use_mock_model: false` in API requests

## Environmental Data Sources

- **NOAA CO-OPS**: Tide levels, water temperature
- **CDIP**: Wave height, wave period (currently using estimates)
- **CIMIS**: Rainfall, air temperature, wind (currently using estimates)

For production, API keys and proper integrations should be configured.
