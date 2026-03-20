'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  StationSummary,
  WaterQualityRecord,
  PredictionResult,
  EnvironmentalData,
  type PredictionHistoryByStation,
} from '@/lib/types';
import { getCachedStationSummaries, loadCSVData, getStationRecords } from '@/lib/data';
import { transformStationsToArea, type SiteData } from '@/lib/platform-utils';
import { ListView, Legend, SiteDetail } from './components/PlatformUI';

// Dynamically import Map to avoid SSR issues with Leaflet
const Map = dynamic(() => import('./components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center rounded-lg platform-map-loading">
      <p className="text-platform-muted">Loading map...</p>
    </div>
  ),
});

export default function Home() {
  const [stations, setStations] = useState<StationSummary[]>([]);
  const [selectedStation, setSelectedStation] = useState<StationSummary | null>(null);
  const [stationRecords, setStationRecords] = useState<WaterQualityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<string>('Initializing...');
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [envData, setEnvData] = useState<EnvironmentalData | null>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [forecastData, setForecastData] = useState<any>(null);
  const [tab, setTab] = useState<'list' | 'map'>('list');
  const [predictionHistoryByStation, setPredictionHistoryByStation] =
    useState<PredictionHistoryByStation>({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setLoadingProgress('Loading water quality data from API...');

        await new Promise((resolve) => setTimeout(resolve, 100));

        const summaries = await getCachedStationSummaries(
          (loaded, total) => {
            if (total) {
              setLoadingProgress(`Loading stations: ${loaded} of ${total}...`);
            } else {
              setLoadingProgress(`Loading stations: ${loaded}...`);
            }
          },
          (batchSummaries) => {
            setStations((prev) => {
              const combined = [...prev, ...batchSummaries];
              const unique = combined.filter(
                (station, index, self) => index === self.findIndex((s) => s.code === station.code)
              );
              return unique;
            });

            if (!selectedStation && batchSummaries.length > 0) {
              setSelectedStation(batchSummaries[0]);
            }
          }
        );

        setStations(summaries);

        if (summaries.length > 0 && !selectedStation) {
          setSelectedStation(summaries[0]);
        }

        setLoadingProgress('Complete!');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setError(errorMessage);
        console.error('Error loading data:', err);

        if (
          errorMessage.includes('Failed to') ||
          errorMessage.includes('Not Found') ||
          errorMessage.includes('404') ||
          errorMessage.includes('API request failed')
        ) {
          const isProduction =
            typeof window !== 'undefined' && window.location.hostname !== 'localhost';

          if (isProduction) {
            setError(`Failed to load water quality data from API.

The app is now using the California Data Portal (CKAN) API instead of CSV files.

If you see this error:
1. Check that the API route is working: /api/water-quality
2. Verify the CKAN API is accessible
3. Check Vercel deployment logs for API errors
4. The API may be rate-limited - try again in a few minutes

Original error: ${errorMessage}`);
          } else {
            setError(`Failed to load water quality data.

The app is now using the California Data Portal (CKAN) API. 

If you see this error:
1. Make sure the dev server is running
2. Check that /api/water-quality endpoint is accessible
3. Verify your internet connection (API fetches from data.ca.gov)
4. Check browser console for detailed error messages

If the API is unavailable, the app will fall back to CSV file (if available).

Original error: ${errorMessage}`);
          }
        } else if (errorMessage.includes('too long') || errorMessage.includes('timeout')) {
          setError(`Data loading is taking longer than expected. This may be due to:
          - Large dataset size
          - Slow API response
          - Network connectivity issues
          
          Please wait a bit longer or try refreshing the page.
          
          Original error: ${errorMessage}`);
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/predictions/history?days=21');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && data.byStation && typeof data.byStation === 'object') {
          setPredictionHistoryByStation(data.byStation as PredictionHistoryByStation);
        }
      } catch {
        /* optional feature */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function loadStationRecords() {
      if (!selectedStation) return;

      try {
        const records = await loadCSVData();
        const stationData = getStationRecords(records, selectedStation.code);
        setStationRecords(stationData);
      } catch (err) {
        console.error('Error loading station records:', err);
      }
    }

    loadStationRecords();
  }, [selectedStation]);

  useEffect(() => {
    async function loadPrediction() {
      if (!selectedStation) return;

      setLoadingPrediction(true);
      try {
        try {
          const envResponse = await fetch(
            `/api/env-data?station_code=${encodeURIComponent(selectedStation.code)}&latitude=${selectedStation.latitude}&longitude=${selectedStation.longitude}`
          );
          if (envResponse.ok) {
            const envResult = await envResponse.json();
            setEnvData(envResult);
          } else {
            const errorData = await envResponse.json().catch(() => ({ error: 'Unknown error' }));
            console.warn('Environmental data API error:', errorData);
          }
        } catch (err) {
          console.error('Error fetching environmental data:', err);
        }

        try {
          const [predResponse, forecastResponse] = await Promise.all([
            fetch('/api/predict', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                station_code: selectedStation.code,
                latitude: selectedStation.latitude,
                longitude: selectedStation.longitude,
                use_env_data: true,
                use_mock_model: true,
                antecedent_fib: selectedStation.latestResult ?? undefined,
              }),
            }),
            fetch('/api/forecast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                station_code: selectedStation.code,
                latitude: selectedStation.latitude,
                longitude: selectedStation.longitude,
                antecedent_fib: selectedStation.latestResult ?? undefined,
                days: 3,
              }),
            }).catch(() => null),
          ]);

          if (predResponse.ok) {
            const predResult = await predResponse.json();
            setPrediction(predResult);
          } else {
            const errorData = await predResponse.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Prediction API error:', errorData);
            setPrediction(null);
          }

          if (forecastResponse?.ok) {
            const fcData = await forecastResponse.json();
            setForecastData(fcData);
          } else {
            setForecastData(null);
          }
        } catch (err) {
          console.error('Error fetching prediction:', err);
          setPrediction(null);
          setForecastData(null);
        }
      } catch (err) {
        console.error('Error loading prediction:', err);
      } finally {
        setLoadingPrediction(false);
      }
    }

    loadPrediction();
  }, [selectedStation]);

  const handleStationSelect = (station: StationSummary) => {
    setSelectedStation(station);
  };

  const handleSiteSelectFromList = (site: SiteData) => {
    const station = stations.find((s) => s.code === site.stationCode);
    if (station) setSelectedStation(station);
  };

  const area = transformStationsToArea(
    stations,
    selectedStation,
    prediction,
    envData,
    forecastData,
    predictionHistoryByStation
  );
  const selectedSite = selectedStation
    ? area.sites.find((s) => s.stationCode === selectedStation.code)
    : null;

  if (loading) {
    return (
      <div className="platform-loading-screen">
        <div className="platform-loading-content">
          <div className="platform-spinner" />
          <p className="platform-loading-text">Loading water quality data...</p>
          <p className="platform-loading-progress">{loadingProgress}</p>
          <p className="platform-loading-hint">
            Loading data from California Data Portal API. This may take a minute...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="platform-loading-screen">
        <div className="platform-error-content">
          <h1 className="platform-error-title">Error Loading Data</h1>
          <p className="platform-error-text">{error}</p>
          <p className="platform-error-hint">
            The app fetches data from the California Data Portal API. Check the browser console for
            details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="platform-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>

      <div className="platform-glow" />

      <div className="platform-container">
        <header className="platform-header">
          <div className="platform-header-top">
            <Image
              src="/logo.jpg"
              alt="Project Neptune"
              width={48}
              height={48}
              className="platform-logo"
            />
            <div className="platform-header-badge">
              <span className="platform-badge-dot" />
              Live · AI-Predicted Water Quality
            </div>
          </div>
          <h1 className="platform-title">California Beaches</h1>
          <p className="platform-subtitle">
            Water quality ratings across {area.sites.length} testing sites — predicted in real-time with
            3-day forecasts.
          </p>
        </header>

        <div className="platform-tabs">
          {[
            { k: 'list' as const, icon: '☰', l: 'List' },
            { k: 'map' as const, icon: '⊙', l: 'Map' },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`platform-tab ${tab === t.k ? 'platform-tab-active' : ''}`}
            >
              <span>{t.icon}</span> {t.l}
            </button>
          ))}
        </div>

        {tab === 'list' && <Legend />}

        {tab === 'list' ? (
          <ListView area={area} onStationSelect={handleSiteSelectFromList} />
        ) : (
          <div className="platform-map-layout">
            <div
              className="platform-map-wrapper"
              style={{ flex: selectedSite ? '1 1 55%' : '1 1 100%' }}
            >
              {!selectedSite && (
                <div className="platform-map-prompt">
                  Tap a site on the map to see details
                </div>
              )}
              <Map
                stations={stations}
                sites={area.sites}
                selectedStation={selectedStation}
                onStationSelect={handleStationSelect}
                theme="dark"
              />
            </div>
            {selectedSite && (
              <div className="platform-map-panel">
                <div className="platform-map-panel-inner">
                  <div className="platform-map-panel-header">
                    <div className="platform-map-panel-area">{selectedSite.area}</div>
                    <div className="platform-map-panel-name">{selectedSite.name}</div>
                    <div className="platform-map-panel-meta">
                      {selectedSite.address} · {selectedSite.tested}
                    </div>
                  </div>
                  <SiteDetail
                    site={selectedSite}
                    onClose={() => setSelectedStation(null)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
