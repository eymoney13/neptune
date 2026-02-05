import { NextRequest, NextResponse } from 'next/server';
import { PredictionRequest, PredictionResult } from '@/lib/types';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body: PredictionRequest = await request.json();

    // Validate required fields
    if (!body.station_code || body.latitude === undefined || body.longitude === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: station_code, latitude, longitude' },
        { status: 400 }
      );
    }

    // Call Python API
    const response = await fetch(`${PYTHON_API_URL}/api/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        station_code: body.station_code,
        latitude: body.latitude,
        longitude: body.longitude,
        use_env_data: body.use_env_data ?? true,
        use_mock_model: body.use_mock_model ?? true,
        predictors: body.predictors,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Python API error: ${error}` },
        { status: response.status }
      );
    }

    const result: PredictionResult = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Prediction API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get prediction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
