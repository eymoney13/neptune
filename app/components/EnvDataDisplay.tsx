'use client';

import { EnvironmentalData } from '@/lib/types';

interface EnvDataDisplayProps {
  envData: EnvironmentalData | null;
  isLoading?: boolean;
  latitude?: number;
  longitude?: number;
}

export default function EnvDataDisplay({ envData, isLoading, latitude, longitude }: EnvDataDisplayProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Environmental Conditions</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!envData || !envData.success) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Environmental Conditions</h3>
        <p className="text-sm text-red-600">
          {envData?.error || 'Unable to load environmental data'}
        </p>
      </div>
    );
  }

  const { predictors, sources } = envData;

  // Convert water temperature from Celsius to Fahrenheit
  const waterTempFahrenheit = predictors.temperature ? (predictors.temperature * 9/5) + 32 : null;

  // Determine if wind is onshore or offshore
  // For California coast (roughly north-south, ocean to the west):
  // - Onshore: wind coming FROM ocean (west), blowing TOWARD land (east)
  //   Wind directions: 180°-360° (south through west to north)
  // - Offshore: wind coming FROM land (east), blowing TOWARD ocean (west)
  //   Wind directions: 0°-180° (north through east to south)
  const getWindType = (windDirection?: number): string => {
    if (windDirection === undefined || windDirection === null) return '';
    
    // Normalize direction to 0-360
    const dir = ((windDirection % 360) + 360) % 360;
    
    // Onshore: wind from ocean (west side)
    // California coast faces west, so onshore = wind from 180° to 360° (south through west to north)
    if (dir >= 180 && dir < 360) {
      return ' (onshore)';
    }
    // Offshore: wind from land (east side)
    // Offshore = wind from 0° to 180° (north through east to south)
    else if (dir >= 0 && dir < 180) {
      return ' (offshore)';
    }
    
    return '';
  };

  const windType = getWindType(predictors.wind_direction);
  const windSpeedLabel = `Wind Speed${windType}`;

  const dataPoints = [
    { label: 'Rainfall (24h)', value: predictors.rainfall_24h, unit: 'mm', source: sources?.weather },
    { label: 'Rainfall (48h)', value: predictors.precipitation_48h, unit: 'mm', source: sources?.weather },
    { label: 'Wave Height', value: predictors.wave_height, unit: 'm', source: sources?.waves },
    { label: 'Wave Period', value: predictors.wave_period, unit: 's', source: sources?.waves },
    { label: 'Tide Level', value: predictors.tide_level, unit: 'm', source: sources?.tide },
    { label: 'Water Temperature', value: waterTempFahrenheit, unit: '°F', source: sources?.temperature },
    { label: windSpeedLabel, value: predictors.wind_speed, unit: 'm/s', source: sources?.weather },
  ];

  const getSourceBadgeColor = (source?: string) => {
    if (!source || source === 'error') return 'bg-red-100 text-red-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Environmental Conditions</h3>
      <div className="space-y-3">
        {dataPoints.map((item, index) => {
          // Round water temperature to nearest whole number, others keep 2 decimals
          const displayValue = item.label === 'Water Temperature' && typeof item.value === 'number'
            ? Math.round(item.value)
            : typeof item.value === 'number'
            ? item.value.toFixed(2)
            : item.value;
          
          return (
            <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div className="flex-1">
                <span className="text-sm text-gray-700">{item.label}</span>
                {item.source && (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${getSourceBadgeColor(item.source)}`}>
                    {item.source}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-gray-900">
                {displayValue} {item.unit}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 mt-4">
        Updated: {new Date(envData.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
