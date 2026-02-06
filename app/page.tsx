'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { StationSummary, WaterQualityRecord, PredictionResult, EnvironmentalData } from '@/lib/types';
import { getCachedStationSummaries, loadCSVData, getStationRecords } from '@/lib/data';
import Insights from './components/Insights';

// Dynamically import Map to avoid SSR issues with Leaflet
const Map = dynamic(() => import('./components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
      <p className="text-gray-500">Loading map...</p>
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
  const [viewMode, setViewMode] = useState<'nowcast' | 'forecast'>('nowcast');
  const [forecastDays, setForecastDays] = useState(1);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setLoadingProgress('Loading water quality data from API...');
        
        // Add a small delay to ensure UI updates
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Load data incrementally with progress updates and display stations as they load
        const summaries = await getCachedStationSummaries(
          (loaded, total) => {
            if (total) {
              setLoadingProgress(`Loading stations: ${loaded} of ${total}...`);
            } else {
              setLoadingProgress(`Loading stations: ${loaded}...`);
            }
          },
          (batchSummaries) => {
            // Update stations state incrementally as batches are loaded
            setStations(prev => {
              const combined = [...prev, ...batchSummaries];
              // Remove duplicates based on station code
              const unique = combined.filter((station, index, self) =>
                index === self.findIndex(s => s.code === station.code)
              );
              return unique;
            });
            
            // Set first station if we don't have one selected yet
            if (!selectedStation && batchSummaries.length > 0) {
              setSelectedStation(batchSummaries[0]);
            }
          }
        );
        
        // Final update with all summaries (in case of duplicates)
        setStations(summaries);
        
        if (summaries.length > 0 && !selectedStation) {
          setSelectedStation(summaries[0]);
        }
        
        setLoadingProgress('Complete!');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setError(errorMessage);
        console.error('Error loading data:', err);
        
        // Provide more helpful error message
        if (errorMessage.includes('Failed to') || errorMessage.includes('Not Found') || errorMessage.includes('404') || errorMessage.includes('API request failed')) {
          const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
          
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

  // Load predictions and environmental data when station changes
  useEffect(() => {
    async function loadPrediction() {
      if (!selectedStation) return;

      setLoadingPrediction(true);
      try {
        // Load environmental data first
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
            // Continue even if env data fails - prediction can use defaults
          }
        } catch (err) {
          console.error('Error fetching environmental data:', err);
          // Continue even if env data fails
        }

        // Then get prediction
        try {
          const predResponse = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              station_code: selectedStation.code,
              latitude: selectedStation.latitude,
              longitude: selectedStation.longitude,
              use_env_data: true,
              use_mock_model: true, // Set to false when real models are available
            }),
          });

          if (predResponse.ok) {
            const predResult = await predResponse.json();
            setPrediction(predResult);
          } else {
            const errorData = await predResponse.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Prediction API error:', errorData);
            // Set error state so user knows prediction failed
            setPrediction(null);
          }
        } catch (err) {
          console.error('Error fetching prediction:', err);
          setPrediction(null);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-gray-600 font-medium mb-2">Loading water quality data...</p>
          <p className="text-sm text-gray-500">{loadingProgress}</p>
          <p className="text-xs text-gray-400 mt-4">
            Loading data from California Data Portal API. This may take a minute...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Error Loading Data</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            The app fetches data from the California Data Portal API. Check the browser console for details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#01395E' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 shadow-sm" style={{ backgroundColor: '#01395E' }}>
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            {/* Logo */}
            <div className="flex items-center">
              <Image
                src="/logo.jpg"
                alt="Project Neptune"
                width={64}
                height={64}
                className="h-16 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Map on Left, Insights on Right */}
      <main className="h-[calc(100vh-5rem)] flex">
        {/* Left Side: Map */}
        <div className="flex-1 p-4">
          <div className="h-full bg-white rounded-xl shadow-sm overflow-hidden">
            <Map
              stations={stations}
              selectedStation={selectedStation}
              onStationSelect={handleStationSelect}
              viewMode={viewMode}
              forecastDays={forecastDays}
              onViewModeChange={setViewMode}
              onForecastDaysChange={setForecastDays}
            />
          </div>
        </div>

        {/* Right Side: Insights Column */}
        <div className="w-96 p-4">
          <div className="h-full">
            <Insights
              selectedStation={selectedStation}
              prediction={prediction}
              envData={envData}
              stations={stations}
              onStationSelect={handleStationSelect}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Data source: BeachWatch Program | Fecal Coliform measurements in CFU/100mL
            </p>
            {/* Legend */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#10b981]"></div>
                <span className="text-gray-700">Safe (&lt;70 CFU/100mL)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#f59e0b]"></div>
                <span className="text-gray-700">Poor (70-104 CFU/100mL)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#ef4444]"></div>
                <span className="text-gray-700">Unsafe (&gt;104 CFU/100mL)</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
