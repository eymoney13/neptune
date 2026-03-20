import { NextRequest, NextResponse } from 'next/server';
import { PredictionRequest, PredictionResult } from '@/lib/types';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// Log API URL in production for debugging (without exposing sensitive info)
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  console.log('Python API URL configured:', PYTHON_API_URL ? 'Yes' : 'No (using default localhost)');
}

// Mark route as dynamic since it handles POST requests with dynamic data
export const dynamic = 'force-dynamic';

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${PYTHON_API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_code: body.station_code,
          latitude: body.latitude,
          longitude: body.longitude,
          use_env_data: body.use_env_data ?? true,
          use_mock_model: body.use_mock_model ?? true,
          predictors: body.predictors,
          antecedent_fib: body.antecedent_fib,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        console.error(`Python API error (${response.status}):`, error);
        return NextResponse.json(
          { error: `Python API error: ${error}` },
          { status: response.status }
        );
      }

      const result: PredictionResult = await response.json();
      return NextResponse.json(result);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Prediction API timeout');
        return NextResponse.json(
          {
            error: 'Request timed out',
            details: 'The Python API did not respond within 30 seconds',
          },
          { status: 504 }
        );
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Prediction API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                              errorMessage.includes('fetch failed') ||
                              errorMessage.includes('Failed to fetch');
    
    return NextResponse.json(
      { 
        error: isConnectionError 
          ? 'Cannot connect to Python API. Make sure PYTHON_API_URL is set correctly.'
          : 'Failed to get prediction',
        details: errorMessage,
        suggestion: isConnectionError
          ? 'For localhost: Ensure Python API is running on port 8000. For production: Set PYTHON_API_URL environment variable in Vercel.'
          : undefined
      },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
