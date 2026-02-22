import type { StationSummary, PredictionResult, EnvironmentalData } from './types';

// ── SCORE TIERS (95–100 Excellent, 85–94 Good, 70–84 Fair, 50–69 Caution, 30–49 Poor, 0–29 Unsafe) ──
export const TIERS = [
  { min: 95, label: 'Excellent', desc: 'Pristine conditions', color: '#00D68F' },
  { min: 85, label: 'Good', desc: 'Safe for all activities', color: '#00D68F' },
  { min: 70, label: 'Fair', desc: 'Generally safe', color: '#FFB800' },
  { min: 50, label: 'Caution', desc: 'Sensitive groups should avoid', color: '#FF8C00' },
  { min: 30, label: 'Poor', desc: 'Swimming not recommended', color: '#FF5733' },
  { min: 0, label: 'Unsafe', desc: 'Avoid all water contact', color: '#FF3B5C' },
] as const;

export function getTier(score: number) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}

export function getColor(score: number) {
  return getTier(score).color;
}

/**
 * Converts CFU (fecal coliform) to a 0–100 safety score.
 * Output maps to tier ranges: 95–100 Excellent, 85–94 Good, 70–84 Fair, 50–69 Caution, 30–49 Poor, 0–29 Unsafe.
 */
export function cfuToScore(cfu: number): number {
  if (cfu <= 10) return Math.round(100 - (cfu / 10) * 5); // 95–100 Excellent
  if (cfu <= 35) return Math.round(94 - ((cfu - 10) / 25) * 10); // 85–94 Good
  if (cfu <= 70) return Math.round(84 - ((cfu - 35) / 35) * 15); // 70–84 Fair
  if (cfu <= 103) return Math.round(69 - ((cfu - 70) / 33) * 20); // 50–69 Caution
  if (cfu <= 200) return Math.round(49 - ((cfu - 103) / 97) * 20); // 30–49 Poor
  return Math.max(0, Math.round(29 - (cfu - 200) / 15)); // 0–29 Unsafe
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
  envData?: EnvironmentalData | null
): SiteData {
  const fib = prediction?.prediction?.fecal_coliform_cfu ?? station.latestResult;
  const score = cfuToScore(fib);

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

  const [lo, hi] = prediction?.prediction?.confidence_interval ?? [fib * 0.8, fib * 1.2];
  const f1 = Math.round(cfuToScore(lo));
  const f2 = Math.round(cfuToScore((lo + hi) / 2));
  const f3 = Math.round(cfuToScore(hi));
  const forecast = [Math.min(99, f1), Math.min(99, f2), Math.min(99, f3)];

  const riskLevel = prediction?.prediction?.risk_level;
  let advisory: string | undefined;
  if (riskLevel === 'unsafe') {
    advisory = 'Water quality is poor. Do not swim, wade, or surf in this area.';
  } else if (riskLevel === 'caution') {
    advisory = 'Moderate water quality. Sensitive groups should avoid water contact.';
  }

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
  };
}

/**
 * Transforms stations into a single area "California Beaches" for the Platform UI.
 */
export function transformStationsToArea(
  stations: StationSummary[],
  selectedStation: StationSummary | null,
  prediction: PredictionResult | null,
  envData: EnvironmentalData | null
): AreaData {
  const sites = stations.map((s) =>
    transformStationToSite(s, s.code === selectedStation?.code ? prediction : null, s.code === selectedStation?.code ? envData : null)
  );
  return {
    id: 'california',
    name: 'California Beaches',
    region: 'Statewide',
    sites,
  };
}
