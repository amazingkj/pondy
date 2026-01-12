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
import { useTheme } from '../context/ThemeContext';

interface TrendChartProps {
  data: PoolMetrics[];
  height?: number;
  targetName?: string;
}

export const TrendChart = memo(function TrendChart({ data, height = 300, targetName }: TrendChartProps) {
  const { settings } = useSettings();
  const { theme, colors } = useTheme();
  const timezone = settings?.timezone || 'Local';

  const chartColors = useMemo(() => ({
    grid: theme === 'dark' ? '#374151' : '#e5e7eb',
    axis: theme === 'dark' ? '#9ca3af' : '#6b7280',
    tooltipBg: theme === 'dark' ? '#1f2937' : '#ffffff',
    tooltipBorder: theme === 'dark' ? '#374151' : '#e5e7eb',
    tooltipText: theme === 'dark' ? '#f9fafb' : '#111827',
    active: theme === 'dark' ? '#60a5fa' : '#3b82f6',
    idle: theme === 'dark' ? '#4ade80' : '#22c55e',
    pending: theme === 'dark' ? '#fbbf24' : '#f59e0b',
  }), [theme]);

  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data
      .filter((d) => d && d.timestamp)
      .map((d) => ({
        time: formatTime(d.timestamp, timezone),
        active: d.active ?? 0,
        idle: d.idle ?? 0,
        pending: d.pending ?? 0,
      }));
  }, [data, timezone]);

  if (chartData.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, color: colors.textSecondary, fontSize: '12px' }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
        <XAxis dataKey="time" stroke={chartColors.axis} fontSize={12} />
        <YAxis stroke={chartColors.axis} fontSize={12} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            return (
              <div
                style={{
                  backgroundColor: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: '8px',
                  fontSize: '11px',
                  padding: '8px 10px',
                  color: chartColors.tooltipText,
                }}
              >
                {targetName && (
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: chartColors.tooltipText }}>
                    {targetName}
                  </div>
                )}
                <div style={{ marginBottom: '4px', color: chartColors.tooltipText }}>{label}</div>
                {payload.map((entry, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color }} />
                    <span>{entry.name}: {entry.value}</span>
                  </div>
                ))}
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Line
          type="monotone"
          dataKey="active"
          stroke={chartColors.active}
          strokeWidth={2}
          dot={false}
          name="Active"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="idle"
          stroke={chartColors.idle}
          strokeWidth={2}
          dot={false}
          name="Idle"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="pending"
          stroke={chartColors.pending}
          strokeWidth={2}
          dot={false}
          name="Pending"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});
