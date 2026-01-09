import { useState, memo } from 'react';
import type { TargetStatus } from '../types/metrics';
import { useHistory } from '../hooks/useMetrics';
import { PoolGauge } from './PoolGauge';
import { TrendChart } from './TrendChart';
import { HeatmapChart } from './HeatmapChart';
import type { GlobalView } from './Dashboard';
import { useTheme } from '../context/ThemeContext';

interface TargetCardProps {
  target: TargetStatus;
  globalView?: GlobalView;
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  healthy: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  warning: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  unknown: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  offline: { bg: '#fef2f2', text: '#7f1d1d', border: '#991b1b' },
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

export const TargetCard = memo(function TargetCard({ target, globalView }: TargetCardProps) {
  const [range, setRange] = useState('1h');
  const { theme, colors: themeColors } = useTheme();

  // Only fetch history when globalView requires it
  const showTrend = globalView === 'trend';
  const showHeatmap = globalView === 'heatmap';
  const needHistory = showTrend || showHeatmap;
  const { data: history, loading: historyLoading } = useHistory(
    needHistory ? target.name : '',
    showHeatmap ? '24h' : range
  );

  const current = target.current;
  const isOffline = !current;
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
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: themeColors.text }}>{target.name}</h3>
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
            {isOffline ? 'OFFLINE' : status.toUpperCase()}
          </span>
        </div>
        {current && <PoolGauge active={current.active} max={current.max} size={80} />}
      </div>

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

            {/* Non-Heap */}
            {current.non_heap_used > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span style={{ color: themeColors.textSecondary }}>Non-Heap</span>
                  <span style={{ color: themeColors.text }}>{formatBytes(current.non_heap_used)}</span>
                </div>
                <div style={{ height: '6px', backgroundColor: themeColors.border, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', backgroundColor: '#8b5cf6' }} />
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
          </div>
        </div>
      )}

      {/* Global View: Trend */}
      <div
        style={{
          marginTop: showTrend ? '12px' : '0',
          maxHeight: showTrend ? '200px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.2s ease-out, margin-top 0.2s ease-out',
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
          {historyLoading && !history ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: themeColors.textSecondary, fontSize: '12px' }}>
              Loading...
            </div>
          ) : history && history.datapoints.length > 0 ? (
            <TrendChart data={history.datapoints} height={160} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: themeColors.textSecondary, fontSize: '12px' }}>
              No data
            </div>
          )}
        </div>
      </div>

      {/* Global View: Heatmap */}
      <div
        style={{
          marginTop: showHeatmap ? '12px' : '0',
          maxHeight: showHeatmap ? '150px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.2s ease-out, margin-top 0.2s ease-out',
        }}
      >
        {historyLoading && !history ? (
          <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary, fontSize: '12px' }}>
            Loading...
          </div>
        ) : history && history.datapoints.length > 0 ? (
          <HeatmapChart data={history.datapoints} />
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
