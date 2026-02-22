'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { StationSummary } from '@/lib/types';
import { cfuToScore, getColor } from '@/lib/platform-utils';

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
  theme?: 'light' | 'dark';
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
  onForecastDaysChange,
  theme = 'light',
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
    const score = cfuToScore(result);
    const color = getColor(score);
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

  const isDark = theme === 'dark';
  const controlsCls = isDark
    ? 'bg-[rgba(11,13,20,0.9)] border border-white/10 text-white'
    : 'bg-white shadow-lg text-gray-900';
  const btnActiveCls = isDark ? 'bg-[#00D68F] text-[#0a0d18]' : 'bg-primary-600 text-white';
  const btnInactiveCls = isDark
    ? 'bg-white/10 text-white/70 hover:bg-white/15'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  const sliderBorderCls = isDark ? 'border-white/10' : 'border-gray-200';
  const labelCls = isDark ? 'text-white/80' : 'text-gray-700';

  return (
    <div className="w-full h-full rounded-lg overflow-hidden shadow-sm relative">
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
                  const score = cfuToScore(station.latestResult);
                  const color = getColor(score);
                  const tier = score >= 95 ? 'Excellent' : score >= 85 ? 'Good' : score >= 70 ? 'Fair' : score >= 50 ? 'Caution' : score >= 30 ? 'Poor' : 'Unsafe';
                  return (
                    <div
                      className="p-3 min-w-[200px] rounded-lg border-2"
                      style={{
                        backgroundColor: `${color}15`,
                        borderColor: `${color}40`,
                      }}
                    >
                      <h3 className="font-semibold text-sm mb-2" style={{ color: '#0a0d18' }}>
                        {station.name}
                      </h3>
                      <div className="text-xs space-y-1" style={{ color: '#1a1e2e' }}>
                        <p>Latest Test Date: {new Date(station.latestDate).toLocaleDateString()}</p>
                        <p>Result: {station.latestResult.toFixed(1)} CFU</p>
                        <p>30 day avg: {station.avg30Day.toFixed(1)}</p>
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
