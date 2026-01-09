import { memo, useMemo } from 'react';
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
import type { PoolMetrics } from '../types/metrics';
import { useSettings, formatTime } from '../hooks/useMetrics';

interface TrendChartProps {
  data: PoolMetrics[];
  height?: number;
}

export const TrendChart = memo(function TrendChart({ data, height = 300 }: TrendChartProps) {
  const { settings } = useSettings();
  const timezone = settings?.timezone || 'Local';

  const chartData = useMemo(() => data.map((d) => ({
    time: formatTime(d.timestamp, timezone),
    active: d.active,
    idle: d.idle,
    pending: d.pending,
  })), [data, timezone]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
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
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Line
          type="monotone"
          dataKey="active"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          name="Active"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="idle"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          name="Idle"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="pending"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          name="Pending"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});
