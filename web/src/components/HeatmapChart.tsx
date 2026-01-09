import { memo, useMemo } from 'react';
import type { PoolMetrics } from '../types/metrics';
import { useSettings } from '../hooks/useMetrics';

interface HeatmapChartProps {
  data: PoolMetrics[];
  maxValue?: number;
}

// Helper function to get hour in specified timezone
function getHourInTimezone(timestamp: string, timezone: string): number {
  const date = new Date(timestamp);

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

export const HeatmapChart = memo(function HeatmapChart({ data, maxValue: propMaxValue }: HeatmapChartProps) {
  const { settings } = useSettings();
  const timezone = settings?.timezone || 'Local';

  const { heatmapData, maxValue } = useMemo(() => {
    // Group data by hour (0-23) and calculate average usage
    const hourlyData: { [hour: number]: { total: number; count: number; max: number } } = {};

    for (let i = 0; i < 24; i++) {
      hourlyData[i] = { total: 0, count: 0, max: 0 };
    }

    data.forEach((d) => {
      const hour = getHourInTimezone(d.timestamp, timezone);
      const usage = d.max > 0 ? (d.active / d.max) * 100 : 0;
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
    if (intensity < 0.25) return '#dcfce7'; // green-100
    if (intensity < 0.5) return '#86efac';  // green-300
    if (intensity < 0.75) return '#fde047'; // yellow-300
    if (intensity < 0.9) return '#fb923c';  // orange-400
    return '#ef4444'; // red-500
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
        Hourly Usage Heatmap (avg %)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
        {heatmapData.map((item) => (
          <div
            key={item.hour}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: item.count > 0 ? getColor(item.avgUsage) : '#f3f4f6',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
            }}
            title={`${formatHour(item.hour)}: avg ${item.avgUsage.toFixed(1)}%, peak ${item.peakUsage.toFixed(1)}%`}
          >
            <span style={{ fontSize: '10px', color: '#374151', fontWeight: 500 }}>
              {item.hour}
            </span>
            <span style={{ fontSize: '8px', color: '#6b7280' }}>
              {item.count > 0 ? `${item.avgUsage.toFixed(0)}%` : '-'}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
        <span style={{ fontSize: '10px', color: '#6b7280' }}>Low</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {['#dcfce7', '#86efac', '#fde047', '#fb923c', '#ef4444'].map((color) => (
            <div
              key={color}
              style={{
                width: '16px',
                height: '8px',
                backgroundColor: color,
                borderRadius: '2px',
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: '10px', color: '#6b7280' }}>High</span>
      </div>
    </div>
  );
});
