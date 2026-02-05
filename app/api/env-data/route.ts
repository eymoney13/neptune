import { NextRequest, NextResponse } from 'next/server';
import { EnvironmentalData } from '@/lib/types';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

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

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Python API error: ${error}` },
        { status: response.status }
      );
    }

    const result: EnvironmentalData = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Environmental data API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get environmental data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
