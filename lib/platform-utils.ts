import type {
  StationSummary,
  PredictionResult,
  EnvironmentalData,
  PredictionHistoryByStation,
  DailyPredictionHistoryEntry,
} from './types';

// ── TIERS: Good (0–35 MPN), Caution (36–103 MPN), Poor (≥104 MPN) ──
export const TIERS = [
  { maxMpn: 35, label: 'Good', desc: 'Low bacteria, safe for all activities', color: '#00D68F' },
  { maxMpn: 103, label: 'Caution', desc: 'Medium bacteria, sensitive groups should avoid', color: '#FFB800' },
  { maxMpn: Infinity, label: 'Poor', desc: 'High bacteria, swimming not recommended', color: '#FF5733' },
] as const;

export function getTierFromMpn(mpn: number) {
  return TIERS.find((t) => mpn <= t.maxMpn) || TIERS[TIERS.length - 1];
}

export function getColorFromMpn(mpn: number) {
  return getTierFromMpn(mpn).color;
}

/** @deprecated Use getTierFromMpn instead — kept for compatibility during migration */
export function getTier(score: number) {
  return getTierFromMpn(score);
}

/** @deprecated Use getColorFromMpn instead */
export function getColor(score: number) {
  return getColorFromMpn(score);
}

/** @deprecated Use getTierFromMpn directly — this now just returns the MPN value unchanged */
export function cfuToScore(cfu: number): number {
  return cfu;
}

/** Pacific calendar date YYYY-MM-DD (matches snapshot `date` from cron). */
export function getPacificDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ── Site/Area types for Platform UI ──
export interface SiteData {
  id: string;
  name: string;
  address: string;
  score: number;
  trend: 'improving' | 'declining' | 'stable';
  forecast: number[];
  fib: number;
  temp: number;
  swell: string;
  wind: string;
  tested: string;
  rainfall48h: number;
  drainProximity: 'none' | 'nearby' | string;
  tidePhase: string;
  advisory?: string;
  lat: number;
  lng: number;
  area: string;
  region: string;
  stationCode: string;
  /** Latest Enterococcus lab MPN from CKAN (always lab, not live model) */
  labMpn: number;
  /** Stored cron snapshot for today's Pacific date, if any */
  todaySixAmSnapshotMpn: number | null;
  /** Daily 6AM PT model snapshots (newest first) for accuracy tracking */
  dailyPredictionHistory?: DailyPredictionHistoryEntry[];
}

export interface AreaData {
  id: string;
  name: string;
  region: string;
  sites: SiteData[];
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${Math.max(0, diffMins)}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function tideLevelToPhase(tideLevel: number): string {
  if (tideLevel < -0.3) return 'low';
  if (tideLevel > 0.3) return 'high';
  return 'mid-rising';
}

function formatSwell(meters: number): string {
  const ft = meters * 3.28;
  if (ft < 1) return '1-2ft';
  if (ft < 2) return '2-3ft';
  if (ft < 3.5) return '3-4ft';
  if (ft < 5) return '4-5ft';
  return '4-6ft';
}

/**
 * Transforms a StationSummary into SiteData for the Platform UI.
 * Uses prediction and envData when available (e.g. for selected station).
 */
export function transformStationToSite(
  station: StationSummary,
  prediction?: PredictionResult | null,
  envData?: EnvironmentalData | null,
  forecastData?: any,
  dailyPredictionHistory?: PredictionHistoryByStation | null
): SiteData {
  const fib = prediction?.prediction?.fecal_coliform_cfu ?? station.latestResult;
  const score = Math.round(fib);

  const temp = envData?.predictors?.temperature != null
    ? Math.round((envData.predictors.temperature * 9) / 5 + 32)
    : 62;
  const swell = envData?.predictors?.wave_height != null
    ? formatSwell(envData.predictors.wave_height)
    : '2-3ft';
  const windSpeed = envData?.predictors?.wind_speed ?? 6;
  const windDir = envData?.predictors?.wind_direction ?? 270;
  const windCardinal = windDir >= 337.5 || windDir < 22.5 ? 'N' : windDir < 67.5 ? 'NE' : windDir < 112.5 ? 'E' : windDir < 157.5 ? 'SE' : windDir < 202.5 ? 'S' : windDir < 247.5 ? 'SW' : windDir < 292.5 ? 'W' : 'NW';
  const wind = `${windCardinal} ${Math.round(windSpeed)}mph`;

  const rainfall48h = envData?.predictors?.precipitation_48h ?? 0;
  const tideLevel = envData?.predictors?.tide_level ?? 0;
  const tidePhase = tideLevelToPhase(tideLevel);

  // Use real multi-day forecast if available, otherwise fall back to confidence interval
  let forecast: number[];
  const fcForecasts = forecastData?.forecasts as Array<{ day: number; prediction: { fecal_coliform_cfu: number } }> | undefined;
  if (fcForecasts && fcForecasts.length >= 4) {
    forecast = fcForecasts.slice(1, 4).map(f => Math.max(1, Math.round(f.prediction.fecal_coliform_cfu)));
  } else {
    const [lo, hi] = prediction?.prediction?.confidence_interval ?? [fib * 0.8, fib * 1.2];
    forecast = [Math.max(0, Math.round(lo)), Math.max(0, Math.round((lo + hi) / 2)), Math.max(0, Math.round(hi))];
  }

  const riskLevel = prediction?.prediction?.risk_level;
  let advisory: string | undefined;
  if (riskLevel === 'unsafe') {
    advisory = 'Water quality is poor. Do not swim, wade, or surf in this area.';
  } else if (riskLevel === 'caution') {
    advisory = 'Moderate water quality. Sensitive groups should avoid water contact.';
  }

  const historyForStation =
    dailyPredictionHistory?.[station.code] ??
    dailyPredictionHistory?.[station.name] ??
    [];

  const todayPt = getPacificDateString();
  const todaySnap = historyForStation.find((h) => h.date === todayPt);
  const todaySixAmSnapshotMpn =
    todaySnap != null ? Math.round(todaySnap.mpn) : null;
  const labMpn = Math.round(Math.max(0, station.latestResult));

  return {
    id: station.code,
    name: station.name,
    address: `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`,
    score,
    trend: 'stable',
    forecast,
    fib: Math.round(fib),
    temp,
    swell,
    wind,
    tested: formatTimeAgo(station.latestDate),
    rainfall48h: Math.round(rainfall48h * 10) / 10,
    drainProximity: 'none',
    tidePhase,
    advisory,
    lat: station.latitude,
    lng: station.longitude,
    area: 'California Beaches',
    region: 'Statewide',
    stationCode: station.code,
    labMpn,
    todaySixAmSnapshotMpn,
    dailyPredictionHistory:
      historyForStation.length > 0 ? historyForStation : undefined,
  };
}

/**
 * Transforms stations into a single area "California Beaches" for the Platform UI.
 */
export function transformStationsToArea(
  stations: StationSummary[],
  selectedStation: StationSummary | null,
  prediction: PredictionResult | null,
  envData: EnvironmentalData | null,
  forecastData?: any,
  dailyPredictionHistory?: PredictionHistoryByStation | null
): AreaData {
  const sites = stations.map((s) => {
    const isSelected = s.code === selectedStation?.code;
    return transformStationToSite(
      s,
      isSelected ? prediction : null,
      isSelected ? envData : null,
      isSelected ? forecastData : undefined,
      dailyPredictionHistory ?? null
    );
  });
  return {
    id: 'california',
    name: 'California Beaches',
    region: 'Statewide',
    sites,
  };
}
