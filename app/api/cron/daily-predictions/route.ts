import { NextRequest, NextResponse } from 'next/server';
import {
  getDbClient,
  getPacificDateString,
  getStationsFromDb,
  upsertDailyPredictionSnapshot,
} from '@/lib/db';
import { callPythonPredict } from '@/lib/server-predict';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type StationInput = {
  code: string;
  name: string;
  lat: number;
  lon: number;
  latestResult: number;
};

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    console.warn('daily-predictions: CRON_SECRET unset — allowing in non-production');
    return true;
  }
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

async function loadStations(): Promise<StationInput[]> {
  const fromDb = await getStationsFromDb();
  if (fromDb?.length) {
    return fromDb
      .map((r) => {
        const code = (r.StationCode || r.StationName || '').trim();
        const lat = parseFloat(String(r.TargetLatitude));
        const lon = parseFloat(String(r.TargetLongitude));
        const latestResult = parseFloat(String(r.Result)) || 0;
        return { code, name: r.StationName || code, lat, lon, latestResult };
      })
      .filter((s) => s.code && !Number.isNaN(s.lat) && !Number.isNaN(s.lon));
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000';

  const res = await fetch(`${base.replace(/\/$/, '')}/api/water-quality?limit=5000`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`water-quality fetch failed: ${res.status}`);
  }
  const json = await res.json();
  const data = (json.data || []) as Array<Record<string, string>>;
  return data
    .map((r) => {
      const code = (r.StationCode || r.StationName || '').trim();
      const lat = parseFloat(String(r.TargetLatitude ?? ''));
      const lon = parseFloat(String(r.TargetLongitude ?? ''));
      const latestResult = parseFloat(String(r.Result ?? '0')) || 0;
      return {
        code,
        name: (r.StationName || code).trim(),
        lat,
        lon,
        latestResult,
      };
    })
    .filter((s) => s.code && !Number.isNaN(s.lat) && !Number.isNaN(s.lon));
}

/**
 * Vercel Cron: GET /api/cron/daily-predictions
 * Stores Enterococcus model output per station for the current Pacific calendar date.
 * Schedule: 14:00 UTC ≈ 6:00 AM Pacific Standard Time (7 AM during PDT).
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snapshotDatePt = getPacificDateString();
  let stations: StationInput[];
  try {
    stations = await loadStations();
  } catch (e) {
    console.error('daily-predictions load stations:', e);
    return NextResponse.json(
      { error: 'Could not load stations', detail: String(e) },
      { status: 503 }
    );
  }

  if (stations.length === 0) {
    return NextResponse.json({
      ok: true,
      snapshot_date_pt: snapshotDatePt,
      message: 'No stations to snapshot',
      saved: 0,
      failed: 0,
    });
  }

  const client = getDbClient();
  let saved = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    await client.connect();

    for (const s of stations) {
      const pred = await callPythonPredict({
        station_code: s.code,
        latitude: s.lat,
        longitude: s.lon,
        use_env_data: true,
        use_mock_model: true,
        antecedent_fib: s.latestResult > 0 ? s.latestResult : undefined,
      });

      if (!pred?.success || !pred.prediction) {
        failed++;
        errors.push(`${s.code}: predict failed`);
        continue;
      }

      const p = pred.prediction;
      const [lo, hi] = p.confidence_interval;
      const modelFile = pred.model_info?.model_file;

      try {
        await upsertDailyPredictionSnapshot(client, {
          station_code: s.code,
          station_name: s.name,
          snapshot_date_pt: snapshotDatePt,
          predicted_mpn: p.fecal_coliform_cfu,
          ci_low: lo,
          ci_high: hi,
          risk_level: p.risk_level,
          antecedent_fib: s.latestResult > 0 ? s.latestResult : null,
          model_file: modelFile ?? null,
        });
        saved++;
      } catch (err) {
        failed++;
        errors.push(`${s.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await client.end().catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    snapshot_date_pt: snapshotDatePt,
    stations: stations.length,
    saved,
    failed,
    errors: errors.slice(0, 20),
  });
}
