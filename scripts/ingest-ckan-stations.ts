#!/usr/bin/env node
/**
 * Ingest deduplicated water quality stations from CKAN datastore into Supabase.
 * Run once to populate water_quality_stations table for fast API load times.
 *
 * Usage: npm run ingest:stations
 * Requires: DATABASE_URL in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getDbClient, ensureStationsTable, upsertStations } from '../lib/db';

const RESOURCE_ID = '15a63495-8d9f-4a49-b43a-3092ef3106b9';
const CKAN_BASE = 'https://data.ca.gov/api/3/action';
const CHUNK_SIZE = 5000;
const SAFETY_LIMIT = 600000;

async function ckan(action: string, params: Record<string, string>) {
  const url = `${CKAN_BASE}/${action}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status} for ${action}`);
  const json = await res.json();
  if (!json?.success) throw new Error(`CKAN success=false for ${action}`);
  return json;
}

async function main() {
  console.log('Fetching schema from CKAN...');
  const schemaRes = await ckan('datastore_search', {
    resource_id: RESOURCE_ID,
    limit: '1',
  });
  const fields = (schemaRes?.result?.fields ?? []).map((f: any) => f.id).filter(Boolean);
  if (!fields.length) throw new Error('No fields returned from CKAN');

  const pick = (candidates: string[]) => {
    const lower = new Map(fields.map((f: string) => [f.toLowerCase(), f]));
    for (const c of candidates) {
      const hit = lower.get(c.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };

  const latField = pick(['TargetLatitude', 'target_latitude']) ?? 'TargetLatitude';
  const lonField = pick(['TargetLongitude', 'target_longitude']) ?? 'TargetLongitude';
  const nameField = pick(['StationName', 'station_name']) ?? 'StationName';
  const dateField = pick(['SampleDateTime', 'SampleDate', 'sample_datetime', 'sample_date']) ?? 'SampleDate';
  const resultField = pick(['Result', 'result']);
  const unitField = pick(['Unit', 'unit']);

  console.log(`Fetching records (fields: ${nameField}, ${latField}, ${lonField})...`);
  const allRecords: any[] = [];
  let offset = 0;
  let consecutiveEmpty = 0;

  while (allRecords.length < SAFETY_LIMIT && consecutiveEmpty < 3) {
    const json = await ckan('datastore_search', {
      resource_id: RESOURCE_ID,
      limit: CHUNK_SIZE.toString(),
      offset: offset.toString(),
    });
    const records = json?.result?.records ?? [];
    if (records.length === 0) {
      consecutiveEmpty++;
      offset += CHUNK_SIZE;
      continue;
    }
    consecutiveEmpty = 0;
    allRecords.push(...records);
    offset += records.length;
    if (allRecords.length % 50000 === 0) {
      console.log(`  Fetched ${allRecords.length} records...`);
    }
    if (records.length < CHUNK_SIZE) break;
  }

  console.log(`Fetched ${allRecords.length} total records, filtering...`);
  const valid = allRecords.filter((r: any) => {
    const lat = parseFloat(String(r[latField] ?? ''));
    const lon = parseFloat(String(r[lonField] ?? ''));
    if (isNaN(lat) || isNaN(lon)) return false;
    if (lat === 0 && lon === 0) return false;
    if (r[latField] === 'NR' || r[lonField] === 'NR') return false;
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  });

  console.log(`Deduplicating by ${nameField} (keeping latest)...`);
  const seen = new Map<string, any>();
  for (const r of valid) {
    const key = String(r[nameField] ?? r['StationName'] ?? '').trim();
    if (!key) continue;
    const existing = seen.get(key);
    const rDate = r[dateField] ?? r['SampleDateTime'] ?? r['SampleDate'] ?? '';
    const existingDate = existing ? (existing[dateField] ?? existing['SampleDateTime'] ?? existing['SampleDate'] ?? '') : '';
    if (!existing || (rDate && String(rDate) > String(existingDate))) {
      seen.set(key, r);
    }
  }

  const unique = Array.from(seen.values());
  console.log(`Deduplicated to ${unique.length} unique stations.`);

  const toUpsert = unique.map((r: any) => ({
    StationName: String(r[nameField] ?? r['StationName'] ?? '').trim(),
    StationCode: String(r[nameField] ?? r['StationName'] ?? ''),
    SampleDate: String(r[dateField] ?? r['SampleDateTime'] ?? r['SampleDate'] ?? ''),
    TargetLatitude: String(r[latField] ?? r['TargetLatitude'] ?? ''),
    TargetLongitude: String(r[lonField] ?? r['TargetLongitude'] ?? ''),
    Result: String((resultField ? r[resultField] : r['Result']) ?? r['Result'] ?? ''),
    Unit: String((unitField ? r[unitField] : r['Unit']) ?? r['Unit'] ?? ''),
  })).filter((r) => r.StationName && r.TargetLatitude && r.TargetLongitude);

  console.log(`Upserting ${toUpsert.length} stations to Supabase...`);
  const client = getDbClient();
  await client.connect();
  try {
    await ensureStationsTable(client);
    const count = await upsertStations(client, toUpsert);
    console.log(`✓ Ingested ${count} stations. API will now use database for fast loads.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
