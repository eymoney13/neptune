'use client';

import { StationSummary } from '@/lib/types';
import { getWaterQualityColor } from '@/lib/data';

interface StationCardProps {
  station: StationSummary;
  onClick?: () => void;
  selected?: boolean;
}

export default function StationCard({ station, onClick, selected }: StationCardProps) {
  const statusColor = getWaterQualityColor(station.latestResult);
  const statusText = station.latestResult < 70 
    ? 'Safe - Low risk' 
    : station.latestResult < 104 
    ? 'Poor - Poor water quality' 
    : 'Unsafe - Not recommended to swim';

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-xl shadow-sm border transition-all cursor-pointer
        hover:shadow-md hover:scale-[1.02]
        ${selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200'}
      `}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-base text-gray-900 line-clamp-2 flex-1">
            {station.name}
          </h3>
          <div 
            className="ml-3 w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusColor }}
            title={statusText}
          />
        </div>
        
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span className="text-gray-500">Latest Reading:</span>
            <span className="font-medium text-gray-900">
              {station.latestResult.toFixed(1)} CFU/100mL
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">30-Day Avg:</span>
            <span className="font-medium text-gray-700">
              {station.avg30Day > 0 ? station.avg30Day.toFixed(1) : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">6-Week Avg:</span>
            <span className="font-medium text-gray-700">
              {station.avg6Week > 0 ? station.avg6Week.toFixed(1) : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="text-gray-500">Samples:</span>
            <span className="font-medium text-gray-700">{station.recordCount}</span>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-400">
          Last updated: {new Date(station.latestDate).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
