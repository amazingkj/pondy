import { useState, useEffect, useRef, useMemo } from 'react';
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
import { useTheme } from '../context/ThemeContext';
import { useSettings, formatTime } from '../hooks/useMetrics';

type MetricType = 'usage' | 'cpu' | 'heap' | 'threads';

interface ComparisonChartProps {
  targetNames: string[];
  range?: string;
  metric?: MetricType;
}

const LIGHT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const DARK_COLORS = ['#60a5fa', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee', '#a3e635'];

interface HistoryData {
  datapoints: Array<{
    timestamp: string;
    active: number;
    idle: number;
    pending: number;
    max: number;
    heap_used: number;
    heap_max: number;
    threads_live: number;
    cpu_usage: number;
  }>;
}

const METRIC_CONFIG: Record<MetricType, { label: string; unit: string; color: string }> = {
  usage: { label: 'Pool Usage', unit: '%', color: '#3b82f6' },
  cpu: { label: 'CPU Usage', unit: '%', color: '#f59e0b' },
  heap: { label: 'Heap Usage', unit: '%', color: '#22c55e' },
  threads: { label: 'Live Threads', unit: '', color: '#8b5cf6' },
};

export function ComparisonChart({ targetNames, range = '1h', metric = 'usage' }: ComparisonChartProps) {
  const { theme, colors } = useTheme();
  const { settings } = useSettings();
  const chartLineColors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const timezone = settings?.timezone || 'Local';
  const [data, setData] = useState<{ [key: string]: HistoryData }>({});
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const prevDataRef = useRef<{ [key: string]: HistoryData }>({});

  // Create a stable key for targetNames to prevent unnecessary re-fetches
  const targetNamesKey = useMemo(() => [...targetNames].sort().join(','), [targetNames]);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      // Only show loading on initial load, not on polling updates
      if (initialLoad) {
        setLoading(true);
      }
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

      if (!cancelled) {
        prevDataRef.current = results;
        setData(results);
        setLoading(false);
        setInitialLoad(false);
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [targetNamesKey, range]);

  // Only show loading on initial load, use previous data otherwise
  if (loading && initialLoad) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
        Loading comparison data...
      </div>
    );
  }

  // Calculate metric value based on selected metric type
  const getMetricValue = (dp: HistoryData['datapoints'][0]): number => {
    switch (metric) {
      case 'usage':
        return dp.max > 0 ? (dp.active / dp.max) * 100 : 0;
      case 'cpu':
        return (dp.cpu_usage || 0) * 100;
      case 'heap':
        return dp.heap_max > 0 ? (dp.heap_used / dp.heap_max) * 100 : 0;
      case 'threads':
        return dp.threads_live || 0;
      default:
        return 0;
    }
  };

  // Merge all data points by timestamp
  const timeMap = new Map<string, Record<string, number>>();
  let maxValue = 0;

  targetNames.forEach((name) => {
    const history = data[name];
    if (!history?.datapoints) return;

    history.datapoints.forEach((dp) => {
      const time = formatTime(dp.timestamp, timezone);
      const value = getMetricValue(dp);
      maxValue = Math.max(maxValue, value);

      if (!timeMap.has(time)) {
        timeMap.set(time, { time: time as unknown as number });
      }
      timeMap.get(time)![name] = Math.round(value * 10) / 10;
    });
  });

  const chartData = Array.from(timeMap.values()).sort((a, b) => {
    const timeA = a.time as unknown as string;
    const timeB = b.time as unknown as string;
    return timeA.localeCompare(timeB);
  });

  if (chartData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
        No comparison data available
      </div>
    );
  }

  const config = METRIC_CONFIG[metric];
  const isPercentage = metric !== 'threads';
  const yDomain: [number, number] = isPercentage ? [0, 100] : [0, Math.ceil(maxValue * 1.1)];

  return (
    <div>
      <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>
        {config.label} Comparison {config.unit && `(${config.unit})`}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
          <XAxis dataKey="time" stroke={colors.textSecondary} fontSize={11} />
          <YAxis
            stroke={colors.textSecondary}
            fontSize={11}
            domain={yDomain}
            unit={config.unit}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              fontSize: '11px',
              padding: '8px 10px',
            }}
            labelStyle={{ fontSize: '11px', marginBottom: '4px', color: colors.text }}
            itemStyle={{ fontSize: '11px', padding: '2px 0' }}
            formatter={(value) => [`${value}${config.unit}`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          {targetNames.map((name, index) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={chartLineColors[index % chartLineColors.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
