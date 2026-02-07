import { WaterQualityRecord, Station, StationSummary } from './types';

let cachedData: WaterQualityRecord[] | null = null;
let cachedStations: StationSummary[] | null = null;

export async function loadCSVData(
  onProgress?: (loaded: number, total: number | null) => void
): Promise<WaterQualityRecord[]> {
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
    
    // Fetch records incrementally in batches to avoid timeout
    const batchSize = 1000; // Fetch 1000 stations at a time
    const allRecords: WaterQualityRecord[] = [];
    let offset = 0;
    let totalStations: number | null = null;
    let hasMore = true;
    let isFirstRequest = true;
    
    while (hasMore) {
      // First request gets longer timeout (needs to fetch all records and build cache)
      // Subsequent requests are fast (use cache) so shorter timeout is fine
      const timeout = isFirstRequest ? 600000 : 60000; // 10 min for first, 1 min for rest
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(
          `${baseUrl}/api/water-quality?limit=${batchSize}&offset=${offset}`, 
          {
            headers: {
              'Accept': 'application/json',
            },
            signal: controller.signal,
          }
        );
        
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
        allRecords.push(...records);
        
        // Update total count from meta if available
        if (json.meta?.total_unique_stations) {
          totalStations = json.meta.total_unique_stations;
        }
        
        // Check if there are more records
        hasMore = json.meta?.has_more === true && records.length === batchSize;
        
        offset += records.length;
        
        // Report progress
        if (onProgress) {
          onProgress(allRecords.length, totalStations);
        }
        
        console.log(`Loaded ${allRecords.length} records so far${totalStations ? ` of ${totalStations}` : ''}...`);
        
        // If we got fewer records than requested, we're done
        if (records.length < batchSize) {
          hasMore = false;
        }
        
        // After first request, cache should be built so subsequent requests are fast
        isFirstRequest = false;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          // If we have some data, return what we have
          if (allRecords.length > 0) {
            console.warn(`Batch fetch timed out, returning ${allRecords.length} records loaded so far`);
            break;
          }
          throw new Error(`API request timed out after ${isFirstRequest ? '10 minutes' : '1 minute'}. The data portal might be slow or unreachable.`);
        }
        throw error;
      }
    }
    
    console.log(`Loaded ${allRecords.length} total records from API`);
    cachedData = allRecords;
    return allRecords;
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

export async function getCachedStationSummaries(
  onProgress?: (loaded: number, total: number | null) => void,
  onBatchLoaded?: (summaries: StationSummary[]) => void
): Promise<StationSummary[]> {
  if (cachedStations) {
    return cachedStations;
  }

  // For incremental display, fetch records in batches from the API
  // First batch will be slow (builds cache), subsequent batches will be fast (use cache)
  if (onBatchLoaded) {
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_API_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
    
    console.log(`Fetching water quality data from: ${baseUrl}/api/water-quality`);
    const batchSize = 500; // Fetch 500 stations at a time from API
    const allSummaries: StationSummary[] = [];
    let offset = 0;
    let totalStations: number | null = null;
    let hasMore = true;
    let isFirstRequest = true;
    
    while (hasMore) {
      // First request gets longer timeout (needs to fetch all records and build cache)
      // Subsequent requests are fast (use cache) so shorter timeout is fine
      const timeout = isFirstRequest ? 600000 : 60000; // 10 min for first, 1 min for rest
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        if (isFirstRequest && onProgress) {
          onProgress(0, null);
        }
        
        const response = await fetch(
          `${baseUrl}/api/water-quality?limit=${batchSize}&offset=${offset}`, 
          {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
        
        const json = await response.json();
        if (json.error) throw new Error(json.error);
        
        const records = (json.data || []) as WaterQualityRecord[];
        
        // Update total count from meta if available
        if (json.meta?.total_unique_stations) {
          totalStations = json.meta.total_unique_stations;
        }
        
        // Accumulate records for cachedData (so loadCSVData can use them later)
        if (!cachedData) {
          cachedData = [];
        }
        cachedData.push(...records);
        
        // Process this batch into summaries
        const batchSummaries = createStationSummaries(records);
        allSummaries.push(...batchSummaries);
        
        console.log(`Loaded ${allSummaries.length} stations so far${totalStations ? ` of ${totalStations}` : ''}...`);
        // Update UI with this batch
        onBatchLoaded(batchSummaries);
        
        if (onProgress) {
          onProgress(allSummaries.length, totalStations);
        }
        
        // Check if there are more records
        hasMore = json.meta?.has_more === true && records.length === batchSize;
        offset += records.length;
        isFirstRequest = false; // After first request, cache should be built
        
        // If we got fewer records than requested, we're done
        if (records.length < batchSize) {
          hasMore = false;
        }
        
        // Small delay to allow UI to update
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          // If we have some data, return what we have
          if (allSummaries.length > 0) {
            console.warn(`Batch fetch timed out, returning ${allSummaries.length} stations loaded so far`);
            break;
          }
          throw new Error(`Request timed out after loading ${allSummaries.length} stations. The dataset is large and may take a few minutes to load. Please try again.`);
        }
        throw error;
      }
    }
    
    console.log(`Loaded ${allSummaries.length} total stations from API`);
    cachedStations = allSummaries;
    return allSummaries;
  } else {
    // Fallback to original method
    const records = await loadCSVData(onProgress);
    cachedStations = createStationSummaries(records);
    return cachedStations;
  }
}
