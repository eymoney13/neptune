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
  nameField: string, // Changed: nameField is required, not nullable
  dateField: string,
  resultField: string | null,
  max: number
): Promise<any[]> {
  console.log(`Fetching records using datastore_search...`);
  // Fetch in chunks - increase chunk size for better performance
  const chunkSize = 5000; // Increased from 1000
  const chunksNeeded = Math.ceil(max / chunkSize);
  const allRecords: any[] = [];
  
  // Fetch more records to account for duplicates - we want all unique locations
  const fetchLimit = Math.min(max * 3, 150000); // Fetch up to 150k records to get all unique locations
  
  for (let i = 0; i < chunksNeeded && allRecords.length < fetchLimit; i++) {
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
  
  // Deduplicate by StationName, keeping latest by date
  const seen = new Map<string, any>();
  let skippedCount = 0;
  
  for (const record of validRecords) {
    // Use StationName as the location key
    // nameField is guaranteed to be non-null at this point
    const fieldName = nameField!; // Non-null assertion since we checked earlier
    let key = record[fieldName] || record['StationName'] || '';
    key = String(key).trim();
    
    // Skip if no StationName
    if (!key || key === 'undefined' || key === 'null' || key === '') {
      skippedCount++;
      continue;
    }
    
    const existing = seen.get(key);
    const recordDate = record[dateField] || record['SampleDateTime'] || record['SampleDate'] || '';
    
    if (!existing) {
      seen.set(key, record);
    } else if (recordDate) {
      const existingDate = existing[dateField] || existing['SampleDateTime'] || existing['SampleDate'] || '';
      if (!existingDate || String(recordDate) > String(existingDate)) {
        seen.set(key, record);
      }
    }
  }
  
  const uniqueRecords = Array.from(seen.values()).slice(0, max);
  console.log(`Deduplicated to ${uniqueRecords.length} unique stations (skipped ${skippedCount} records without StationName)`);
  
  // Debug: Show sample record if we have issues
  if (uniqueRecords.length === 0 && validRecords.length > 0) {
    const sample = validRecords[0];
    console.log(`Sample record (first of ${validRecords.length}):`, {
      StationName: sample[nameField] || sample['StationName'],
      TargetLatitude: sample[latField] || sample['TargetLatitude'],
      TargetLongitude: sample[lonField] || sample['TargetLongitude'],
      SampleDateTime: sample[dateField] || sample['SampleDateTime'],
      Result: sample[resultField] || sample['Result'],
      Unit: sample[unitField] || sample['Unit'],
      allKeys: Object.keys(sample).slice(0, 20)
    });
  }
  
  return uniqueRecords;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Fetch all possible locations - increase limits significantly
    const max = Math.min(Math.max(Number(url.searchParams.get("max") ?? "50000"), 100), 100000);

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

    // 2) Identify specific fields we need: StationName, TargetLatitude, TargetLongitude, Result, Unit, SampleDateTime
    const latField = requireField(
      pickFirst(fields, ["TargetLatitude", "target_latitude"]),
      "TargetLatitude"
    );
    const lonField = requireField(
      pickFirst(fields, ["TargetLongitude", "target_longitude"]),
      "TargetLongitude"
    );
    const nameField = requireField(
      pickFirst(fields, ["StationName", "station_name"]),
      "StationName"
    );
    const dateField = pickFirst(fields, ["SampleDateTime", "sample_datetime", "SampleDate", "sample_date"]) || 'SampleDate';
    const resultField = pickFirst(fields, ["Result", "result"]);
    const unitField = pickFirst(fields, ["Unit", "unit"]);

    // Use StationName as the location key for deduplication
    const locationKeyField = nameField;

    console.log(`Identified fields: StationName=${nameField}, TargetLatitude=${latField}, TargetLongitude=${lonField}, SampleDateTime=${dateField}, Result=${resultField}, Unit=${unitField}`);

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

    // Map to our expected format - pull specific fields
    const mappedRecords = records.map((record: any) => {
      // Extract the specific fields we need
      const name = record[nameField] || record['StationName'] || '';
      const lat = record[latField] || record['TargetLatitude'] || '';
      const lon = record[lonField] || record['TargetLongitude'] || '';
      const date = record[dateField] || record['SampleDateTime'] || record['SampleDate'] || '';
      const result = record[resultField] || record['Result'] || '';
      const unit = record[unitField] || record['Unit'] || '';
      
      return {
        StationName: String(name || ''),
        StationCode: String(name || ''), // Use StationName as code
        SampleDate: String(date || ''),
        TargetLatitude: String(lat || ''),
        TargetLongitude: String(lon || ''),
        Result: String(result || ''),
        CollectionTime: '',
        LocationCode: String(name || ''),
        Program: '',
        ParentProject: '',
        Project: '',
        Analyte: '',
        Unit: String(unit || ''),
        '30DayGeoMean': '',
        '30DayCount': '',
        '6WeekGeoMean': '',
        '6WeekCount': '',
        ResultQualCode: '',
      };
    }).filter(record => {
      // Filter: must have StationName, valid coordinates, and Result
      if (!record.StationName || record.StationName.trim() === '') return false;
      if (!record.TargetLatitude || !record.TargetLongitude) return false;
      if (record.TargetLatitude === 'NR' || record.TargetLongitude === 'NR') return false;
      
      const latNum = parseFloat(record.TargetLatitude);
      const lonNum = parseFloat(record.TargetLongitude);
      
      if (isNaN(latNum) || isNaN(lonNum)) return false;
      if (latNum === 0 && lonNum === 0) return false;
      if (latNum < -90 || latNum > 90) return false;
      if (lonNum < -180 || lonNum > 180) return false;
      
      return true;
    });

    return NextResponse.json(
      {
        meta: {
          resource_id: RESOURCE_2020_PRESENT,
          location_key_field: locationKeyField, // StationName
          name_field: nameField,
          lat_field: latField,
          lon_field: lonField,
          date_field: dateField,
          result_field: resultField,
          returned: mappedRecords.length,
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
