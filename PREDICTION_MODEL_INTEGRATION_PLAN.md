# Predictive Water Quality Model Integration Plan

## Overview

Integrate the predictive analysis model from [rtsearcy/wq-models-high-frequency-data](https://github.com/rtsearcy/wq-models-high-frequency-data) into the existing Next.js water quality dashboard. This will add real-time predictions and forecasting capabilities based on environmental data (tides, weather, waves).

## Repository Analysis

The Python repository (`wq-models-high-frequency-data`) contains:

### Key Components:
1. **Data Collection Scripts** (`Collect_Data/`)
   - CDIP (wave data)
   - NOAA CO-OPS (tide and meteorological data)
   - NCDC (meteorological data)
   - CIMIS (California Irrigation Management Information System)

2. **Model Development** (`Model_Development/`)
   - `wq_modeling.py` - Core modeling package with statistical models
   - `HF_model_all.py` - Main script to train models for all stations
   - Model types: Linear regression, random forest, gradient boosting, etc.

3. **Model Testing** (`Model_Testing/`)
   - Validation and performance evaluation scripts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Map View   │  │  Historical  │  │  Prediction  │     │
│  │  with Pred.  │  │   Charts     │  │   Forecast   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                   │            │
│         └──────────────────┼───────────────────┘            │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │
                ┌────────────▼────────────┐
                │   Next.js API Routes    │
                │  /api/predict           │
                │  /api/env-data          │
                └────────────┬────────────┘
                             │
                ┌────────────▼────────────┐
                │   Python API Backend    │
                │   (FastAPI/Flask)       │
                │  - Model Inference      │
                │  - Environmental Data   │
                │  - Prediction Cache     │
                └────────────┬────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
┌─────────▼─────────┐ ┌─────▼──────┐ ┌────────▼────────┐
│  Trained Models   │ │ NOAA APIs  │ │ CDIP/CIMIS APIs │
│  (.pkl files)     │ │ (Tides/    │ │ (Waves/Weather) │
│                   │ │  Weather)  │ │                 │
└───────────────────┘ └────────────┘ └─────────────────┘
```

## Implementation Strategy

### Phase 1: Python API Backend Setup

**Goal**: Create a FastAPI backend that can load trained models and make predictions

#### 1.1 Project Structure
```
/
├── dashboard/              # Existing Next.js app
│   └── ...
├── prediction-api/         # New Python API
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # FastAPI app
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── loader.py   # Model loading utilities
│   │   │   └── predictor.py # Prediction logic
│   │   ├── data/
│   │   │   ├── collectors/
│   │   │   │   ├── noaa.py
│   │   │   │   ├── cdip.py
│   │   │   │   └── cimis.py
│   │   │   └── aggregator.py
│   │   └── utils/
│   │       └── preprocess.py
│   ├── models/             # Trained model files (.pkl)
│   │   └── station_*.pkl
│   ├── requirements.txt
│   └── Dockerfile (optional)
└── model-training/         # Training scripts (reference from repo)
    └── ...
```

#### 1.2 FastAPI Endpoints

```python
# POST /api/predict
{
  "station_code": "0",
  "latitude": 33.6293,
  "longitude": -117.96,
  "predictors": {
    "rainfall_24h": 0.5,
    "wave_height": 1.2,
    "tide_level": 0.8,
    "temperature": 72.0,
    # ... other environmental variables
  }
}

# Response
{
  "station_code": "0",
  "prediction": {
    "fecal_coliform_cfu": 185.3,
    "confidence_interval": [120.5, 250.1],
    "risk_level": "safe",  # safe, caution, unsafe
    "prediction_date": "2024-01-16T12:00:00Z"
  },
  "model_info": {
    "model_type": "random_forest",
    "training_date": "2023-12-01",
    "r2_score": 0.78
  }
}

# GET /api/env-data/{station_code}
# Returns current environmental conditions for a station
```

#### 1.3 Model Integration

- Adapt `wq_modeling.py` functions for inference
- Load pre-trained models (or train using HF_model_all.py scripts)
- Implement preprocessing pipeline matching training data

### Phase 2: Environmental Data Integration

**Goal**: Automatically collect environmental data for predictions

#### 2.1 Data Sources
- **NOAA CO-OPS API**: Tide levels, water temperature
- **CDIP API**: Wave height, wave period
- **CIMIS API**: Rainfall, air temperature, wind
- **Weather APIs**: Precipitation forecasts

#### 2.2 Data Collection Service
- Scheduled jobs to fetch current environmental conditions
- Cache data with TTL (e.g., 1 hour)
- Fallback to historical averages if APIs fail

### Phase 3: Next.js Integration

**Goal**: Add prediction UI components to the dashboard

#### 3.1 New Components

```
app/components/
├── PredictionCard.tsx      # Shows predicted water quality for a station
├── ForecastChart.tsx       # Shows predictions vs historical trends
├── RiskIndicator.tsx       # Visual risk level indicator
├── EnvDataDisplay.tsx      # Shows environmental predictors
└── PredictionMap.tsx       # Map with prediction overlays
```

#### 3.2 API Routes (Next.js)

```typescript
// app/api/predict/route.ts
export async function POST(request: Request) {
  // Proxy to Python API or handle prediction logic
  const response = await fetch('http://python-api/api/predict', {
    method: 'POST',
    body: request.body
  });
  return response;
}

// app/api/env-data/route.ts
// Fetches current environmental data for a station
```

#### 3.3 Updated Dashboard Features

1. **Prediction Toggle**: Switch between historical and predicted views
2. **Forecast Timeline**: Show predictions for next 24-48 hours
3. **Risk Alerts**: Highlight stations with predicted unsafe conditions
4. **Prediction Confidence**: Display confidence intervals
5. **Environmental Factors**: Show what's driving predictions

### Phase 4: Visualization Enhancements

**Goal**: Visualize predictions alongside historical data

#### 4.1 Enhanced Time Series Chart
- Overlay predictions on historical data
- Show confidence bands
- Differentiate observed vs predicted values

#### 4.2 Prediction Map Overlays
- Color-code stations by predicted risk
- Show prediction "heat map"
- Click to see prediction details

#### 4.3 Comparison Views
- Side-by-side: Historical vs Predicted
- Accuracy metrics: How well past predictions matched reality

## Deployment Strategy

### Option A: Vercel Serverless Functions (Python Runtime)

**Pros**: Single deployment, easy routing
**Cons**: Model size limits, cold starts

```json
// vercel.json addition
{
  "functions": {
    "prediction-api/**/*.py": {
      "runtime": "python3.12"
    }
  }
}
```

### Option B: Separate Python API (Recommended)

**Pros**: Better performance, no size limits, easier to scale
**Cons**: Two deployments to manage

**Platforms**:
- **Render**: Free tier, easy Python deployment
- **Fly.io**: Good for ML workloads
- **Railway**: Simple deployment
- **AWS Lambda**: Serverless Python

### Option C: Hybrid Approach

- Static pre-computed predictions (daily updates) → Fast, no API needed
- On-demand predictions → Python API for real-time

## Data Flow

### Prediction Request Flow:
1. User selects station on dashboard
2. Frontend requests environmental data for station location
3. Frontend sends prediction request with environmental predictors
4. Python API loads model for station (or uses general model)
5. Model preprocesses input and generates prediction
6. Response includes prediction, confidence, risk level
7. Frontend displays prediction with visualization

### Training Flow (Periodic):
1. Fetch latest water quality data (CSV)
2. Collect environmental data for matching time periods
3. Run training scripts (adapted from HF_model_all.py)
4. Evaluate model performance
5. Save trained model (.pkl)
6. Deploy updated model to API

## Key Implementation Details

### Model Adaptation

1. **Extract core modeling logic** from `wq_modeling.py`
2. **Simplify for inference**: Remove training code, keep prediction pipeline
3. **Handle missing stations**: Use general model or nearest station model
4. **Model versioning**: Track model versions, allow A/B testing

### Data Preprocessing

- Match preprocessing steps from training (normalization, encoding)
- Handle missing environmental data (imputation or default values)
- Validate input ranges

### Caching Strategy

- Cache predictions by station + timestamp (TTL: 1 hour)
- Cache environmental data (TTL: 30 minutes)
- Cache model files in memory (reload on version update)

## File Structure After Integration

```
/
├── dashboard/                    # Next.js app
│   ├── app/
│   │   ├── api/
│   │   │   ├── predict/
│   │   │   │   └── route.ts
│   │   │   └── env-data/
│   │   │       └── route.ts
│   │   ├── components/
│   │   │   ├── PredictionCard.tsx
│   │   │   ├── ForecastChart.tsx
│   │   │   └── ...
│   │   └── page.tsx             # Updated with predictions
│   └── ...
├── prediction-api/               # Python FastAPI
│   ├── app/
│   │   ├── main.py
│   │   └── ...
│   ├── models/                   # Trained .pkl files
│   ├── requirements.txt
│   └── README.md
├── model-training/               # Python training scripts
│   └── (adapted from rtsearcy repo)
└── docs/
    └── PREDICTION_MODEL_INTEGRATION_PLAN.md
```

## Next Steps

1. **Clone and analyze the model repository**
   - Download key scripts (wq_modeling.py, HF_model_all.py)
   - Understand data format requirements
   - Identify which models to use

2. **Set up Python API structure**
   - Create FastAPI skeleton
   - Set up model loading utilities
   - Create test endpoint

3. **Train initial model**
   - Adapt training scripts to your CSV data
   - Train model for one station as proof of concept
   - Export model file

4. **Build prediction endpoint**
   - Implement model inference
   - Add preprocessing pipeline
   - Test with sample data

5. **Integrate environmental data**
   - Set up NOAA/CDIP/CIMIS API clients
   - Create data aggregation service
   - Test data collection

6. **Build frontend components**
   - Prediction cards and charts
   - API integration
   - UI updates

7. **Deploy and test**
   - Deploy Python API
   - Update Next.js to call API
   - Test end-to-end flow

## Resources

- **Original Paper**: ["A Day at the Beach: Enabling Coastal Water Quality Prediction with High-Frequency Sampling and Data-Driven Models"](https://doi.org/10.1021/acs.est.0c06742)
- **Model Repository**: https://github.com/rtsearcy/wq-models-high-frequency-data
- **NOAA CO-OPS API**: https://api.tidesandcurrents.noaa.gov/api/prod/
- **CDIP API**: http://cdip.ucsd.edu/
- **CIMIS API**: https://cimis.water.ca.gov/

## Success Metrics

- ✅ Predictions displayed for all stations
- ✅ Prediction accuracy > 70% (R² score)
- ✅ API response time < 500ms
- ✅ Environmental data updates hourly
- ✅ User can toggle between historical and predicted views
- ✅ Risk alerts for predicted unsafe conditions
