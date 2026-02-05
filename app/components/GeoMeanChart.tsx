'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { StationSummary } from '@/lib/types';

interface GeoMeanChartProps {
  stations: StationSummary[];
  maxStations?: number;
}

export default function GeoMeanChart({ stations, maxStations = 10 }: GeoMeanChartProps) {
  // Get top N stations by record count
  const topStations = stations
    .filter(s => s.avg30Day > 0 || s.avg6Week > 0)
    .slice(0, maxStations);

  const chartData = topStations.map(station => ({
    name: station.name.length > 20 
      ? station.name.substring(0, 20) + '...' 
      : station.name,
    fullName: station.name,
    avg30Day: Math.round(station.avg30Day),
    avg6Week: Math.round(station.avg6Week),
  }));

  return (
    <div className="w-full h-full bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Geometric Means Comparison</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={100}
            tick={{ fontSize: 11, fill: '#666' }}
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
            formatter={(value: number, name: string) => [value, name]}
            labelFormatter={(label) => {
              const station = chartData.find(d => d.name === label);
              return station?.fullName || label;
            }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar dataKey="avg30Day" fill="#10b981" name="30-Day Geo Mean" radius={[4, 4, 0, 0]} />
          <Bar dataKey="avg6Week" fill="#f59e0b" name="6-Week Geo Mean" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
