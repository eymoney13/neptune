'use client';

import { PredictionResult } from '@/lib/types';
import { getWaterQualityColor } from '@/lib/data';

interface PredictionCardProps {
  prediction: PredictionResult | null;
  stationName: string;
  isLoading?: boolean;
}

export default function PredictionCard({ prediction, stationName, isLoading }: PredictionCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (!prediction || !prediction.success || !prediction.prediction) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Prediction Error</h3>
        <p className="text-sm text-red-600">{prediction?.error || 'Failed to generate prediction'}</p>
      </div>
    );
  }

  const { prediction: pred } = prediction;
  const riskColor = getWaterQualityColor(pred.fecal_coliform_cfu);
  const riskLabels = {
    safe: 'Safe - Low risk',
    caution: 'Poor - Poor water quality',
    unsafe: 'Unsafe - Not recommended to swim',
  };

  // Determine card background and border colors based on risk level
  const getCardColors = (riskLevel: string) => {
    switch (riskLevel) {
      case 'safe':
        return 'bg-green-50 border-green-300';
      case 'caution':
        return 'bg-yellow-50 border-yellow-300';
      case 'unsafe':
        return 'bg-red-50 border-red-300';
      default:
        return 'bg-white border-gray-200';
    }
  };

  const cardColors = getCardColors(pred.risk_level);

  return (
    <div className={`rounded-xl shadow-sm border-2 ${cardColors} p-6`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{stationName}</h3>
          <p className="text-sm text-gray-500">Predicted Water Quality</p>
        </div>
        <div 
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: riskColor }}
          title={riskLabels[pred.risk_level]}
        />
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">
              {pred.fecal_coliform_cfu.toFixed(1)}
            </span>
            <span className="text-sm text-gray-600">CFU/100mL</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Confidence: {pred.confidence_interval[0].toFixed(1)} - {pred.confidence_interval[1].toFixed(1)} CFU/100mL
          </p>
        </div>

        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Risk Level:</span>
            <span 
              className="text-sm font-semibold px-3 py-1 rounded-full"
              style={{ 
                backgroundColor: `${riskColor}20`,
                color: riskColor 
              }}
            >
              {riskLabels[pred.risk_level]}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Predicted: {new Date(pred.prediction_date).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
