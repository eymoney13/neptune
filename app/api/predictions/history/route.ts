import { NextRequest, NextResponse } from 'next/server';
import { getDailyPredictionsRecent, groupPredictionHistoryRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/predictions/history?days=14
 * Returns grouped daily 6AM PT snapshots for comparing predictions to later lab results.
 */
export async function GET(req: NextRequest) {
  const days = Math.min(
    365,
    Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? '14'))
  );

  try {
    const rows = await getDailyPredictionsRecent(days);
    const byStation = groupPredictionHistoryRows(rows);
    return NextResponse.json({
      days,
      byStation,
      totalRows: rows.length,
    });
  } catch (e) {
    console.error('predictions/history:', e);
    return NextResponse.json(
      { error: 'Failed to load prediction history', byStation: {} },
      { status: 500 }
    );
  }
}
