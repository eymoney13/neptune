import { NextRequest, NextResponse } from "next/server";
import { getStationsFromDb } from "@/lib/db";
import { recordIsEnterococcus } from "@/lib/water-quality-enterococcus";

const RESOURCE_2020_PRESENT = "15a63495-8d9f-4a49-b43a-3092ef3106b9";
const CKAN_BASE = "https://data.ca.gov/api/3/action";

// Station filter: only fetch these stations. Set to null to fetch all.
// To restore all California beaches, set STATION_FILTER = null
const STATION_FILTER = "Hermosa Beach";

// Mark route as dynamic
export const dynamic = 'force-dynamic';

// Server-side cache for deduplicated records (in-memory, resets on server restart)
// In production, consider using Redis or similar for persistent caching
let cachedDeduplicatedRecords: any[] | null = null;
let cacheTimestamp: number = 0;
/** Bump when dedupe/filter logic changes so in-memory cache is not reused across deploys. */
let cachedDataVersion: number = 0;
const CACHE_DATA_VERSION = 2; // 2 = Enterococcus-only latest per station
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function ckan(action: string, params: Record<string, string>) {
  const url = `${CKAN_BASE}/${action}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store", // CKAN responses can exceed 2MB; Next.js cache fails above that
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
  const chunkSize = 5000;
  const allRecords: any[] = [];
  
  // Fetch ALL records - continue until no more are returned
  // Safety limit: 600,000 records (should cover 525,500 + buffer)
  const safetyLimit = 600000;
  let offset = 0;
  let consecutiveEmptyChunks = 0;
  const maxConsecutiveEmpty = 3; // Stop after 3 consecutive empty chunks
  
  while (allRecords.length < safetyLimit && consecutiveEmptyChunks < maxConsecutiveEmpty) {
    try {
      const json = await ckan("datastore_search", {
        resource_id: resourceId,
        limit: chunkSize.toString(),
        offset: offset.toString(),
      });
      
      const records = json?.result?.records ?? [];
      
      if (records.length === 0) {
        consecutiveEmptyChunks++;
        console.log(`Empty chunk at offset ${offset}, consecutive empty: ${consecutiveEmptyChunks}`);
        if (consecutiveEmptyChunks >= maxConsecutiveEmpty) {
          console.log(`No more records found after ${offset} records`);
          break;
        }
        offset += chunkSize; // Try next chunk anyway
        continue;
      }
      
      consecutiveEmptyChunks = 0; // Reset counter
      allRecords.push(...records);
      offset += records.length;
      
      // Log progress every 50k records
      if (allRecords.length % 50000 === 0) {
        console.log(`Fetched ${allRecords.length} records so far...`);
      }
      
      // If we got fewer records than requested, we might be at the end
      if (records.length < chunkSize) {
        console.log(`Got partial chunk (${records.length} < ${chunkSize}) at offset ${offset - records.length}`);
        // Try one more chunk to be sure
        offset += chunkSize;
        continue;
      }
    } catch (error) {
      console.warn(`Error fetching chunk at offset ${offset}:`, error);
      if (allRecords.length === 0) throw error;
      // If we have some data, stop on error
      break;
    }
  }
  
  console.log(`Fetched ${allRecords.length} total raw records, filtering...`);

  const enterococcusRecords = allRecords.filter(recordIsEnterococcus);
  console.log(
    `Enterococcus-only: ${enterococcusRecords.length} rows (dropped ${allRecords.length - enterococcusRecords.length} non-Enterococcus)`
  );

  // Filter valid records (coordinates)
  const validRecords = enterococcusRecords.filter((record: any) => {
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
  
  console.log(
    `Found ${validRecords.length} valid Enterococcus records with coordinates (from ${enterococcusRecords.length} Enterococcus rows)`
  );

  // Debug: Show sample of invalid records if we have no valid ones
  if (validRecords.length === 0 && enterococcusRecords.length > 0) {
    const sample = enterococcusRecords[0];
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
  console.log(`Deduplicated to ${uniqueRecords.length} unique stations (from ${validRecords.length} valid records, skipped ${skippedCount} records without StationName)`);
  
  // Debug: Show sample record if we have issues
  if (uniqueRecords.length === 0 && validRecords.length > 0) {
    const sample = validRecords[0];
    console.log(`Sample record (first of ${validRecords.length}):`, {
      StationName: sample[nameField] || sample['StationName'],
      TargetLatitude: sample[latField] || sample['TargetLatitude'],
      TargetLongitude: sample[lonField] || sample['TargetLongitude'],
      SampleDateTime: sample[dateField] || sample['SampleDateTime'],
      Result: resultField ? (sample[resultField] || sample['Result']) : sample['Result'],
      allKeys: Object.keys(sample).slice(0, 20)
    });
  }
  
  return uniqueRecords;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Pagination support: limit and offset for final results
    const limit = Number(url.searchParams.get("limit") ?? "0"); // 0 = no limit (fetch all)
    const offset = Number(url.searchParams.get("offset") ?? "0");
    
    // Legacy max parameter support (for backward compatibility)
    const requestedMax = Number(url.searchParams.get("max") ?? "0");
    const max = requestedMax > 0 
      ? (requestedMax >= 100000 ? 1000000 : Math.min(Math.max(requestedMax, 100), 100000))
      : (limit > 0 ? limit + offset : 1000000); // If limit is set, use it; otherwise fetch all
    
    // If user wants all records, set a very high max for deduplication
    const actualMax = requestedMax >= 500000 || limit === 0 ? 1000000 : max;

    console.log(`Water quality API: limit=${limit}, offset=${offset}`);

    // Fast path: try Supabase first (no CKAN call if DB has data)
    const now = Date.now();
    let allUniqueRecords: any[];
    let latField = 'TargetLatitude';
    let lonField = 'TargetLongitude';
    let nameField = 'StationName';
    let locationKeyField = 'StationName';
    let dateField = 'SampleDate';
    let resultField: string | null = 'Result';
    let unitField: string | null = 'Unit';

    if (
      cachedDeduplicatedRecords &&
      cachedDataVersion === CACHE_DATA_VERSION &&
      now - cacheTimestamp < CACHE_TTL
    ) {
      console.log(`Using cached deduplicated records (${cachedDeduplicatedRecords.length} stations)`);
      allUniqueRecords = cachedDeduplicatedRecords;
    } else {
      let dbRecords: Awaited<ReturnType<typeof getStationsFromDb>> = null;
      try {
        dbRecords = await getStationsFromDb();
      } catch (err) {
        console.warn('Database read failed, falling back to CKAN:', err instanceof Error ? err.message : err);
      }
      if (dbRecords && dbRecords.length > 0) {
        console.log(`Using ${dbRecords.length} stations from database`);
        cachedDeduplicatedRecords = dbRecords;
        cachedDataVersion = CACHE_DATA_VERSION;
        cacheTimestamp = now;
        allUniqueRecords = dbRecords;
      } else {
        console.log(`Database empty, fetching from CKAN...`);
        const fields = await getFields(RESOURCE_2020_PRESENT);
        latField = requireField(pickFirst(fields, ["TargetLatitude", "target_latitude"]), "TargetLatitude");
        lonField = requireField(pickFirst(fields, ["TargetLongitude", "target_longitude"]), "TargetLongitude");
        nameField = requireField(pickFirst(fields, ["StationName", "station_name"]), "StationName");
        locationKeyField = nameField;
        dateField = pickFirst(fields, ["SampleDateTime", "sample_datetime", "SampleDate", "sample_date"]) || 'SampleDate';
        resultField = pickFirst(fields, ["Result", "result"]);
        unitField = pickFirst(fields, ["Unit", "unit"]);
        const records = await fetchRecordsFallback(
          RESOURCE_2020_PRESENT,
          latField,
          lonField,
          nameField,
          nameField,
        dateField,
        resultField,
        actualMax
      );
      console.log(`Found ${records.length} unique stations, caching...`);
      
      // Cache the deduplicated results
      cachedDeduplicatedRecords = records;
      cachedDataVersion = CACHE_DATA_VERSION;
      cacheTimestamp = now;
      allUniqueRecords = records;
      }
    }
    // Apply station filter if set
    if (STATION_FILTER) {
      const filterLower = STATION_FILTER.toLowerCase();
      allUniqueRecords = allUniqueRecords.filter((r: any) => {
        const name = String(r[nameField] ?? r.StationName ?? r['StationName'] ?? '');
        return name.toLowerCase().includes(filterLower);
      });
      console.log(`Station filter "${STATION_FILTER}": ${allUniqueRecords.length} stations match`);
    }

    const paginatedRecords = limit > 0 
      ? allUniqueRecords.slice(offset, offset + limit)
      : allUniqueRecords.slice(offset);
    
    console.log(`Returning ${paginatedRecords.length} stations (offset=${offset}, limit=${limit}, total available: ${allUniqueRecords.length})`);

    // Map to our expected format - pull specific fields (handles both DB and CKAN record shapes)
    const mappedRecords = paginatedRecords.map((record: any) => {
      const name = record[nameField] ?? record.StationName ?? record['StationName'] ?? '';
      const lat = record[latField] ?? record.TargetLatitude ?? record['TargetLatitude'] ?? '';
      const lon = record[lonField] ?? record.TargetLongitude ?? record['TargetLongitude'] ?? '';
      const date = record[dateField] ?? record.SampleDate ?? record['SampleDateTime'] ?? record['SampleDate'] ?? '';
      const result = (resultField ? record[resultField] : record.Result ?? record['Result']) ?? record.Result ?? record['Result'] ?? '';
      const unit = (unitField ? record[unitField] : record.Unit ?? record['Unit']) ?? record.Unit ?? record['Unit'] ?? '';
      
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
          total_unique_stations: allUniqueRecords.length, // Total available after deduplication
          has_more: limit > 0 && (offset + mappedRecords.length < allUniqueRecords.length), // Indicates if more records available
          offset: offset,
          limit: limit,
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
