# Predictive Model Integration - Complete! 🎉

The predictive water quality model has been successfully integrated into the dashboard.

## What's Been Built

### 1. Python FastAPI Backend (`prediction-api/`)
- ✅ FastAPI server with prediction endpoints
- ✅ Model loading utilities (supports .pkl files)
- ✅ Mock model for development/testing
- ✅ Environmental data collectors (NOAA, CDIP, CIMIS)
- ✅ Data preprocessing pipeline
- ✅ CORS enabled for Next.js integration

### 2. Next.js API Routes (`app/api/`)
- ✅ `/api/predict` - Proxies prediction requests to Python API
- ✅ `/api/env-data` - Fetches environmental data

### 3. New UI Components
- ✅ `PredictionCard` - Shows predicted water quality with risk levels
- ✅ `ForecastChart` - Historical vs predicted comparison chart
- ✅ `EnvDataDisplay` - Environmental conditions display

### 4. Dashboard Integration
- ✅ Predictions toggle switch
- ✅ Automatic prediction loading when station selected
- ✅ Integrated with existing map and charts
- ✅ Loading states and error handling

## How to Use

### Starting the Python API

1. Navigate to the API directory:
```bash
cd prediction-api
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Start the API server:
```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

### Starting the Next.js Dashboard

1. In the project root:
```bash
npm install
npm run dev
```

2. The dashboard will be available at `http://localhost:3000`

3. Make sure the Python API is running on port 8000, or update `PYTHON_API_URL` in `.env.local`

## Features

### Current Functionality
- **Mock Predictions**: Uses a simple heuristic model (rainfall + wave height effects)
- **Environmental Data**: Fetches real-time data from NOAA APIs (tides, temperature)
- **Prediction Display**: Shows predicted CFU values, confidence intervals, and risk levels
- **Historical Comparison**: Overlays predictions on historical data charts
- **Risk Indicators**: Color-coded risk levels (safe/caution/unsafe)

### Next Steps for Production

1. **Train Real Models**:
   - Use scripts from `wq-models-high-frequency-data` repository
   - Train models for each station or general model
   - Save as `.pkl` files in `prediction-api/models/`
   - Set `use_mock_model: false` in API calls

2. **Complete Environmental Data Integration**:
   - Add CDIP API credentials for wave data
   - Add CIMIS API credentials for weather data
   - Update collectors to use real API endpoints

3. **Deploy Python API**:
   - Deploy to Railway, Render, or Fly.io
   - Update `PYTHON_API_URL` environment variable
   - Consider using Vercel Python runtime (with model size limits)

4. **Model Versioning**:
   - Track model versions and performance
   - A/B test different models
   - Monitor prediction accuracy

## File Structure

```
/
├── prediction-api/           # Python FastAPI backend
│   ├── app/
│   │   ├── main.py          # FastAPI app
│   │   ├── models/          # Model utilities
│   │   ├── data/            # Environmental data collectors
│   │   └── utils/           # Preprocessing
│   ├── models/              # Trained model files (.pkl) go here
│   └── requirements.txt
├── app/
│   ├── api/                 # Next.js API routes
│   │   ├── predict/
│   │   └── env-data/
│   ├── components/          # UI components
│   │   ├── PredictionCard.tsx
│   │   ├── ForecastChart.tsx
│   │   └── EnvDataDisplay.tsx
│   └── page.tsx             # Updated dashboard
└── lib/
    └── types.ts             # Updated with prediction types
```

## API Endpoints

### POST `/api/predict`
```json
{
  "station_code": "0",
  "latitude": 33.6293,
  "longitude": -117.96,
  "use_env_data": true,
  "use_mock_model": true
}
```

### GET `/api/env-data?station_code=0&latitude=33.6293&longitude=-117.96`

## Testing

1. Start both servers (Python API + Next.js)
2. Open the dashboard in browser
3. Select a station from the map or list
4. Toggle "Show Predictions" to see prediction card
5. View forecast chart with historical + predicted data
6. Check environmental conditions display

## Troubleshooting

**Predictions not loading?**
- Check Python API is running on port 8000
- Check browser console for errors
- Verify `PYTHON_API_URL` environment variable

**Environmental data showing errors?**
- NOAA API may be rate-limited
- Some stations may not have NOAA station IDs
- Mock/estimated values will be used as fallback

**Models not found?**
- The API uses mock models by default
- Place trained `.pkl` files in `prediction-api/models/`
- Set `use_mock_model: false` to use real models

## Resources

- **Model Repository**: https://github.com/rtsearcy/wq-models-high-frequency-data
- **NOAA CO-OPS API**: https://api.tidesandcurrents.noaa.gov/api/prod/
- **FastAPI Docs**: http://localhost:8000/docs (when API is running)
