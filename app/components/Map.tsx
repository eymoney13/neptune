'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { StationSummary } from '@/lib/types';
import { getWaterQualityColor } from '@/lib/data';

// Fix for default marker icons in Next.js
const iconRetinaUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png';
const iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png';
const shadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

interface MapProps {
  stations: StationSummary[];
  selectedStation?: StationSummary | null;
  onStationSelect?: (station: StationSummary) => void;
  viewMode?: 'nowcast' | 'forecast';
  forecastDays?: number;
  onViewModeChange?: (mode: 'nowcast' | 'forecast') => void;
  onForecastDaysChange?: (days: number) => void;
}

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    if (center && center[0] !== 0 && center[1] !== 0) {
      map.setView(center, 13);
    }
  }, [center, map]);

  return null;
}

export default function Map({ 
  stations, 
  selectedStation, 
  onStationSelect,
  viewMode = 'nowcast',
  forecastDays = 1,
  onViewModeChange,
  onForecastDaysChange
}: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [localViewMode, setLocalViewMode] = useState<'nowcast' | 'forecast'>(viewMode);
  const [localForecastDays, setLocalForecastDays] = useState(forecastDays);

  // Calculate center from stations or default to California coast
  const getCenter = (): [number, number] => {
    if (selectedStation && selectedStation.latitude !== 0 && selectedStation.longitude !== 0) {
      return [selectedStation.latitude, selectedStation.longitude];
    }
    if (stations.length > 0) {
      const avgLat = stations.reduce((sum, s) => sum + s.latitude, 0) / stations.length;
      const avgLon = stations.reduce((sum, s) => sum + s.longitude, 0) / stations.length;
      if (avgLat !== 0 && avgLon !== 0) {
        return [avgLat, avgLon];
      }
    }
    return [34.0522, -118.2437]; // Default to Los Angeles
  };

  const createCustomIcon = (result: number) => {
    const color = getWaterQualityColor(result);
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  const getHeatMapOpacity = (result: number): number => {
    // Higher CFU = higher opacity for heat map effect
    if (result < 70) return 0.15;
    if (result < 104) return 0.35;
    return 0.55;
  };

  const getHeatMapRadius = (result: number): number => {
    // Higher CFU = larger radius (in meters)
    if (result < 70) return 800;
    if (result < 104) return 1200;
    return 1800;
  };

  const handleViewModeChange = (mode: 'nowcast' | 'forecast') => {
    setLocalViewMode(mode);
    onViewModeChange?.(mode);
  };

  const handleForecastDaysChange = (days: number) => {
    setLocalForecastDays(days);
    onForecastDaysChange?.(days);
  };

  // Calculate forecast date based on current date + forecast days
  const getForecastDate = (daysAhead: number): string => {
    const today = new Date();
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + daysAhead);
    
    // Format as "Mon Jan 15" or "Jan 15" - using shorter format
    const options: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric' 
    };
    return forecastDate.toLocaleDateString('en-US', options);
  };

  return (
    <div className="w-full h-full rounded-lg overflow-hidden shadow-sm relative">
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-[1000] bg-white rounded-lg shadow-lg p-3 flex items-center gap-4">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleViewModeChange('nowcast')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              localViewMode === 'nowcast'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Nowcast
          </button>
          <button
            onClick={() => handleViewModeChange('forecast')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              localViewMode === 'forecast'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Forecast
          </button>
        </div>

        {/* Forecast Days Slider */}
        {localViewMode === 'forecast' && (
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <label className="text-sm text-gray-700 whitespace-nowrap">
              {getForecastDate(localForecastDays)}
            </label>
            <input
              type="range"
              min="1"
              max="3"
              value={localForecastDays}
              onChange={(e) => handleForecastDaysChange(parseInt(e.target.value))}
              className="w-24"
            />
          </div>
        )}
      </div>

      <MapContainer
        center={getCenter()}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController center={getCenter()} />
        
        {/* Heat Map Circles */}
        {stations.map((station) => {
          if (station.latitude === 0 || station.longitude === 0) return null;
          
          const color = getWaterQualityColor(station.latestResult);
          const opacity = getHeatMapOpacity(station.latestResult);
          const radius = getHeatMapRadius(station.latestResult);
          
          return (
            <Circle
              key={`heat-${station.code}`}
              center={[station.latitude, station.longitude]}
              radius={radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: opacity,
                color: 'transparent',
                weight: 0,
              }}
            />
          );
        })}

        {/* Station Markers */}
        {stations.map((station) => {
          if (station.latitude === 0 || station.longitude === 0) return null;
          
          return (
            <Marker
              key={station.code}
              position={[station.latitude, station.longitude]}
              icon={createCustomIcon(station.latestResult)}
              eventHandlers={{
                click: () => {
                  onStationSelect?.(station);
                },
              }}
            >
              <Popup>
                {(() => {
                  // Determine popup colors based on latest test result
                  const getPopupColors = (result: number) => {
                    if (result < 70) {
                      return 'bg-green-50 border-green-300';
                    } else if (result < 104) {
                      return 'bg-yellow-50 border-yellow-300';
                    } else {
                      return 'bg-red-50 border-red-300';
                    }
                  };
                  
                  const popupColors = getPopupColors(station.latestResult);
                  
                  return (
                    <div className={`p-3 min-w-[200px] rounded-lg border-2 ${popupColors}`}>
                      <h3 className="font-semibold text-sm mb-2">{station.name}</h3>
                      <div className="text-xs space-y-1 text-gray-700">
                        <p>Latest: {station.latestResult.toFixed(1)} {
                          station.latestResult < 70 ? '✓ Safe' : 
                          station.latestResult < 104 ? '⚠ Poor' : 
                          '✗ Unsafe'
                        }</p>
                        <p>Date: {new Date(station.latestDate).toLocaleDateString()}</p>
                        <p>30-day Avg: {station.avg30Day.toFixed(1)}</p>
                      </div>
                    </div>
                  );
                })()}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
