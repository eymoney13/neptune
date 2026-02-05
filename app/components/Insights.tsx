'use client';

import { useState, useEffect, useCallback } from 'react';
import { StationSummary, PredictionResult, EnvironmentalData } from '@/lib/types';
import { getWaterQualityColor } from '@/lib/data';

interface InsightsProps {
  selectedStation: StationSummary | null;
  prediction: PredictionResult | null;
  envData: EnvironmentalData | null;
  stations: StationSummary[];
  onStationSelect: (station: StationSummary) => void;
}

interface FavoriteLocation {
  name: string;
  stationCode: string;
}

export default function Insights({ 
  selectedStation, 
  prediction, 
  envData, 
  stations,
  onStationSelect 
}: InsightsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [insights, setInsights] = useState<string>('');

  // Load favorites from localStorage
  useEffect(() => {
    const savedFavorites = localStorage.getItem('favoriteLocations');
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  const generateInsights = useCallback(() => {
    if (!selectedStation) {
      setInsights('');
      return;
    }

    // Generate insights even if prediction/envData is missing (use defaults)
    if (!prediction || !prediction.prediction) {
      setInsights('Waiting for prediction data...');
      return;
    }
    
    if (!envData) {
      setInsights('Waiting for environmental data...');
      return;
    }

    const cfu = prediction.prediction?.fecal_coliform_cfu || 0;
    const riskLevel = prediction.prediction?.risk_level || 'safe';
    const confidence = prediction.prediction?.confidence_interval || [0, 0];
    
    // Get environmental factors
    const temp = Math.round((envData.predictors.temperature * 9/5) + 32); // Convert to Fahrenheit
    const windSpeed = envData.predictors.wind_speed;
    const windDir = envData.predictors.wind_direction || 270;
    const rainfall24h = envData.predictors.rainfall_24h;
    const rainfall48h = envData.predictors.precipitation_48h;
    const waveHeight = envData.predictors.wave_height;
    const tideLevel = envData.predictors.tide_level;

    // Determine wind type
    const windType = (windDir >= 180 && windDir < 360) ? 'onshore' : 'offshore';
    
    // Generate AI-style insights
    let summary = '';
    let factors = '';
    let forecast = '';

    // Summary
    if (riskLevel === 'safe') {
      summary = `Clean conditions at ${selectedStation.name} with fecal coliform levels at ${cfu.toFixed(1)} CFU/100mL, well below the 70 CFU threshold. Water quality is in good shape for swimming and water activities.`;
    } else if (riskLevel === 'caution') {
      summary = `Moderate water quality at ${selectedStation.name} with ${cfu.toFixed(1)} CFU/100mL. Conditions are borderline, with levels between 70-104 CFU. Exercise caution, especially if you have sensitive skin or are immunocompromised.`;
    } else {
      summary = `Poor water quality conditions at ${selectedStation.name} with ${cfu.toFixed(1)} CFU/100mL, exceeding the 104 CFU safety threshold. Swimming is not recommended until conditions improve.`;
    }

    // Environmental factors
    const factorsList: string[] = [];
    
    if (rainfall24h > 5 || rainfall48h > 10) {
      factorsList.push(`Recent rainfall (${rainfall24h.toFixed(1)}mm in 24h, ${rainfall48h.toFixed(1)}mm in 48h) may be contributing to elevated bacterial levels through runoff.`);
    }
    
    if (windType === 'onshore' && windSpeed > 10) {
      factorsList.push(`Strong onshore winds (${windSpeed.toFixed(1)} mph) from the west are bringing ocean water toward shore, which may help disperse contaminants.`);
    } else if (windType === 'offshore' && windSpeed > 10) {
      factorsList.push(`Offshore winds (${windSpeed.toFixed(1)} mph) are pushing water away from shore, potentially concentrating pollutants near the beach.`);
    }
    
    if (waveHeight > 2) {
      factorsList.push(`Higher wave activity (${waveHeight.toFixed(1)}m) is increasing water mixing and aeration, which can help improve water quality.`);
    } else if (waveHeight < 0.5) {
      factorsList.push(`Calm conditions with minimal wave action (${waveHeight.toFixed(1)}m) may allow pollutants to accumulate near shore.`);
    }
    
    if (tideLevel < -0.5) {
      factorsList.push(`Low tide conditions may expose more of the beach area and concentrate any runoff or pollutants.`);
    } else if (tideLevel > 1.0) {
      factorsList.push(`High tide is bringing in fresh ocean water, which may help dilute any contaminants.`);
    }

    if (temp > 75) {
      factorsList.push(`Warm water temperature (${temp}°F) can promote bacterial growth, potentially affecting water quality.`);
    }

    if (factorsList.length === 0) {
      factors = 'Environmental conditions are relatively stable with no major factors significantly impacting water quality at this time.';
    } else {
      factors = factorsList.join(' ');
    }

    // Forecast
    const confidenceRange = confidence[1] - confidence[0];
    const isUncertain = confidenceRange > 50;
    
    if (riskLevel === 'safe') {
      forecast = `Water quality is expected to remain in the safe range over the next few days. Current conditions are stable, and the confidence interval (${confidence[0].toFixed(1)}-${confidence[1].toFixed(1)} CFU) suggests low variability. ${isUncertain ? 'However, keep an eye on weather changes, especially any significant rainfall that could impact conditions.' : 'Conditions should remain favorable for water activities.'}`;
    } else if (riskLevel === 'caution') {
      forecast = `Water quality is hovering in the caution zone and may fluctuate over the coming days. The confidence interval (${confidence[0].toFixed(1)}-${confidence[1].toFixed(1)} CFU) indicates some variability. ${rainfall24h > 2 ? 'With recent rainfall, conditions may improve as runoff clears, but monitor closely.' : 'Monitor conditions daily, especially if planning water activities.'}`;
    } else {
      forecast = `Poor water quality conditions are expected to persist. The confidence interval (${confidence[0].toFixed(1)}-${confidence[1].toFixed(1)} CFU) suggests levels will remain elevated. ${rainfall24h > 5 ? 'Recent heavy rainfall is likely the primary contributor, and conditions should improve as runoff clears over the next 2-3 days.' : 'Avoid water activities until conditions improve. Check back in 24-48 hours for updates.'}`;
    }

    const fullInsights = `${summary}\n\n${factors}\n\n${forecast}`;
    setInsights(fullInsights);
  }, [selectedStation, prediction, envData]);

  // Generate insights when station, prediction, or envData changes
  useEffect(() => {
    if (selectedStation) {
      generateInsights();
    } else {
      setInsights('');
    }
  }, [selectedStation, prediction, envData, generateInsights]);

  const addToFavorites = () => {
    if (!selectedStation) return;
    
    const newFavorite: FavoriteLocation = {
      name: selectedStation.name,
      stationCode: selectedStation.code,
    };
    
    const updatedFavorites = [...favorites, newFavorite];
    setFavorites(updatedFavorites);
    localStorage.setItem('favoriteLocations', JSON.stringify(updatedFavorites));
  };

  const removeFromFavorites = (stationCode: string) => {
    const updatedFavorites = favorites.filter(f => f.stationCode !== stationCode);
    setFavorites(updatedFavorites);
    localStorage.setItem('favoriteLocations', JSON.stringify(updatedFavorites));
  };

  const isFavorite = selectedStation ? favorites.some(f => f.stationCode === selectedStation.code) : false;

  const filteredStations = stations.filter(station =>
    station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    station.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const favoriteStations = showFavorites
    ? stations.filter(s => favorites.some(f => f.stationCode === s.code))
    : [];

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm">
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            placeholder="Search location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          />
          {selectedStation && (
            <button
              onClick={() => isFavorite ? removeFromFavorites(selectedStation.code) : addToFavorites()}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isFavorite
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isFavorite ? '★' : '☆'}
            </button>
          )}
        </div>

        {/* Favorites Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFavorites(!showFavorites)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showFavorites
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Favorites
          </button>
          {showFavorites && favoriteStations.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {favoriteStations.map((station) => (
                <button
                  key={station.code}
                  onClick={() => {
                    onStationSelect(station);
                    setSearchQuery('');
                  }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    selectedStation?.code === station.code
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {station.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchQuery && filteredStations.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-lg shadow-lg bg-white max-h-60 overflow-y-auto">
            {filteredStations.slice(0, 10).map((station) => (
              <button
                key={station.code}
                onClick={() => {
                  onStationSelect(station);
                  setSearchQuery('');
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getWaterQualityColor(station.latestResult) }}
                  />
                  <span className="font-medium">{station.name}</span>
                  <span className="text-gray-500 text-xs">({station.code})</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Insights Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedStation ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedStation.name}</h2>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: getWaterQualityColor(selectedStation.latestResult) }}
                />
                <span className="text-sm text-gray-600">
                  Latest: {selectedStation.latestResult.toFixed(1)} CFU/100mL
                </span>
              </div>
            </div>

            {/* Prediction Details */}
            {prediction && prediction.prediction && (
              <div className="mb-6 pb-6 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Prediction Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Predicted CFU:</span>
                    <span className="ml-2 font-semibold">{prediction.prediction.fecal_coliform_cfu.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Confidence:</span>
                    <span className="ml-2 font-semibold">
                      {prediction.prediction.confidence_interval[0].toFixed(1)} - {prediction.prediction.confidence_interval[1].toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Risk Level:</span>
                    <span className={`ml-2 font-semibold capitalize ${
                      prediction.prediction.risk_level === 'safe' ? 'text-green-600' :
                      prediction.prediction.risk_level === 'caution' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {prediction.prediction.risk_level}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Date:</span>
                    <span className="ml-2 font-semibold">
                      {new Date(prediction.prediction.prediction_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="prose prose-sm max-w-none">
              {insights ? (
                <div className="space-y-4 text-gray-700">
                  {insights.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Select a location on the map to view insights</p>
          </div>
        )}
      </div>
    </div>
  );
}
