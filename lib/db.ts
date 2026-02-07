/**
 * Database utilities for Postgres COPY operations
 */

import { Client } from 'pg';
import { Readable } from 'stream';

/**
 * Get Postgres client from environment variables
 * Supports Supabase Postgres (Vercel integration)
 */
export function getDbClient(): Client {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    throw new Error(
      'Database connection string not found. Set DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL environment variable.'
    );
  }

  return new Client({
    connectionString,
    ssl: connectionString.includes('supabase') || connectionString.includes('ssl') 
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

/**
 * Create staging table if it doesn't exist
 */
export async function ensureStagingTable(client: Client, tableName: string): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      station_name TEXT,
      station_code TEXT,
      target_latitude TEXT,
      target_longitude TEXT,
      sample_date TEXT,
      result TEXT,
      unit TEXT,
      collection_time TEXT,
      location_code TEXT,
      program TEXT,
      parent_project TEXT,
      project TEXT,
      analyte TEXT,
      "30DayGeoMean" TEXT,
      "30DayCount" TEXT,
      "6WeekGeoMean" TEXT,
      "6WeekCount" TEXT,
      result_qual_code TEXT
    )
  `);
}

/**
 * Truncate staging table
 */
export async function truncateStagingTable(client: Client, tableName: string): Promise<void> {
  await client.query(`TRUNCATE TABLE ${tableName}`);
}

/**
 * Stream CSV data into Postgres using COPY FROM STDIN
 * Uses pg's COPY streaming API
 */
export async function copyFromStream(
  client: Client,
  tableName: string,
  stream: Readable
): Promise<number> {
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    let error: Error | null = null;
    let copyStream: any;

    try {
      const copyQuery = `COPY ${tableName} FROM STDIN WITH (FORMAT CSV, HEADER true, DELIMITER ',', QUOTE '"', ESCAPE '"')`;
      
      // pg's query() returns a stream for COPY operations
      copyStream = client.query(copyQuery);

      // Handle COPY stream completion
      copyStream.on('end', () => {
        if (error) {
          reject(error);
        } else {
          // Subtract 1 for header row
          resolve(Math.max(0, rowCount - 1));
        }
      });

      copyStream.on('error', (err: Error) => {
        error = err;
        if (!stream.destroyed) {
          stream.destroy();
        }
        reject(err);
      });

      // Count rows as they're streamed (approximate)
      stream.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        const newlines = (chunkStr.match(/\n/g) || []).length;
        rowCount += newlines;
      });

      stream.on('error', (err: Error) => {
        error = err;
        if (copyStream && !copyStream.destroyed) {
          copyStream.end();
        }
        reject(err);
      });

      stream.on('end', () => {
        if (copyStream && !copyStream.destroyed) {
          copyStream.end();
        }
      });

      // Pipe CSV stream into COPY stream
      // The copyStream from pg.query() acts as a writable stream
      stream.pipe(copyStream);
    } catch (err: any) {
      if (copyStream && !copyStream.destroyed) {
        copyStream.end();
      }
      if (!stream.destroyed) {
        stream.destroy();
      }
      reject(err);
    }
  });
}

/**
 * Merge staging table into main table
 * This is a simple upsert - adjust based on your schema
 */
export async function mergeStagingToMain(
  client: Client,
  stagingTable: string,
  mainTable: string
): Promise<number> {
  // First, ensure main table exists with same schema
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${mainTable} (
      station_name TEXT,
      station_code TEXT,
      target_latitude TEXT,
      target_longitude TEXT,
      sample_date TEXT,
      result TEXT,
      unit TEXT,
      collection_time TEXT,
      location_code TEXT,
      program TEXT,
      parent_project TEXT,
      project TEXT,
      analyte TEXT,
      "30DayGeoMean" TEXT,
      "30DayCount" TEXT,
      "6WeekGeoMean" TEXT,
      "6WeekCount" TEXT,
      result_qual_code TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create unique index for deduplication (adjust based on your needs)
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${mainTable}_unique_idx 
    ON ${mainTable} (station_code, sample_date, analyte)
  `);

  // Merge: insert or update
  const result = await client.query(`
    INSERT INTO ${mainTable} (
      station_name, station_code, target_latitude, target_longitude,
      sample_date, result, unit, collection_time, location_code,
      program, parent_project, project, analyte,
      "30DayGeoMean", "30DayCount", "6WeekGeoMean", "6WeekCount", result_qual_code
    )
    SELECT 
      station_name, station_code, target_latitude, target_longitude,
      sample_date, result, unit, collection_time, location_code,
      program, parent_project, project, analyte,
      "30DayGeoMean", "30DayCount", "6WeekGeoMean", "6WeekCount", result_qual_code
    FROM ${stagingTable}
    ON CONFLICT (station_code, sample_date, analyte)
    DO UPDATE SET
      station_name = EXCLUDED.station_name,
      target_latitude = EXCLUDED.target_latitude,
      target_longitude = EXCLUDED.target_longitude,
      result = EXCLUDED.result,
      unit = EXCLUDED.unit,
      updated_at = NOW()
  `);

  return result.rowCount || 0;
}

/** Station summary row shape for water_quality_stations table */
export interface StationRow {
  StationName: string;
  StationCode: string;
  SampleDate: string;
  TargetLatitude: string;
  TargetLongitude: string;
  Result: string;
  Unit: string;
}

const STATIONS_TABLE = 'water_quality_stations';

/**
 * Ensure the stations summary table exists (one row per station, latest data)
 */
export async function ensureStationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${STATIONS_TABLE} (
      station_name TEXT PRIMARY KEY,
      station_code TEXT,
      target_latitude TEXT,
      target_longitude TEXT,
      sample_date TEXT,
      result TEXT,
      unit TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

/**
 * Upsert deduplicated stations into the summary table (batched for speed)
 */
export async function upsertStations(
  client: Client,
  records: Array<{
    StationName: string;
    StationCode: string;
    SampleDate: string;
    TargetLatitude: string;
    TargetLongitude: string;
    Result: string;
    Unit: string;
  }>
): Promise<number> {
  if (records.length === 0) return 0;
  await ensureStationsTable(client);
  const batchSize = 100;
  let count = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const values = batch.flatMap((r, idx) => {
      const n = i + idx;
      return [
        String(r.StationName || '').trim(),
        String(r.StationCode || r.StationName || ''),
        String(r.TargetLatitude || ''),
        String(r.TargetLongitude || ''),
        String(r.SampleDate || ''),
        String(r.Result || ''),
        String(r.Unit || ''),
      ];
    });
    const placeholders = batch
      .map((_, idx) => {
        const o = idx * 7;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, NOW())`;
      })
      .join(', ');
    const res = await client.query(
      `INSERT INTO ${STATIONS_TABLE} (
        station_name, station_code, target_latitude, target_longitude,
        sample_date, result, unit, updated_at
      ) VALUES ${placeholders}
      ON CONFLICT (station_name) DO UPDATE SET
        station_code = EXCLUDED.station_code,
        target_latitude = EXCLUDED.target_latitude,
        target_longitude = EXCLUDED.target_longitude,
        sample_date = EXCLUDED.sample_date,
        result = EXCLUDED.result,
        unit = EXCLUDED.unit,
        updated_at = NOW()`,
      values
    );
    count += res.rowCount || 0;
  }
  return count;
}

/**
 * Fetch station summaries from the database (fast path)
 * Returns null if table is empty or DATABASE_URL is not set
 */
export async function getStationsFromDb(): Promise<StationRow[] | null> {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL;
  if (!connectionString) return null;

  const client = getDbClient();
  try {
    await client.connect();
    const res = await client.query(
      `SELECT station_name AS "StationName", station_code AS "StationCode",
              sample_date AS "SampleDate", target_latitude AS "TargetLatitude",
              target_longitude AS "TargetLongitude", result AS "Result", unit AS "Unit"
       FROM ${STATIONS_TABLE}
       WHERE station_name IS NOT NULL AND station_name != ''
         AND target_latitude IS NOT NULL AND target_longitude IS NOT NULL
         AND target_latitude != 'NR' AND target_longitude != 'NR'`
    );
    const rows = res.rows || [];
    if (rows.length === 0) return null;
    return rows as StationRow[];
  } catch {
    return null;
  } finally {
    await client.end();
  }
}
