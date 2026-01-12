import { memo, useMemo } from 'react';
import type { PoolMetrics } from '../types/metrics';
import { useSettings } from '../hooks/useMetrics';
import { useTheme } from '../context/ThemeContext';

interface HeatmapChartProps {
  data: PoolMetrics[];
  maxValue?: number;
  targetName?: string;
}

// Helper function to get hour in specified timezone
function getHourInTimezone(timestamp: string | undefined | null, timezone: string): number {
  if (!timestamp) return 0;

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 0;

  if (timezone === 'Local' || timezone === '') {
    return date.getHours();
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone === 'UTC' ? 'UTC' : timezone,
    });
    const hour = parseInt(formatter.format(date), 10);
    return hour === 24 ? 0 : hour;
  } catch {
    return date.getHours();
  }
}

export const HeatmapChart = memo(function HeatmapChart({ data, maxValue: propMaxValue, targetName }: HeatmapChartProps) {
  const { settings } = useSettings();
  const { theme, colors } = useTheme();
  const timezone = settings?.timezone || 'Local';

  // Theme-aware color palettes
  const heatmapColors = useMemo(() => theme === 'dark'
    ? ['#166534', '#22c55e', '#eab308', '#f97316', '#dc2626'] // darker for dark mode
    : ['#dcfce7', '#86efac', '#fde047', '#fb923c', '#ef4444'], // lighter for light mode
  [theme]);

  const { heatmapData, maxValue } = useMemo(() => {
    // Group data by hour (0-23) and calculate average usage
    const hourlyData: { [hour: number]: { total: number; count: number; max: number } } = {};

    for (let i = 0; i < 24; i++) {
      hourlyData[i] = { total: 0, count: 0, max: 0 };
    }

    if (!data || !Array.isArray(data)) {
      const result = Object.entries(hourlyData).map(([hour]) => ({
        hour: parseInt(hour),
        avgUsage: 0,
        peakUsage: 0,
        count: 0,
      }));
      return { heatmapData: result, maxValue: 1 };
    }

    data.filter((d) => d && d.timestamp).forEach((d) => {
      const hour = getHourInTimezone(d.timestamp, timezone);
      const usage = d.max > 0 ? ((d.active ?? 0) / d.max) * 100 : 0;
      hourlyData[hour].total += usage;
      hourlyData[hour].count += 1;
      hourlyData[hour].max = Math.max(hourlyData[hour].max, usage);
    });

    const result = Object.entries(hourlyData).map(([hour, stats]) => ({
      hour: parseInt(hour),
      avgUsage: stats.count > 0 ? stats.total / stats.count : 0,
      peakUsage: stats.max,
      count: stats.count,
    }));

    const max = propMaxValue ?? Math.max(...result.map((r) => r.avgUsage), 1);

    return { heatmapData: result, maxValue: max };
  }, [data, propMaxValue, timezone]);

  const getColor = (value: number) => {
    const intensity = Math.min(value / maxValue, 1);
    if (intensity < 0.25) return heatmapColors[0];
    if (intensity < 0.5) return heatmapColors[1];
    if (intensity < 0.75) return heatmapColors[2];
    if (intensity < 0.9) return heatmapColors[3];
    return heatmapColors[4];
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  // Text color for heatmap cells based on background intensity
  const getCellTextColor = (value: number) => {
    const intensity = Math.min(value / maxValue, 1);
    if (theme === 'dark') {
      return intensity > 0.5 ? '#ffffff' : '#e5e7eb';
    }
    return intensity > 0.75 ? '#ffffff' : '#374151';
  };

  return (
    <div>
      <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>
        Hourly Usage Heatmap (avg %)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
        {heatmapData.map((item) => (
          <div
            key={item.hour}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: item.count > 0 ? getColor(item.avgUsage) : colors.bgSecondary,
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
            }}
            title={`${targetName ? `[${targetName}] ` : ''}${formatHour(item.hour)}: avg ${item.avgUsage.toFixed(1)}%, peak ${item.peakUsage.toFixed(1)}%`}
          >
            <span style={{ fontSize: '10px', color: item.count > 0 ? getCellTextColor(item.avgUsage) : colors.textSecondary, fontWeight: 500 }}>
              {item.hour}
            </span>
            <span style={{ fontSize: '8px', color: item.count > 0 ? getCellTextColor(item.avgUsage) : colors.textSecondary, opacity: 0.8 }}>
              {item.count > 0 ? `${item.avgUsage.toFixed(0)}%` : '-'}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
        <span style={{ fontSize: '10px', color: colors.textSecondary }}>Low</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {heatmapColors.map((color, idx) => (
            <div
              key={idx}
              style={{
                width: '16px',
                height: '8px',
                backgroundColor: color,
                borderRadius: '2px',
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: '10px', color: colors.textSecondary }}>High</span>
      </div>
    </div>
  );
});
