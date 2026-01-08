import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ComparisonChartProps {
  targetNames: string[];
  range?: string;
}

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface HistoryData {
  datapoints: Array<{
    timestamp: string;
    active: number;
    idle: number;
    pending: number;
    max: number;
  }>;
}

export function ComparisonChart({ targetNames, range = '1h' }: ComparisonChartProps) {
  const [data, setData] = useState<{ [key: string]: HistoryData }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const results: { [key: string]: HistoryData } = {};

      await Promise.all(
        targetNames.map(async (name) => {
          try {
            const res = await fetch(`/api/targets/${name}/history?range=${range}`);
            if (res.ok) {
              results[name] = await res.json();
            }
          } catch (err) {
            console.error(`Failed to fetch history for ${name}:`, err);
          }
        })
      );

      setData(results);
      setLoading(false);
    };

    fetchAll();
  }, [targetNames, range]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
        Loading comparison data...
      </div>
    );
  }

  // Merge all data points by timestamp
  const timeMap = new Map<string, Record<string, number>>();

  targetNames.forEach((name) => {
    const history = data[name];
    if (!history?.datapoints) return;

    history.datapoints.forEach((dp) => {
      const time = new Date(dp.timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const usage = dp.max > 0 ? (dp.active / dp.max) * 100 : 0;

      if (!timeMap.has(time)) {
        timeMap.set(time, { time: time as unknown as number });
      }
      timeMap.get(time)![name] = Math.round(usage * 10) / 10;
    });
  });

  const chartData = Array.from(timeMap.values()).sort((a, b) => {
    const timeA = a.time as unknown as string;
    const timeB = b.time as unknown as string;
    return timeA.localeCompare(timeB);
  });

  if (chartData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
        No comparison data available
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
        Usage Comparison (%)
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
          <YAxis stroke="#6b7280" fontSize={11} domain={[0, 100]} unit="%" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '11px',
              padding: '8px 10px',
            }}
            labelStyle={{ fontSize: '11px', marginBottom: '4px' }}
            itemStyle={{ fontSize: '11px', padding: '2px 0' }}
            formatter={(value) => [`${value}%`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          {targetNames.map((name, index) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
