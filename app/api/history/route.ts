import { NextRequest, NextResponse } from "next/server";

const RESOURCE_ID = "15a63495-8d9f-4a49-b43a-3092ef3106b9";
const CKAN_BASE = "https://data.ca.gov/api/3/action";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing station code" }, { status: 400 });
  }

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const since = oneYearAgo.toISOString().slice(0, 10);

  const safeName = code.replace(/'/g, "''");
  const sql = `SELECT "SampleDate","Result","ResultQualCode","30DayGeoMean" FROM "${RESOURCE_ID}" WHERE "StationName" = '${safeName}' AND "Analyte" = 'Enterococcus' AND "SampleDate" >= '${since}' ORDER BY "SampleDate" DESC`;

  const url = `${CKAN_BASE}/datastore_search_sql?sql=${encodeURIComponent(sql)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      console.error("CKAN HTTP error:", res.status, text);
      return NextResponse.json({ error: `CKAN returned ${res.status}`, records: [] }, { status: 502 });
    }

    const json = await res.json();
    if (!json.success) {
      console.error("CKAN query failed:", json);
      return NextResponse.json({ error: "CKAN query failed", records: [] }, { status: 502 });
    }

    const records = (json.result?.records || []).map((r: Record<string, string>) => ({
      date: r.SampleDate?.slice(0, 10),
      result: parseFloat(r.Result),
      qualCode: r.ResultQualCode,
      geoMean30: parseFloat(r["30DayGeoMean"]),
    }));

    return NextResponse.json({ records });
  } catch (err) {
    console.error("History API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error", records: [] },
      { status: 500 }
    );
  }
}
