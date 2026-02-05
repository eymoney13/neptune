import { NextRequest, NextResponse } from "next/server";

const RESOURCE_2020_PRESENT = "15a63495-8d9f-4a49-b43a-3092ef3106b9";
const CKAN_BASE = "https://data.ca.gov/api/3/action";

// Mark route as dynamic
export const dynamic = 'force-dynamic';

async function ckan(action: string, params: Record<string, string>) {
  const url = `${CKAN_BASE}/${action}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    // Helps Vercel edge caching for repeat demo loads
    next: { revalidate: 60 * 15 }, // 15 minutes
  });
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status} for ${action}`);
  const json = await res.json();
  if (!json?.success) throw new Error(`CKAN success=false for ${action}`);
  return json;
}

async function getFields(resourceId: string): Promise<string[]> {
  const json = await ckan("datastore_search", { resource_id: resourceId, limit: "1" });
  const fields = (json?.result?.fields ?? []).map((f: any) => f.id).filter(Boolean);
  if (!fields.length) throw new Error("No fields returned. Resource may not be in DataStore.");
  return fields;
}

function pickFirst(fields: string[], candidates: string[]) {
  const lower = new Map(fields.map((f) => [f.toLowerCase(), f]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function requireField(found: string | null, label: string) {
  if (!found) throw new Error(`Could not identify ${label} field in the dataset schema.`);
  return found;
}

// Use regular datastore_search (more reliable than SQL)
async function fetchRecordsFallback(
  resourceId: string,
  latField: string,
  lonField: string,
  locationKeyField: string,
  nameField: string | null,
  dateField: string,
  resultField: string | null,
  max: number
): Promise<any[]> {
  console.log(`Fetching records using datastore_search...`);
  // Fetch in smaller chunks to avoid timeout
  const chunkSize = 1000;
  const chunksNeeded = Math.ceil(max / chunkSize);
  const allRecords: any[] = [];
  
  for (let i = 0; i < chunksNeeded && allRecords.length < max * 2; i++) {
    try {
      const json = await ckan("datastore_search", {
        resource_id: resourceId,
        limit: chunkSize.toString(),
        offset: (i * chunkSize).toString(),
      });
      
      const records = json?.result?.records ?? [];
      if (records.length === 0) break; // No more records
      
      allRecords.push(...records);
      
      // If we got fewer records than requested, we're done
      if (records.length < chunkSize) break;
    } catch (error) {
      console.warn(`Error fetching chunk ${i}:`, error);
      // Continue with what we have
      if (allRecords.length === 0) throw error;
      break;
    }
  }
  
  console.log(`Fetched ${allRecords.length} total records, filtering...`);
  
  // Filter valid records
  const validRecords = allRecords.filter((record: any) => {
    const lat = record[latField];
    const lon = record[lonField];
    
    // Check if values exist and are valid
    if (lat == null || lon == null) return false;
    if (lat === '' || lon === '') return false;
    if (lat === 'NR' || lon === 'NR') return false;
    
    // Try to parse as numbers
    const latNum = parseFloat(String(lat));
    const lonNum = parseFloat(String(lon));
    
    if (isNaN(latNum) || isNaN(lonNum)) return false;
    if (latNum === 0 && lonNum === 0) return false; // Invalid coordinates
    
    // Valid latitude range: -90 to 90
    // Valid longitude range: -180 to 180
    if (latNum < -90 || latNum > 90) return false;
    if (lonNum < -180 || lonNum > 180) return false;
    
    return true;
  });
  
  console.log(`Found ${validRecords.length} valid records with coordinates (from ${allRecords.length} total)`);
  
  // Debug: Show sample of invalid records if we have no valid ones
  if (validRecords.length === 0 && allRecords.length > 0) {
    const sample = allRecords[0];
    console.log(`Sample record fields:`, Object.keys(sample).slice(0, 10));
    console.log(`Sample lat/lon values:`, {
      latField,
      lonField,
      lat: sample[latField],
      lon: sample[lonField],
      latType: typeof sample[latField],
      lonType: typeof sample[lonField]
    });
  }
  
  // Deduplicate by location key, keeping latest by date
  const seen = new Map<string, any>();
  let skippedCount = 0;
  
  for (const record of validRecords) {
    // Try multiple field name variations (case-insensitive)
    let key = record[locationKeyField] || 
              record[nameField || ''] || 
              record['StationCode'] || 
              record['station_code'] ||
              record['Station_Name'] ||
              record['station_name'] ||
              '';
    
    key = String(key).trim();
    
    // If still no key, try using lat/lon as composite key
    if (!key || key === 'undefined' || key === 'null' || key === '') {
      const lat = String(record[latField] || '').substring(0, 8);
      const lon = String(record[lonField] || '').substring(0, 8);
      key = `${lat},${lon}`;
      if (key === ',' || key === 'undefined,undefined') {
        skippedCount++;
        continue;
      }
    }
    
    const existing = seen.get(key);
    const recordDate = record[dateField];
    if (!existing) {
      seen.set(key, record);
    } else if (recordDate) {
      const existingDate = existing[dateField];
      if (!existingDate || String(recordDate) > String(existingDate)) {
        seen.set(key, record);
      }
    }
  }
  
  const uniqueRecords = Array.from(seen.values()).slice(0, max);
  console.log(`Deduplicated to ${uniqueRecords.length} unique stations (skipped ${skippedCount} records without valid key)`);
  
  // Debug: Show sample record if we have issues
  if (uniqueRecords.length === 0 && validRecords.length > 0) {
    const sample = validRecords[0];
    console.log(`Sample record keys:`, {
      locationKeyField,
      nameField,
      hasLocationKey: !!sample[locationKeyField],
      hasNameField: nameField ? !!sample[nameField] : 'N/A',
      hasStationCode: !!sample['StationCode'],
      hasStationCodeLower: !!sample['station_code'],
      allKeys: Object.keys(sample).slice(0, 15)
    });
  }
  
  return uniqueRecords;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Start with smaller limit to avoid timeouts
    const max = Math.min(Math.max(Number(url.searchParams.get("max") ?? "2000"), 100), 5000);

    console.log(`Water quality API: Fetching up to ${max} unique stations...`);

    // 1) Discover schema so we do not guess column names
    let fields: string[];
    try {
      fields = await getFields(RESOURCE_2020_PRESENT);
      console.log(`Found ${fields.length} fields in dataset`);
    } catch (error) {
      console.error('Failed to get fields:', error);
      throw new Error(`Failed to connect to CKAN API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 2) Identify lat/lon fields (common names - check both lowercase and capitalized)
    const latField = pickFirst(fields, [
      "TargetLatitude", "target_latitude", "targetlatitude",
      "Latitude", "latitude", "lat", 
      "dec_lat", "decimal_latitude", "station_latitude", "sample_latitude"
    ]);
    const lonField = pickFirst(fields, [
      "TargetLongitude", "target_longitude", "targetlongitude",
      "Longitude", "longitude", "lon", "lng", 
      "dec_lon", "decimal_longitude", "station_longitude", "sample_longitude"
    ]);

    if (!latField || !lonField) {
      throw new Error(`Could not identify latitude/longitude fields. Available fields: ${fields.slice(0, 10).join(', ')}...`);
    }

    // 3) Identify a stable "location key" (station/site id if present, else station name)
    const idField =
      pickFirst(fields, ["station_code", "station_id", "site_id", "location_id", "monitoring_location_id", "beach_id", "id", "site_code"]) ?? null;

    const nameField =
      pickFirst(fields, ["station_name", "site_name", "location_name", "beach_name", "monitoring_location_name", "name"]) ??
      null;

    const locationKeyField = idField || nameField || 'station_code';
    if (!locationKeyField) {
      throw new Error('Could not identify location key field');
    }

    // 4) Identify date/time field so we can pick latest record
    const dateField = pickFirst(fields, ["sample_date", "sample_datetime", "collection_date", "collection_datetime", "date", "timestamp"]) || 'sample_date';

    // Identify result field for water quality data
    const resultField = pickFirst(fields, ["result", "fecal_coliform", "value", "measurement", "cfu"]);

    console.log(`Identified fields: lat=${latField}, lon=${lonField}, key=${locationKeyField}, date=${dateField}`);

    // Use simpler fallback method directly (more reliable than SQL)
    const records = await fetchRecordsFallback(
      RESOURCE_2020_PRESENT,
      latField,
      lonField,
      locationKeyField,
      nameField,
      dateField,
      resultField,
      max
    );
    console.log(`Found ${records.length} unique stations`);

    // Map to our expected format
    const mappedRecords = records.map((record: any) => {
      // Handle both SQL result format and direct record format
      const lat = record.latitude ?? record[latField];
      const lon = record.longitude ?? record[lonField];
      const name = record.location_name ?? record[nameField || ''] ?? record[locationKeyField] ?? '';
      const code = record.location_key ?? record[locationKeyField] ?? record[idField || ''] ?? '';
      const date = record.sample_date ?? record[dateField] ?? '';
      const result = record.result ?? (resultField ? record[resultField] : null);
      
      return {
        StationName: name,
        StationCode: code,
        SampleDate: date,
        TargetLatitude: lat?.toString() || '',
        TargetLongitude: lon?.toString() || '',
        Result: result?.toString() || '',
        CollectionTime: '',
        LocationCode: code,
        Program: '',
        ParentProject: '',
        Project: '',
        Analyte: '',
        Unit: '',
        '30DayGeoMean': '',
        '30DayCount': '',
        '6WeekGeoMean': '',
        '6WeekCount': '',
        ResultQualCode: '',
      };
    }).filter(record => 
      record.TargetLatitude && 
      record.TargetLongitude && 
      record.TargetLatitude !== 'NR' &&
      record.TargetLongitude !== 'NR' &&
      !isNaN(parseFloat(record.TargetLatitude)) &&
      !isNaN(parseFloat(record.TargetLongitude)) &&
      parseFloat(record.TargetLatitude) !== 0 &&
      parseFloat(record.TargetLongitude) !== 0
    );

    return NextResponse.json(
      {
        meta: {
          resource_id: RESOURCE_2020_PRESENT,
          location_key_field: locationKeyField,
          name_field: nameField,
          lat_field: latField,
          lon_field: lonField,
          date_field: dateField,
          result_field: resultField,
          returned: records.length,
        },
        data: mappedRecords,
      },
      {
        headers: {
          // good for demos, tweak later
          "Cache-Control": "s-maxage=900, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    console.error('Water quality API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('timeout');
    
    // Log full error details for debugging
    console.error('Full error details:', {
      message: errorMessage,
      stack: errorStack,
      isTimeout,
    });
    
    return NextResponse.json(
      { 
        error: isTimeout 
          ? 'Request timed out. The dataset is large and may exceed Vercel function limits.'
          : 'Failed to fetch water quality data',
        details: errorMessage,
        suggestion: isTimeout 
          ? 'Try calling with ?max=1000 for faster response'
          : 'Check Vercel function logs for more details. The CKAN API may be temporarily unavailable.'
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
