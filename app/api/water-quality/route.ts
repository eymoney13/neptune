import { NextRequest, NextResponse } from "next/server";

const RESOURCE_2020_PRESENT = "15a63495-8d9f-4a49-b43a-3092ef3106b9";
const RESOURCE_2010_2020 = "04d98c22-5523-4cc1-86e7-3a6abf40bb60";

// CKAN base differs across portals. Try both common forms.
const CKAN_BASES = [
  "https://data.ca.gov/api/3/action",
  "https://data.ca.gov/api/action",
];

// Mark route as dynamic
export const dynamic = 'force-dynamic';

async function ckanFetchJson(url: string) {
  const res = await fetch(url, {
    headers: { "accept": "application/json" },
    // cache at the edge a bit for demos
    next: { revalidate: 60 * 15 }, // 15 minutes
  });
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status}`);
  return res.json();
}

async function callCkanAction(actionPath: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();

  let lastErr: unknown;
  for (const base of CKAN_BASES) {
    try {
      const url = `${base}/${actionPath}?${qs}`;
      const json = await ckanFetchJson(url);
      if (json?.success) return json;
      lastErr = new Error(`CKAN success=false at ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("CKAN request failed");
}

// Get field names fast, without guessing columns.
async function getFields(resourceId: string): Promise<string[]> {
  const json = await callCkanAction("datastore_search", {
    resource_id: resourceId,
    limit: "1",
  });
  const fields = json?.result?.fields?.map((f: any) => f.id).filter(Boolean);
  if (!fields?.length) throw new Error("No fields returned. Resource may not be in DataStore.");
  return fields;
}

// Fetch all records from a resource with pagination
async function fetchAllRecords(resourceId: string, limit = 10000) {
  const chunk = 2000; // Smaller chunks for faster response
  const out: any[] = [];
  const maxChunks = Math.ceil(limit / chunk);

  for (let i = 0; i < maxChunks; i++) {
    const offset = i * chunk;
    
    try {
      const json = await callCkanAction("datastore_search", {
        resource_id: resourceId,
        limit: chunk.toString(),
        offset: offset.toString(),
      });
      
      const rows = json?.result?.records ?? [];
      out.push(...rows);
      
      if (rows.length < chunk) break;
      
      // Safety check - don't exceed limit
      if (out.length >= limit) {
        return out.slice(0, limit);
      }
    } catch (error) {
      console.error(`Error fetching chunk ${i + 1}:`, error);
      // Continue with what we have if there's an error
      if (out.length > 0) break;
      throw error;
    }
  }

  return out;
}

// Map CKAN field names to our expected format
function mapCkanRecordToWaterQuality(record: any, fields: string[]): any {
  // Common field name mappings
  const fieldMap: Record<string, string> = {
    'station_name': 'StationName',
    'site_name': 'StationName',
    'location_name': 'StationName',
    'station_code': 'StationCode',
    'site_code': 'StationCode',
    'sample_date': 'SampleDate',
    'date': 'SampleDate',
    'collection_time': 'CollectionTime',
    'time': 'CollectionTime',
    'target_latitude': 'TargetLatitude',
    'latitude': 'TargetLatitude',
    'lat': 'TargetLatitude',
    'target_longitude': 'TargetLongitude',
    'longitude': 'TargetLongitude',
    'lng': 'TargetLongitude',
    'lon': 'TargetLongitude',
    'result': 'Result',
    'fecal_coliform': 'Result',
    '30day_geomean': '30DayGeoMean',
    '30_day_geomean': '30DayGeoMean',
    '6week_geomean': '6WeekGeoMean',
    '6_week_geomean': '6WeekGeoMean',
  };

  const mapped: any = {
    Program: record.program || record.Program || '',
    ParentProject: record.parent_project || record.ParentProject || '',
    Project: record.project || record.Project || '',
    StationName: '',
    StationCode: '',
    SampleDate: '',
    CollectionTime: record.collection_time || record.CollectionTime || '',
    LocationCode: record.location_code || record.LocationCode || '',
    TargetLatitude: '',
    TargetLongitude: '',
    Analyte: record.analyte || record.Analyte || '',
    Unit: record.unit || record.Unit || '',
    Result: '',
    '30DayGeoMean': '',
    '30DayCount': record['30day_count'] || record['30DayCount'] || '',
    '6WeekGeoMean': '',
    '6WeekCount': record['6week_count'] || record['6WeekCount'] || '',
    ResultQualCode: record.result_qual_code || record.ResultQualCode,
  };

  // Map fields using case-insensitive matching
  const lowerFields = fields.map(f => f.toLowerCase());
  
  for (const [ckanField, ourField] of Object.entries(fieldMap)) {
    const fieldIndex = lowerFields.findIndex(f => f === ckanField.toLowerCase());
    if (fieldIndex !== -1) {
      const actualField = fields[fieldIndex];
      mapped[ourField] = record[actualField]?.toString() || '';
    }
  }

  // Also try direct field name matches (case-insensitive)
  for (const field of fields) {
    const lowerField = field.toLowerCase();
    if (lowerField === 'stationname' || lowerField === 'station_name' || lowerField === 'site_name') {
      mapped.StationName = record[field]?.toString() || mapped.StationName;
    }
    if (lowerField === 'stationcode' || lowerField === 'station_code' || lowerField === 'site_code') {
      mapped.StationCode = record[field]?.toString() || mapped.StationCode;
    }
    if (lowerField === 'sampledate' || lowerField === 'sample_date' || lowerField === 'date') {
      mapped.SampleDate = record[field]?.toString() || mapped.SampleDate;
    }
    if (lowerField === 'targetlatitude' || lowerField === 'target_latitude' || lowerField === 'latitude' || lowerField === 'lat') {
      mapped.TargetLatitude = record[field]?.toString() || mapped.TargetLatitude;
    }
    if (lowerField === 'targetlongitude' || lowerField === 'target_longitude' || lowerField === 'longitude' || lowerField === 'lng' || lowerField === 'lon') {
      mapped.TargetLongitude = record[field]?.toString() || mapped.TargetLongitude;
    }
    if (lowerField === 'result' || lowerField === 'fecal_coliform') {
      mapped.Result = record[field]?.toString() || mapped.Result;
    }
    if (lowerField === '30daygeomean' || lowerField === '30_day_geomean' || lowerField === '30day_geomean') {
      mapped['30DayGeoMean'] = record[field]?.toString() || mapped['30DayGeoMean'];
    }
    if (lowerField === '6weekgeomean' || lowerField === '6_week_geomean' || lowerField === '6week_geomean') {
      mapped['6WeekGeoMean'] = record[field]?.toString() || mapped['6WeekGeoMean'];
    }
  }

  return mapped;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const years = Math.min(Math.max(Number(url.searchParams.get("years") ?? "5"), 1), 20);
    // Reduce limit significantly to avoid Vercel timeout and improve performance
    // Start with 5k records - focus on recent data
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "5000"), 10000);
    
    console.log(`Water quality API: Fetching ${limit} records for ${years} years`);

    // Only fetch from 2020-present for speed (most recent data)
    // Skip 2010-2020 to avoid timeout
    const fields2020 = await getFields(RESOURCE_2020_PRESENT);
    
    // Fetch records from 2020-present only
    console.log(`Fetching up to ${limit} records from 2020-present dataset...`);
    const r2020 = await fetchAllRecords(RESOURCE_2020_PRESENT, limit);
    const r2010: any[] = []; // Skip older data for now to improve performance

    console.log(`Fetched ${r2020.length} records, mapping to format...`);
    
    // Map records to our format
    const mapped2020 = r2020.map(record => mapCkanRecordToWaterQuality(record, fields2020));
    const mapped2010: any[] = [];

    const combined = [...mapped2020, ...mapped2010];

    // Filter out invalid records (missing required fields)
    const validRecords = combined.filter(record => 
      record.TargetLatitude && 
      record.TargetLongitude && 
      record.Result &&
      record.TargetLatitude !== 'NR' &&
      record.TargetLongitude !== 'NR' &&
      !isNaN(parseFloat(record.TargetLatitude)) &&
      !isNaN(parseFloat(record.TargetLongitude)) &&
      parseFloat(record.TargetLatitude) !== 0 &&
      parseFloat(record.TargetLongitude) !== 0
    );

    // Cache headers for demo smoothness
    return NextResponse.json(
      {
        meta: {
          years_requested: years,
          resource_ids: { "2020_present": RESOURCE_2020_PRESENT, "2010_2020": RESOURCE_2010_2020 },
          total_records: combined.length,
          valid_records: validRecords.length,
        },
        data: validRecords,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=900, stale-while-revalidate=86400", // 15 min edge cache
        },
      }
    );
  } catch (error) {
    console.error('Water quality API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('timeout');
    
    return NextResponse.json(
      { 
        error: isTimeout 
          ? 'Request timed out. The dataset is large and may exceed Vercel function limits. Try reducing the limit parameter.'
          : 'Failed to fetch water quality data',
        details: errorMessage,
        suggestion: isTimeout 
          ? 'Try calling with ?limit=10000 for faster response'
          : 'Check Vercel function logs for more details'
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
