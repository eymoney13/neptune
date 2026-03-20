export interface WaterQualityRecord {
  Program: string;
  ParentProject: string;
  Project: string;
  StationName: string;
  StationCode: string;
  SampleDate: string;
  CollectionTime: string;
  LocationCode: string;
  TargetLatitude: string;
  TargetLongitude: string;
  Analyte: string;
  Unit: string;
  Result: string;
  '30DayGeoMean': string;
  '30DayCount': string;
  '6WeekGeoMean': string;
  '6WeekCount': string;
  ResultQualCode?: string;
}

export interface Station {
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  region?: string;
  records: WaterQualityRecord[];
}

export interface StationSummary {
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  latestResult: number;
  latestDate: string;
  avg30Day: number;
  avg6Week: number;
  recordCount: number;
}

// Prediction types
export interface PredictionRequest {
  station_code: string;
  latitude: number;
  longitude: number;
  use_env_data?: boolean;
  use_mock_model?: boolean;
  antecedent_fib?: number;
  predictors?: {
    rainfall_24h?: number;
    precipitation_48h?: number;
    wave_height?: number;
    wave_period?: number;
    tide_level?: number;
    temperature?: number;
    wind_speed?: number;
  };
}

export interface PredictionResult {
  success: boolean;
  station_code: string;
  prediction: {
    fecal_coliform_cfu: number;
    confidence_interval: [number, number];
    risk_level: 'safe' | 'caution' | 'unsafe';
    prediction_date: string;
  };
  model_info: {
    model_type: string;
    model_file?: string;
    use_mock?: boolean;
  };
  error?: string;
}

/** One row of stored daily 6AM PT Enterococcus model snapshot (for accuracy tracking) */
export interface DailyPredictionHistoryEntry {
  date: string;
  mpn: number;
  ciLow: number | null;
  ciHigh: number | null;
  riskLevel: string | null;
}

export type PredictionHistoryByStation = Record<string, DailyPredictionHistoryEntry[]>;

export interface EnvironmentalData {
  success: boolean;
  predictors: {
    rainfall_24h: number;
    precipitation_48h: number;
    wave_height: number;
    wave_period: number;
    tide_level: number;
    temperature: number;
    wind_speed: number;
    wind_direction?: number;  // Degrees (0-360, 0=North, 90=East, 180=South, 270=West)
  };
  timestamp: string;
  sources?: {
    tide?: string;
    temperature?: string;
    waves?: string;
    weather?: string;
  };
  error?: string;
}
