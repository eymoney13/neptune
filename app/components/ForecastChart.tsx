'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { WaterQualityRecord } from '@/lib/types';
import { PredictionResult } from '@/lib/types';
import { parseNumeric, getWaterQualityColor } from '@/lib/data';

interface ForecastChartProps {
  historicalRecords: WaterQualityRecord[];
  prediction: PredictionResult | null;
  stationName: string;
}

export default function ForecastChart({ historicalRecords, prediction, stationName }: ForecastChartProps) {
  // Helper function to normalize dates to YYYY-MM-DD format for comparison
  // Handles timezone issues by using UTC
  const normalizeDate = (dateString: string): string => {
    const date = new Date(dateString);
    // Use UTC to avoid timezone issues
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Process historical data
  const historicalData = historicalRecords
    .map(record => {
      const recordDate = new Date(record.SampleDate);
      const normalizedDate = normalizeDate(record.SampleDate);
      return {
        date: recordDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        }),
        result: parseNumeric(record.Result),
        type: 'historical' as const,
        rawDate: record.SampleDate,
        normalizedDate: normalizedDate, // YYYY-MM-DD format for comparison
      };
    })
    .sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

  // Create a set of historical dates (normalized format) for quick lookup
  const historicalDates = new Set(
    historicalData.map(d => d.normalizedDate)
  );

  // Determine if prediction should be shown
  // Only show if there's NO historical data for that exact date
  let predictionData: typeof historicalData[0] | null = null;
  let shouldShowPrediction = false;
  
  if (prediction?.success && prediction.prediction) {
    const predDate = new Date(prediction.prediction.prediction_date);
    const predNormalizedDate = normalizeDate(prediction.prediction.prediction_date);
    
    // Check if there's any historical data for this exact date
    const hasHistoricalForDate = historicalDates.has(predNormalizedDate);
    
    // Only show prediction if there's NO historical data for this date
    // (We don't want to show predictions when we have actual test results)
    if (!hasHistoricalForDate) {
      shouldShowPrediction = true;
      predictionData = {
        date: predDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        }),
        result: prediction.prediction.fecal_coliform_cfu,
        type: 'prediction' as const,
        rawDate: prediction.prediction.prediction_date,
        normalizedDate: predNormalizedDate,
      };
    }
  }

  // Combine historical and prediction data (if prediction should be shown)
  const allChartData = predictionData 
    ? [...historicalData, predictionData]
    : [...historicalData];
  
  // Sort by date
  const sortedChartData = allChartData.sort((a, b) => 
    new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime()
  );

  // Get the last few data points for better visualization
  const recentData = sortedChartData.slice(-30); // Last 30 points

  const predictionColor = prediction?.prediction 
    ? getWaterQualityColor(prediction.prediction.fecal_coliform_cfu)
    : '#0ea5e9';

  return (
    <div className="w-full h-full bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        {stationName} - Historical vs Predicted
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={recentData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: '#666' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: '#666' }}
            label={{ value: 'CFU/100 mL', angle: -90, position: 'insideLeft', style: { fill: '#666' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px',
            }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          
          {/* Threshold lines */}
          <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Poor (70)", position: "right" }} />
          <ReferenceLine y={104} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Unsafe (104)", position: "right" }} />
          
          {/* Historical data line - only show historical points */}
          <Line 
            type="monotone" 
            dataKey="result" 
            stroke="#0ea5e9" 
            strokeWidth={2}
            dot={(props: any) => {
              const point = recentData[props.index];
              if (point && point.type === 'historical') {
                return <circle cx={props.cx} cy={props.cy} r={4} fill="#0ea5e9" />;
              }
              return null;
            }}
            name="Historical"
            connectNulls={false}
            isAnimationActive={false}
          />
          
          {/* Prediction point - only show if no historical data for that date */}
          {shouldShowPrediction && (
            <Line
              type="monotone"
              dataKey="result"
              stroke={predictionColor}
              strokeWidth={0}
              dot={(props: any) => {
                const point = recentData[props.index];
                if (point && point.type === 'prediction') {
                  return <circle cx={props.cx} cy={props.cy} r={8} fill={predictionColor} stroke="white" strokeWidth={2} />;
                }
                return null;
              }}
              name="Prediction"
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      
      {shouldShowPrediction && prediction?.success && prediction.prediction && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Predicted:</span>{' '}
            {prediction.prediction.fecal_coliform_cfu.toFixed(1)} CFU/100mL
            {' '}({prediction.prediction.risk_level})
            {' '}- Confidence: {prediction.prediction.confidence_interval[0].toFixed(1)} to {prediction.prediction.confidence_interval[1].toFixed(1)} CFU/100mL
          </p>
        </div>
      )}
    </div>
  );
}
