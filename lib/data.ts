import { WaterQualityRecord, Station, StationSummary } from './types';

let cachedData: WaterQualityRecord[] | null = null;
let cachedStations: StationSummary[] | null = null;

export async function loadCSVData(): Promise<WaterQualityRecord[]> {
  if (cachedData) {
    return cachedData;
  }

  try {
    // Always use API endpoint (works in both client and server)
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_API_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
    
    console.log(`Fetching water quality data from: ${baseUrl}/api/water-quality`);
    
    // Create abort controller for timeout (Vercel has 60s limit for Pro, 10s for Hobby)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 seconds to be safe
    
    // Use smaller limit to avoid Vercel timeout and improve performance
    // Start with 5k records for faster initial load
    const limit = 5000;
    
    const response = await fetch(`${baseUrl}/api/water-quality?years=10&limit=${limit}`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.details || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const json = await response.json();
    
    if (json.error) {
      throw new Error(json.error);
    }

    const records = (json.data || []) as WaterQualityRecord[];
    console.log(`Loaded ${records.length} records from API`);
    cachedData = records;
    return records;
  } catch (error) {
    console.error('Error loading water quality data:', error);
    throw error;
  }
}

export function parseNumeric(value: string | undefined): number {
  if (!value || value === 'NR' || value === '') return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

export function groupByStation(records: WaterQualityRecord[]): Map<string, Station> {
  const stationsMap = new Map<string, Station>();

  records.forEach(record => {
    const key = record.StationCode || record.StationName;
    if (!key) return;

    if (!stationsMap.has(key)) {
      stationsMap.set(key, {
        name: record.StationName,
        code: record.StationCode,
        latitude: parseNumeric(record.TargetLatitude),
        longitude: parseNumeric(record.TargetLongitude),
        records: [],
      });
    }

    const station = stationsMap.get(key)!;
    station.records.push(record);
  });

  return stationsMap;
}

export function createStationSummaries(records: WaterQualityRecord[]): StationSummary[] {
  const stationsMap = groupByStation(records);
  const summaries: StationSummary[] = [];
  
  // Calculate date one year ago
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  stationsMap.forEach((station, key) => {
    const validRecords = station.records
      .filter(r => r.Result && r.Result !== 'NR')
      .sort((a, b) => new Date(b.SampleDate).getTime() - new Date(a.SampleDate).getTime());

    if (validRecords.length === 0) return;

    const latest = validRecords[0];
    const latestDate = new Date(latest.SampleDate);
    
    // Filter out stations with no test results in the past year
    if (latestDate < oneYearAgo) return;

    const latestResult = parseNumeric(latest.Result);
    
    // Get average of 30-day geometric means
    const geoMeans30 = validRecords
      .map(r => parseNumeric(r['30DayGeoMean']))
      .filter(v => v > 0);
    const avg30Day = geoMeans30.length > 0
      ? geoMeans30.reduce((a, b) => a + b, 0) / geoMeans30.length
      : 0;

    // Get average of 6-week geometric means
    const geoMeans6Week = validRecords
      .map(r => parseNumeric(r['6WeekGeoMean']))
      .filter(v => v > 0);
    const avg6Week = geoMeans6Week.length > 0
      ? geoMeans6Week.reduce((a, b) => a + b, 0) / geoMeans6Week.length
      : 0;

    summaries.push({
      name: station.name,
      code: station.code,
      latitude: station.latitude,
      longitude: station.longitude,
      latestResult,
      latestDate: latest.SampleDate,
      avg30Day,
      avg6Week,
      recordCount: validRecords.length,
    });
  });

  return summaries.sort((a, b) => b.recordCount - a.recordCount);
}

export function getStationRecords(
  records: WaterQualityRecord[],
  stationCode: string
): WaterQualityRecord[] {
  return records
    .filter(r => (r.StationCode === stationCode || r.StationName === stationCode))
    .filter(r => r.Result && r.Result !== 'NR')
    .sort((a, b) => new Date(a.SampleDate).getTime() - new Date(b.SampleDate).getTime());
}

export function getWaterQualityColor(result: number): string {
  // Color coding based on fecal coliform levels (CFU/100mL)
  // Safe: <70 (green), Poor: 70-104 (yellow), Unsafe: >104 (red)
  if (result < 70) return '#10b981'; // green - low risk
  if (result < 104) return '#f59e0b'; // yellow - poor water quality
  return '#ef4444'; // red - unsafe, not recommended to swim
}

export async function getCachedStationSummaries(): Promise<StationSummary[]> {
  if (cachedStations) {
    return cachedStations;
  }

  const records = await loadCSVData();
  cachedStations = createStationSummaries(records);
  return cachedStations;
}
