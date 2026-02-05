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

// Fallback: Use regular datastore_search if SQL fails
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
  console.log(`Using fallback method: fetching ${max} records...`);
  const limit = Math.min(max * 2, 10000); // Fetch more to account for duplicates
  const json = await ckan("datastore_search", {
    resource_id: resourceId,
    limit: limit.toString(),
  });
  
  const allRecords = json?.result?.records ?? [];
  
  // Filter valid records
  const validRecords = allRecords.filter((record: any) => {
    const lat = record[latField];
    const lon = record[lonField];
    return lat && lon && lat !== 'NR' && lon !== 'NR' && 
           !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lon)) &&
           parseFloat(lat) !== 0 && parseFloat(lon) !== 0;
  });
  
  // Deduplicate by location key, keeping latest by date
  const seen = new Map<string, any>();
  for (const record of validRecords) {
    const key = record[locationKeyField] || record[nameField || ''] || '';
    if (!key) continue;
    
    const existing = seen.get(key);
    const recordDate = record[dateField];
    if (!existing || !recordDate) {
      seen.set(key, record);
    } else {
      const existingDate = existing[dateField];
      if (recordDate > existingDate) {
        seen.set(key, record);
      }
    }
  }
  
  return Array.from(seen.values()).slice(0, max);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // optional: cap markers returned (in case CKAN or UI slows down)
    const max = Math.min(Math.max(Number(url.searchParams.get("max") ?? "5000"), 100), 20000);

    console.log(`Water quality API: Fetching up to ${max} unique stations...`);

    // 1) Discover schema so we do not guess column names
    const fields = await getFields(RESOURCE_2020_PRESENT);
    console.log(`Found ${fields.length} fields in dataset`);

    // 2) Identify lat/lon fields (common names)
    const latField = requireField(
      pickFirst(fields, ["latitude", "lat", "dec_lat", "decimal_latitude", "station_latitude", "sample_latitude", "target_latitude"]),
      "latitude"
    );
    const lonField = requireField(
      pickFirst(fields, ["longitude", "lon", "lng", "dec_lon", "decimal_longitude", "station_longitude", "sample_longitude", "target_longitude"]),
      "longitude"
    );

    // 3) Identify a stable "location key" (station/site id if present, else station name)
    const idField =
      pickFirst(fields, ["station_id", "site_id", "location_id", "monitoring_location_id", "beach_id", "id", "station_code", "site_code"]) ?? null;

    const nameField =
      pickFirst(fields, ["station_name", "site_name", "location_name", "beach_name", "monitoring_location_name", "name"]) ??
      null;

    const locationKeyField = idField ?? requireField(nameField, "station/site name");

    // 4) Identify date/time field so we can pick latest record
    const dateField = requireField(
      pickFirst(fields, ["sample_date", "sample_datetime", "collection_date", "collection_datetime", "date", "timestamp"]),
      "sample date"
    );

    // Identify result field for water quality data
    const resultField = pickFirst(fields, ["result", "fecal_coliform", "value", "measurement", "cfu"]);

    console.log(`Identified fields: lat=${latField}, lon=${lonField}, key=${locationKeyField}, date=${dateField}`);

    let records: any[] = [];
    
    // Try SQL query first, fallback to regular search if it fails
    try {
      const selectParts = [
        `"${locationKeyField}" as location_key`,
        nameField ? `"${nameField}" as location_name` : `"${locationKeyField}" as location_name`,
        `"${latField}" as latitude`,
        `"${lonField}" as longitude`,
        `"${dateField}" as sample_date`,
      ];

      if (resultField) selectParts.push(`"${resultField}" as result`);

      const sql = `
        SELECT DISTINCT ON ("${locationKeyField}")
          ${selectParts.join(",\n          ")}
        FROM "${RESOURCE_2020_PRESENT}"
        WHERE "${latField}" IS NOT NULL
          AND "${lonField}" IS NOT NULL
          AND CAST("${latField}" AS TEXT) <> ''
          AND CAST("${lonField}" AS TEXT) <> ''
          AND "${dateField}" IS NOT NULL
        ORDER BY "${locationKeyField}", "${dateField}" DESC
        LIMIT ${max}
      `.trim();

      console.log(`Attempting SQL query for unique stations...`);
      const json = await ckan("datastore_search_sql", { sql });
      records = json?.result?.records ?? [];
      console.log(`SQL query succeeded: Found ${records.length} unique stations`);
    } catch (sqlError) {
      console.warn(`SQL query failed, using fallback method:`, sqlError);
      records = await fetchRecordsFallback(
        RESOURCE_2020_PRESENT,
        latField,
        lonField,
        locationKeyField,
        nameField,
        dateField,
        resultField,
        max
      );
      console.log(`Fallback method found ${records.length} unique stations`);
    }

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
