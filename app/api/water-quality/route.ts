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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // optional: cap markers returned (in case CKAN or UI slows down)
    const max = Math.min(Math.max(Number(url.searchParams.get("max") ?? "5000"), 100), 20000);

    console.log(`Water quality API: Fetching up to ${max} unique stations...`);

    // 1) Discover schema so we do not guess column names
    const fields = await getFields(RESOURCE_2020_PRESENT);

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

    // Optional context fields if they exist
    const countyField = pickFirst(fields, ["county", "county_name"]);
    const labField = pickFirst(fields, ["lab", "lab_name"]);
    const unitField = pickFirst(fields, ["units", "unit"]);

    // 5) Query: latest sample per locationKeyField
    // CKAN DataStore is typically backed by Postgres, so DISTINCT ON works well.
    // We cast lat/lon to numeric defensively, and drop nulls.
    const selectParts = [
      `"${locationKeyField}" as location_key`,
      nameField ? `"${nameField}" as location_name` : `"${locationKeyField}" as location_name`,
      `"${latField}" as latitude`,
      `"${lonField}" as longitude`,
      `"${dateField}" as sample_date`,
    ];

    if (resultField) selectParts.push(`"${resultField}" as result`);
    if (countyField) selectParts.push(`"${countyField}" as county`);
    if (labField) selectParts.push(`"${labField}" as lab`);
    if (unitField) selectParts.push(`"${unitField}" as unit`);

    const sql = `
      SELECT DISTINCT ON (location_key)
        ${selectParts.join(",\n        ")}
      FROM (
        SELECT
          "${locationKeyField}" as location_key,
          ${nameField ? `"${nameField}" as location_name,` : ""}
          "${latField}" as latitude,
          "${lonField}" as longitude,
          "${dateField}" as sample_date
          ${resultField ? `, "${resultField}" as result` : ""}
          ${countyField ? `, "${countyField}" as county` : ""}
          ${labField ? `, "${labField}" as lab` : ""}
          ${unitField ? `, "${unitField}" as unit` : ""}
        FROM "${RESOURCE_2020_PRESENT}"
        WHERE "${latField}" IS NOT NULL
          AND "${lonField}" IS NOT NULL
          AND CAST("${latField}" AS TEXT) <> ''
          AND CAST("${lonField}" AS TEXT) <> ''
          AND "${dateField}" IS NOT NULL
      ) t
      ORDER BY location_key, sample_date DESC
      LIMIT ${max}
    `.trim();

    console.log(`Executing SQL query for unique stations...`);
    const json = await ckan("datastore_search_sql", { sql });
    const records = json?.result?.records ?? [];

    console.log(`Found ${records.length} unique stations`);

    // Map to our expected format
    const mappedRecords = records.map((record: any) => ({
      StationName: record.location_name || record.location_key || '',
      StationCode: record.location_key || '',
      SampleDate: record.sample_date || '',
      TargetLatitude: record.latitude?.toString() || '',
      TargetLongitude: record.longitude?.toString() || '',
      Result: record.result?.toString() || '',
      CollectionTime: '',
      LocationCode: record.location_key || '',
      Program: '',
      ParentProject: '',
      Project: '',
      Analyte: '',
      Unit: record.unit || '',
      '30DayGeoMean': '',
      '30DayCount': '',
      '6WeekGeoMean': '',
      '6WeekCount': '',
      ResultQualCode: '',
    }));

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
    const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('timeout');
    
    return NextResponse.json(
      { 
        error: isTimeout 
          ? 'Request timed out. The dataset is large and may exceed Vercel function limits.'
          : 'Failed to fetch water quality data',
        details: errorMessage,
        suggestion: isTimeout 
          ? 'Try calling with ?max=1000 for faster response'
          : 'Check Vercel function logs for more details'
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
