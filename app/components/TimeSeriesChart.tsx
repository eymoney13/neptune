'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { WaterQualityRecord } from '@/lib/types';
import { parseNumeric } from '@/lib/data';

interface TimeSeriesChartProps {
  records: WaterQualityRecord[];
  stationName: string;
}

export default function TimeSeriesChart({ records, stationName }: TimeSeriesChartProps) {
  // Process records for chart
  const chartData = records.map(record => ({
    date: new Date(record.SampleDate).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    }),
    result: parseNumeric(record.Result),
    geoMean30: parseNumeric(record['30DayGeoMean']),
    geoMean6Week: parseNumeric(record['6WeekGeoMean']),
    rawDate: record.SampleDate,
  })).sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

  return (
    <div className="w-full h-full bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">{stationName}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
            labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Line 
            type="monotone" 
            dataKey="result" 
            stroke="#0ea5e9" 
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Sample Result"
          />
          <Line 
            type="monotone" 
            dataKey="geoMean30" 
            stroke="#10b981" 
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="30-Day Geo Mean"
          />
          <Line 
            type="monotone" 
            dataKey="geoMean6Week" 
            stroke="#f59e0b" 
            strokeWidth={2}
            strokeDasharray="3 3"
            dot={false}
            name="6-Week Geo Mean"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
