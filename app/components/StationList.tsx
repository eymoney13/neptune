'use client';

import { useState } from 'react';
import { StationSummary } from '@/lib/types';
import StationCard from './StationCard';

interface StationListProps {
  stations: StationSummary[];
  selectedStation?: StationSummary | null;
  onStationSelect: (station: StationSummary) => void;
}

export default function StationList({ stations, selectedStation, onStationSelect }: StationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'result' | 'records'>('name');
  const [isFocused, setIsFocused] = useState(false);

  const filteredAndSorted = stations
    .filter(station => 
      station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      station.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'result':
          return b.latestResult - a.latestResult;
        case 'records':
          return b.recordCount - a.recordCount;
        default:
          return 0;
      }
    });

  const hasSearchQuery = searchQuery.trim().length > 0;
  const showDropdown = isFocused || hasSearchQuery;

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm relative">
      <div className="p-4">
        {/* Search */}
        <div>
          <input
            type="text"
            placeholder="Search stations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Sort - only show when there's a search query */}
        {hasSearchQuery && (
          <>
            <div className="flex items-center gap-2 mt-2">
              <label className="text-sm text-gray-600">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'result' | 'records')}
                className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              >
                <option value="name">Name</option>
                <option value="result">Latest Result</option>
                <option value="records">Sample Count</option>
              </select>
            </div>

            <div className="mt-3 text-sm text-gray-500">
              Showing {filteredAndSorted.length} of {stations.length} stations
            </div>
          </>
        )}
      </div>

      {/* Dropdown list - only show when focused or has search query */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto">
          {!hasSearchQuery ? (
            <div className="text-center text-gray-500 py-8 px-4">
              <p className="text-sm">Start typing to search for stations...</p>
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="text-center text-gray-500 py-8 px-4">
              <p className="text-sm">No stations found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredAndSorted.map((station) => (
                <StationCard
                  key={station.code}
                  station={station}
                  onClick={() => {
                    onStationSelect(station);
                    setIsFocused(false);
                    setSearchQuery('');
                  }}
                  selected={selectedStation?.code === station.code}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
