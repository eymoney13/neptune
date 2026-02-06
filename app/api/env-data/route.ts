import { NextRequest, NextResponse } from 'next/server';
import { EnvironmentalData } from '@/lib/types';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// Log API URL in production for debugging (without exposing sensitive info)
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  console.log('Python API URL configured:', PYTHON_API_URL ? 'Yes' : 'No (using default localhost)');
}

// Mark route as dynamic since it uses searchParams
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const stationCode = searchParams.get('station_code');
    const latitude = searchParams.get('latitude');
    const longitude = searchParams.get('longitude');
    const stationId = searchParams.get('station_id');

    if (!stationCode || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Missing required parameters: station_code, latitude, longitude' },
        { status: 400 }
      );
    }

    // Call Python API
    const url = new URL(`${PYTHON_API_URL}/api/env-data/${stationCode}`);
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    if (stationId) {
      url.searchParams.set('station_id', stationId);
    }

    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
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

      const result: EnvironmentalData = await response.json();
      return NextResponse.json(result);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Environmental data API timeout');
        return NextResponse.json(
          { 
            error: 'Request timed out',
            details: 'The Python API did not respond within 30 seconds'
          },
          { status: 504 }
        );
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Environmental data API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                              errorMessage.includes('fetch failed') ||
                              errorMessage.includes('Failed to fetch');
    
    return NextResponse.json(
      { 
        error: isConnectionError 
          ? 'Cannot connect to Python API. Make sure PYTHON_API_URL is set correctly.'
          : 'Failed to get environmental data',
        details: errorMessage,
        suggestion: isConnectionError
          ? 'For localhost: Ensure Python API is running on port 8000. For production: Set PYTHON_API_URL environment variable in Vercel.'
          : undefined
      },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
