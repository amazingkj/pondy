import { useState, memo, useMemo, Suspense, lazy } from 'react';
import type { TargetStatus } from '../types/metrics';
import { useHistory } from '../hooks/useMetrics';
import { PoolGauge } from './PoolGauge';
import type { GlobalView } from './Dashboard';
import { useTheme } from '../context/ThemeContext';
import { useLazyLoad, useDebouncedValue } from '../hooks/useLazyLoad';

// Lazy load chart components
const TrendChart = lazy(() => import('./TrendChart').then(m => ({ default: m.TrendChart })));
const HeatmapChart = lazy(() => import('./HeatmapChart').then(m => ({ default: m.HeatmapChart })));

interface TargetCardProps {
  target: TargetStatus;
  globalView?: GlobalView;
  renderIndex?: number;
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  healthy: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  running: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  warning: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  unknown: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  offline: { bg: '#fef2f2', text: '#7f1d1d', border: '#991b1b' },
};

const statusLabels: Record<string, string> = {
  healthy: 'RUNNING',
  running: 'RUNNING',
  warning: 'WARNING',
  critical: 'CRITICAL',
  unknown: 'UNKNOWN',
  offline: 'OFFLINE',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getMemoryColor(ratio: number): string {
  if (ratio >= 0.9) return '#ef4444';
  if (ratio >= 0.75) return '#f59e0b';
  return '#22c55e';
}

function getCpuColor(usage: number): string {
  if (usage >= 0.9) return '#ef4444';
  if (usage >= 0.7) return '#f59e0b';
  return '#22c55e';
}

// Chart loading placeholder
function ChartPlaceholder({ height = 160 }: { height?: number }) {
  const { colors } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        color: colors.textSecondary,
        fontSize: '12px',
      }}
    >
      Loading chart...
    </div>
  );
}

export const TargetCard = memo(function TargetCard({ target, globalView, renderIndex = 0 }: TargetCardProps) {
  const [range, setRange] = useState('1h');
  const [showInstances, setShowInstances] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const { theme, colors: themeColors } = useTheme();

  const hasMultipleInstances = target.instances && target.instances.length > 1;
  const displayMetrics = selectedInstance
    ? target.instances?.find(i => i.instance_name === selectedInstance)?.current
    : target.current;

  // Debounce globalView changes to prevent rapid toggle issues
  const debouncedGlobalView = useDebouncedValue(globalView, 50);

  // Calculate staggered delay based on render index (50ms per card, max 400ms)
  const staggerDelay = useMemo(() => Math.min(renderIndex * 50, 400), [renderIndex]);

  // Lazy load chart section with staggered delay
  const { elementRef: chartRef, shouldLoad: shouldLoadChart } = useLazyLoad({
    enabled: debouncedGlobalView === 'trend' || debouncedGlobalView === 'heatmap',
    delay: staggerDelay,
    rootMargin: '100px',
  });

  // Only fetch history when globalView requires it AND lazy load is ready
  const showTrend = debouncedGlobalView === 'trend';
  const showHeatmap = debouncedGlobalView === 'heatmap';
  const needHistory = (showTrend || showHeatmap) && shouldLoadChart;
  const { data: history, loading: historyLoading } = useHistory(
    needHistory ? target.name : '',
    showHeatmap ? '24h' : range
  );

  const current = displayMetrics;
  const isOffline = !target.current;
  const status = isOffline ? 'offline' : (target.status || 'unknown');
  const statusColor = statusColors[status] || statusColors.unknown;

  return (
    <div
      style={{
        border: `2px solid ${statusColor.border}`,
        borderRadius: '10px',
        padding: '16px',
        backgroundColor: themeColors.bgCard,
        boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'background-color 0.2s',
        opacity: isOffline ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: themeColors.text }}>{target.name}</h3>
            {target.group && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 500,
                  backgroundColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                  color: theme === 'dark' ? '#9ca3af' : '#6b7280',
                  textTransform: 'uppercase',
                }}
              >
                {target.group}
              </span>
            )}
          </div>
          <span
            style={{
              display: 'inline-block',
              marginTop: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: statusColor.bg,
              color: statusColor.text,
            }}
          >
            {statusLabels[status] || status.toUpperCase()}
          </span>
        </div>
        {current && <PoolGauge active={current.active} max={current.max} size={80} />}
      </div>

      {/* Instance Selector for multi-instance targets */}
      {hasMultipleInstances && (
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={() => setShowInstances(!showInstances)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              border: `1px solid ${themeColors.border}`,
              borderRadius: '6px',
              backgroundColor: themeColors.bgSecondary,
              color: themeColors.text,
              cursor: 'pointer',
              fontSize: '12px',
              width: '100%',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {selectedInstance ? `Instance: ${selectedInstance}` : `All Instances (${target.instances!.length})`}
            </span>
            <span style={{ transform: showInstances ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              ▼
            </span>
          </button>
          {showInstances && (
            <div
              style={{
                marginTop: '4px',
                border: `1px solid ${themeColors.border}`,
                borderRadius: '6px',
                overflow: 'hidden',
                backgroundColor: themeColors.bgCard,
              }}
            >
              <div
                onClick={() => { setSelectedInstance(null); setShowInstances(false); }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: selectedInstance === null ? themeColors.bgSecondary : 'transparent',
                  borderBottom: `1px solid ${themeColors.border}`,
                  fontSize: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: selectedInstance === null ? 600 : 400 }}>All (Aggregated)</span>
              </div>
              {target.instances!.map((inst) => {
                const instStatusColor = statusColors[inst.status] || statusColors.unknown;
                return (
                  <div
                    key={inst.instance_name}
                    onClick={() => { setSelectedInstance(inst.instance_name); setShowInstances(false); }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: selectedInstance === inst.instance_name ? themeColors.bgSecondary : 'transparent',
                      borderBottom: `1px solid ${themeColors.border}`,
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: selectedInstance === inst.instance_name ? 600 : 400 }}>
                      {inst.instance_name}
                    </span>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        backgroundColor: instStatusColor.bg,
                        color: instStatusColor.text,
                      }}
                    >
                      {inst.status.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Offline Message */}
      {isOffline && (
        <div
          style={{
            marginTop: '12px',
            padding: '16px',
            backgroundColor: themeColors.bgSecondary,
            borderRadius: '6px',
            textAlign: 'center',
            color: themeColors.textSecondary,
            fontSize: '13px',
          }}
        >
          Unable to connect to target
        </div>
      )}

      {/* Connection Pool Metrics */}
      {current && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            marginTop: '12px',
            padding: '12px',
            backgroundColor: themeColors.bgSecondary,
            borderRadius: '6px',
          }}
        >
          <MetricItem label="Active" value={current.active} color="#3b82f6" />
          <MetricItem label="Idle" value={current.idle} color="#22c55e" />
          <MetricItem label="Pending" value={current.pending} color="#f59e0b" />
          <MetricItem label="Timeout" value={current.timeout} color="#ef4444" />
        </div>
      )}

      {/* JVM Metrics */}
      {current && (current.heap_max > 0 || current.threads_live > 0) && (
        <div
          style={{
            marginTop: '10px',
            padding: '12px',
            backgroundColor: themeColors.bgSecondary,
            borderRadius: '6px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {/* Heap Memory */}
            {current.heap_max > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span style={{ color: themeColors.textSecondary }}>Heap</span>
                  <span style={{ color: themeColors.text }}>
                    {formatBytes(current.heap_used)} / {formatBytes(current.heap_max)}
                  </span>
                </div>
                <div style={{ height: '6px', backgroundColor: themeColors.border, borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min((current.heap_used / current.heap_max) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: getMemoryColor(current.heap_used / current.heap_max),
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Non-Heap - show with visual bar like Heap */}
            {current.non_heap_used > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span style={{ color: themeColors.textSecondary }}>Non-Heap</span>
                  <span style={{ color: themeColors.text }}>
                    {formatBytes(current.non_heap_used)}{current.non_heap_max > 0 ? ` / ${formatBytes(current.non_heap_max)}` : ''}
                  </span>
                </div>
                <div style={{ height: '6px', backgroundColor: themeColors.border, borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: current.non_heap_max > 0
                        ? `${Math.min((current.non_heap_used / current.non_heap_max) * 100, 100)}%`
                        : `${Math.min((current.non_heap_used / (700 * 1024 * 1024)) * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: current.non_heap_max > 0
                        ? getMemoryColor(current.non_heap_used / current.non_heap_max)
                        : '#8b5cf6',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Threads & CPU in one row */}
            {(current.threads_live > 0 || current.cpu_usage >= 0) && (
              <>
                {current.threads_live > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#8b5cf6' }}>{current.threads_live}</div>
                    <div style={{ fontSize: '10px', color: themeColors.textSecondary }}>Threads</div>
                  </div>
                )}
                {current.cpu_usage >= 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: getCpuColor(current.cpu_usage) }}>
                      {(current.cpu_usage * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '10px', color: themeColors.textSecondary }}>CPU</div>
                  </div>
                )}
              </>
            )}

            {/* GC Metrics */}
            {(current.gc_count > 0 || current.gc_time > 0) && (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316' }}>{current.gc_count}</div>
                  <div style={{ fontSize: '10px', color: themeColors.textSecondary }}>GC Count</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f97316' }}>
                    {current.gc_time < 1 ? `${(current.gc_time * 1000).toFixed(0)}ms` : `${current.gc_time.toFixed(2)}s`}
                  </div>
                  <div style={{ fontSize: '10px', color: themeColors.textSecondary }}>GC Time</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Global View: Trend */}
      <div
        ref={showTrend ? chartRef : undefined}
        style={{
          marginTop: showTrend ? '12px' : '0',
          maxHeight: showTrend ? '200px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-out, margin-top 0.3s ease-out, opacity 0.3s ease-out',
          opacity: showTrend ? 1 : 0,
        }}
      >
        <div style={{ marginBottom: '8px', display: 'flex', gap: '4px' }}>
          {['1h', '6h', '24h'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '3px 8px',
                border: `1px solid ${themeColors.border}`,
                borderRadius: '4px',
                backgroundColor: range === r ? '#3b82f6' : themeColors.bgCard,
                color: range === r ? '#fff' : themeColors.text,
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <div style={{ height: '160px' }}>
          {!shouldLoadChart ? (
            <ChartPlaceholder height={160} />
          ) : historyLoading && !history ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: themeColors.textSecondary, fontSize: '12px' }}>
              Loading...
            </div>
          ) : history?.datapoints && history.datapoints.length > 0 ? (
            <Suspense fallback={<ChartPlaceholder height={160} />}>
              <TrendChart data={history.datapoints} height={160} targetName={target.name} />
            </Suspense>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: themeColors.textSecondary, fontSize: '12px' }}>
              No data
            </div>
          )}
        </div>
      </div>

      {/* Global View: Heatmap */}
      <div
        ref={showHeatmap ? chartRef : undefined}
        style={{
          marginTop: showHeatmap ? '12px' : '0',
          maxHeight: showHeatmap ? '150px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-out, margin-top 0.3s ease-out, opacity 0.3s ease-out',
          opacity: showHeatmap ? 1 : 0,
        }}
      >
        {!shouldLoadChart ? (
          <ChartPlaceholder height={120} />
        ) : historyLoading && !history ? (
          <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary, fontSize: '12px' }}>
            Loading...
          </div>
        ) : history?.datapoints && history.datapoints.length > 0 ? (
          <Suspense fallback={<ChartPlaceholder height={120} />}>
            <HeatmapChart data={history.datapoints} targetName={target.name} />
          </Suspense>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary, fontSize: '12px' }}>
            No data
          </div>
        )}
      </div>
    </div>
  );
});

const MetricItem = memo(function MetricItem({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useTheme();
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: '10px', color: colors.textSecondary }}>{label}</div>
    </div>
  );
});
