import { useState, useMemo } from 'react';
import { useTargets, useHistory, useRecommendations, useLeakDetection, usePeakTime, useAnomalies, useComparison, exportCSV } from '../hooks/useMetrics';
import type { GlobalView } from './Dashboard';
import { ComparisonChart } from './ComparisonChart';
import { TrendChart } from './TrendChart';
import { HeatmapChart } from './HeatmapChart';
import { useTheme } from '../context/ThemeContext';

const statusColors: Record<string, string> = {
  healthy: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

interface OverviewProps {
  globalView: GlobalView;
  onGlobalToggle: (view: GlobalView) => void;
  targetOrder: string[];
  onTargetOrderChange: (order: string[]) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

type DetailView = 'trend' | 'heatmap' | 'peakTime' | 'anomalies' | 'compare' | 'recs' | 'leaks' | null;

export function Overview({ globalView, onGlobalToggle, targetOrder, onTargetOrderChange }: OverviewProps) {
  const { data } = useTargets(5000);
  const [showComparisonChart, setShowComparisonChart] = useState(false);
  const [comparisonRange, setComparisonRange] = useState('1h');
  const [chartMetric, setChartMetric] = useState<'usage' | 'cpu' | 'heap' | 'threads'>('usage');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<DetailView>('trend');
  const [detailRange, setDetailRange] = useState('1h');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const { theme, colors } = useTheme();

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, targetName: string) => {
    setDraggedItem(targetName);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', targetName);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, targetName: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem !== targetName) {
      setDragOverItem(targetName);
    }
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetName: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetName) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const newOrder = [...targetOrder];
    const draggedIndex = newOrder.indexOf(draggedItem);
    const dropIndex = newOrder.indexOf(targetName);

    if (draggedIndex !== -1 && dropIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(dropIndex, 0, draggedItem);
      onTargetOrderChange(newOrder);
    }

    setDraggedItem(null);
    setDragOverItem(null);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  // Memoize target names to prevent unnecessary re-renders of ComparisonChart
  // Use JSON.stringify to only re-compute when actual names change
  const targetNamesKey = (data?.targets || []).map((t) => t.name).join(',');
  const targetNames = useMemo(
    () => (data?.targets || []).map((t) => t.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetNamesKey]
  );

  if (!data || data.targets.length === 0) {
    return null;
  }

  const statusCounts = data.targets.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div
      style={{
        backgroundColor: colors.bgCard,
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'background-color 0.2s',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: colors.text }}>
        Overview
      </h2>

      {/* Total Targets & Status & View Buttons */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '2px' }}>Total Targets</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.text }}>{data.targets.length}</div>
        </div>
        <div style={{ height: '36px', width: '1px', backgroundColor: colors.border }} />
        <div style={{ minWidth: '100px' }}>
          <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '4px' }}>Status</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {Object.entries(statusCounts).map(([status, count]) => (
              <span
                key={status}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px',
                  color: colors.text,
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: statusColors[status] || '#9ca3af',
                  }}
                />
                <span style={{ fontWeight: 600 }}>{count}</span> {status}
              </span>
            ))}
          </div>
        </div>
        <div style={{ height: '36px', width: '1px', backgroundColor: colors.border }} />
        <div>
          <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '4px' }}>All Targets</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <ActionButton active={globalView === 'trend'} onClick={() => onGlobalToggle('trend')}>
              Trends
            </ActionButton>
            <ActionButton active={globalView === 'heatmap'} onClick={() => onGlobalToggle('heatmap')}>
              Heatmaps
            </ActionButton>
          </div>
        </div>
      </div>

      {/* Comparison Section */}
      {data.targets.length > 1 && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: colors.textSecondary }}>Comparison</div>
            <ActionButton active={showComparisonChart} onClick={() => setShowComparisonChart(!showComparisonChart)}>
              {showComparisonChart ? 'Hide Chart' : 'Show Chart'}
            </ActionButton>
          </div>

          {/* Target Cards with JVM info - Drag to reorder */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '10px', color: colors.textSecondary }}>
              Drag cards to reorder
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {targetOrder.map((targetName) => {
              const t = data.targets.find((target) => target.name === targetName);
              if (!t) return null;

              const status = t.status || 'unknown';
              const statusColor = statusColors[status] || statusColors.unknown;
              const usage = t.current && t.current.max > 0
                ? (t.current.active / t.current.max) * 100
                : 0;
              const heapUsage = t.current && t.current.heap_max > 0
                ? (t.current.heap_used / t.current.heap_max) * 100
                : 0;
              const isSelected = selectedTarget === t.name;
              const isDragging = draggedItem === t.name;
              const isDragOver = dragOverItem === t.name;
              const isOffline = !t.current;

              return (
                <div
                  key={t.name}
                  draggable
                  onDragStart={(e) => handleDragStart(e, t.name)}
                  onDragOver={(e) => handleDragOver(e, t.name)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, t.name)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedTarget(isSelected ? null : t.name)}
                  style={{
                    padding: '12px',
                    width: '180px',
                    minHeight: '120px',
                    boxSizing: 'border-box',
                    flexShrink: 0,
                    backgroundColor: isDragOver
                      ? (theme === 'dark' ? '#2d4a6f' : '#bfdbfe')
                      : isSelected
                        ? (theme === 'dark' ? '#1e3a5f' : '#dbeafe')
                        : colors.bgSecondary,
                    borderRadius: '8px',
                    borderLeft: `3px solid ${statusColor}`,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transition: 'background-color 0.15s, opacity 0.15s',
                    outline: isSelected ? '2px solid #3b82f6' : isDragOver ? '2px dashed #3b82f6' : 'none',
                    opacity: isDragging ? 0.5 : isOffline ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>{t.name}</div>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: statusColor + '20',
                        color: statusColor,
                        fontWeight: 600,
                      }}
                    >
                      {isOffline ? 'OFFLINE' : status.toUpperCase()}
                    </span>
                  </div>

                  {/* Pool Usage */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: colors.textSecondary }}>Pool</span>
                      <span style={{ color: colors.text, fontWeight: 500 }}>
                        {t.current?.active || 0}/{t.current?.max || 0} ({usage.toFixed(0)}%)
                      </span>
                    </div>
                    <div style={{ height: '4px', backgroundColor: colors.border, borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(usage, 100)}%`,
                          height: '100%',
                          backgroundColor: usage > 90 ? '#ef4444' : usage > 70 ? '#f59e0b' : '#3b82f6',
                        }}
                      />
                    </div>
                  </div>

                  {/* Heap Usage */}
                  {t.current && t.current.heap_max > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                        <span style={{ color: colors.textSecondary }}>Heap</span>
                        <span style={{ color: colors.text, fontWeight: 500 }}>
                          {formatBytes(t.current.heap_used)}/{formatBytes(t.current.heap_max)} ({heapUsage.toFixed(0)}%)
                        </span>
                      </div>
                      <div style={{ height: '4px', backgroundColor: colors.border, borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(heapUsage, 100)}%`,
                            height: '100%',
                            backgroundColor: heapUsage > 90 ? '#ef4444' : heapUsage > 75 ? '#f59e0b' : '#22c55e',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* CPU & Threads */}
                  {t.current && (t.current.cpu_usage > 0 || t.current.threads_live > 0) && (
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                      {t.current.cpu_usage >= 0 && (
                        <div>
                          <span style={{ color: colors.textSecondary }}>CPU </span>
                          <span style={{
                            color: t.current.cpu_usage > 0.9 ? '#ef4444' : t.current.cpu_usage > 0.7 ? '#f59e0b' : colors.text,
                            fontWeight: 600
                          }}>
                            {(t.current.cpu_usage * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {t.current.threads_live > 0 && (
                        <div>
                          <span style={{ color: colors.textSecondary }}>Threads </span>
                          <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{t.current.threads_live}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Target Detail Panel */}
          {selectedTarget && (
            <TargetDetailPanel
              targetName={selectedTarget}
              detailView={detailView}
              setDetailView={setDetailView}
              detailRange={detailRange}
              setDetailRange={setDetailRange}
            />
          )}

          {/* Comparison Chart */}
          {showComparisonChart && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['1h', '6h', '24h'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setComparisonRange(r)}
                      style={{
                        padding: '4px 10px',
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        backgroundColor: comparisonRange === r ? '#3b82f6' : colors.bgCard,
                        color: comparisonRange === r ? '#fff' : colors.text,
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div style={{ width: '1px', backgroundColor: colors.border }} />
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { key: 'usage', label: 'Pool Usage' },
                    { key: 'cpu', label: 'CPU' },
                    { key: 'heap', label: 'Heap' },
                    { key: 'threads', label: 'Threads' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setChartMetric(m.key as typeof chartMetric)}
                      style={{
                        padding: '4px 10px',
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        backgroundColor: chartMetric === m.key ? '#8b5cf6' : colors.bgCard,
                        color: chartMetric === m.key ? '#fff' : colors.text,
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <ComparisonChart targetNames={targetNames} range={comparisonRange} metric={chartMetric} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        border: `1px solid ${colors.border}`,
        borderRadius: '5px',
        backgroundColor: active ? '#3b82f6' : colors.bgCard,
        color: active ? '#fff' : colors.text,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

// Detail Panel for selected target
function TargetDetailPanel({
  targetName,
  detailView,
  setDetailView,
  detailRange,
  setDetailRange,
}: {
  targetName: string;
  detailView: DetailView;
  setDetailView: (v: DetailView) => void;
  detailRange: string;
  setDetailRange: (r: string) => void;
}) {
  const { colors } = useTheme();
  const [comparePeriod, setComparePeriod] = useState<'day' | 'week'>('day');

  const needHistory = detailView === 'trend' || detailView === 'heatmap';
  const { data: history, loading: historyLoading } = useHistory(needHistory ? targetName : '', detailView === 'heatmap' ? '24h' : detailRange);
  const { data: recs, loading: recsLoading } = useRecommendations(targetName, detailView === 'recs');
  const { data: leaks, loading: leaksLoading } = useLeakDetection(targetName, detailView === 'leaks');
  const { data: peakTime, loading: peakTimeLoading } = usePeakTime(targetName, detailView === 'peakTime');
  const { data: anomalies, loading: anomaliesLoading } = useAnomalies(targetName, detailView === 'anomalies');
  const { data: comparison, loading: comparisonLoading } = useComparison(targetName, comparePeriod, detailView === 'compare');

  const views = [
    { key: 'trend', label: 'Trend' },
    { key: 'heatmap', label: 'Heatmap' },
    { key: 'peakTime', label: 'Peak Time' },
    { key: 'anomalies', label: 'Anomalies' },
    { key: 'compare', label: 'Compare' },
    { key: 'recs', label: 'Recommendations' },
    { key: 'leaks', label: 'Leak Detection' },
  ] as const;

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '16px',
        backgroundColor: colors.bgSecondary,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>
          {targetName}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => exportCSV(targetName)}
            style={{
              padding: '4px 10px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              backgroundColor: colors.bgCard,
              color: colors.text,
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Export CSV
          </button>
          <button
            onClick={() => window.open(`/api/targets/${targetName}/report?range=24h`, '_blank')}
            style={{
              padding: '4px 10px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              backgroundColor: colors.bgCard,
              color: colors.text,
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Report
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => setDetailView(v.key)}
            style={{
              padding: '5px 10px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              backgroundColor: detailView === v.key ? '#3b82f6' : colors.bgCard,
              color: detailView === v.key ? '#fff' : colors.text,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Trend View */}
      {detailView === 'trend' && (
        <div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
            {['1h', '6h', '24h'].map((r) => (
              <button
                key={r}
                onClick={() => setDetailRange(r)}
                style={{
                  padding: '3px 8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  backgroundColor: detailRange === r ? '#3b82f6' : colors.bgCard,
                  color: detailRange === r ? '#fff' : colors.text,
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ height: '200px' }}>
            {historyLoading && !history ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: colors.textSecondary }}>
                Loading...
              </div>
            ) : history?.datapoints && history.datapoints.length > 0 ? (
              <TrendChart data={history.datapoints} height={200} targetName={targetName} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: colors.textSecondary }}>
                No data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Heatmap View */}
      {detailView === 'heatmap' && (
        <div>
          {historyLoading && !history ? (
            <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>Loading...</div>
          ) : history?.datapoints && history.datapoints.length > 0 ? (
            <HeatmapChart data={history.datapoints} targetName={targetName} />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>No data available</div>
          )}
        </div>
      )}

      {/* Peak Time View */}
      {detailView === 'peakTime' && (
        <div>
          {peakTimeLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>Analyzing...</div>
          ) : peakTime && peakTime.summary ? (
            <div>
              <div style={{ marginBottom: '8px', fontSize: '11px', color: colors.textSecondary }}>
                Analyzed {peakTime.data_points || 0} data points (24h)
              </div>
              <div style={{ padding: '10px', backgroundColor: colors.bgCard, borderRadius: '6px', marginBottom: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: colors.textSecondary }}>Busiest: </span>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{peakTime.summary.busiest_hour ?? 0}:00</span>
                    <span style={{ color: colors.textSecondary }}> ({(peakTime.summary.busiest_hour_usage ?? 0).toFixed(1)}%)</span>
                  </div>
                  <div>
                    <span style={{ color: colors.textSecondary }}>Quietest: </span>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{peakTime.summary.quietest_hour ?? 0}:00</span>
                    <span style={{ color: colors.textSecondary }}> ({(peakTime.summary.quietest_usage ?? 0).toFixed(1)}%)</span>
                  </div>
                </div>
                {peakTime.summary.recommendation && (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: colors.text }}>{peakTime.summary.recommendation}</div>
                )}
              </div>
              {peakTime.peak_hours && Array.isArray(peakTime.peak_hours) && peakTime.peak_hours.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {peakTime.peak_hours.map((h, idx) => (
                    <span key={h?.hour ?? idx} style={{ padding: '3px 6px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '10px' }}>
                      {h?.hour ?? 0}:00 ({(h?.avg_usage ?? 0).toFixed(0)}%)
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>No data available</div>
          )}
        </div>
      )}

      {/* Anomalies View */}
      {detailView === 'anomalies' && (
        <div>
          {anomaliesLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>Detecting...</div>
          ) : anomalies ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 500,
                    backgroundColor: anomalies.risk_level === 'high' ? '#fee2e2' : anomalies.risk_level === 'elevated' ? '#fef3c7' : '#dcfce7',
                    color: anomalies.risk_level === 'high' ? '#991b1b' : anomalies.risk_level === 'elevated' ? '#92400e' : '#166534',
                  }}
                >
                  {(anomalies.risk_level || 'normal').toUpperCase()}
                </span>
                <span style={{ fontSize: '11px', color: colors.textSecondary }}>
                  {anomalies.statistics?.anomaly_count || 0} anomalies ({(anomalies.statistics?.anomaly_percent ?? 0).toFixed(1)}%)
                </span>
              </div>
              <div style={{ padding: '8px', backgroundColor: colors.bgCard, borderRadius: '6px', marginBottom: '8px', fontSize: '11px' }}>
                <span style={{ color: colors.textSecondary }}>Mean: </span>
                <span style={{ color: colors.text }}>{(anomalies.statistics?.mean_usage ?? 0).toFixed(1)}%</span>
                <span style={{ color: colors.textSecondary, marginLeft: '10px' }}>Std Dev: </span>
                <span style={{ color: colors.text }}>{(anomalies.statistics?.std_deviation ?? 0).toFixed(1)}</span>
              </div>
              {anomalies.anomalies && Array.isArray(anomalies.anomalies) && anomalies.anomalies.length > 0 ? (
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {anomalies.anomalies.slice(0, 5).map((a, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px',
                        marginBottom: '4px',
                        backgroundColor: a?.severity === 'critical' ? '#fee2e2' : '#fef3c7',
                        borderRadius: '6px',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: a?.severity === 'critical' ? '#991b1b' : '#92400e' }}>
                        {(a?.type || '').replace(/_/g, ' ')}
                      </div>
                      <div style={{ color: '#374151' }}>{a?.message || ''}</div>
                    </div>
                  ))}
                  {anomalies.anomalies.length > 5 && (
                    <div style={{ fontSize: '10px', color: colors.textSecondary, textAlign: 'center' }}>
                      +{anomalies.anomalies.length - 5} more
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '8px', backgroundColor: '#dcfce7', borderRadius: '6px', color: '#166534', fontSize: '11px' }}>
                  No anomalies detected
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>Unable to analyze</div>
          )}
        </div>
      )}

      {/* Compare View */}
      {detailView === 'compare' && (
        <div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
            {(['day', 'week'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setComparePeriod(p)}
                style={{
                  padding: '3px 8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  backgroundColor: comparePeriod === p ? '#3b82f6' : colors.bgCard,
                  color: comparePeriod === p ? '#fff' : colors.text,
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {p === 'day' ? 'Today vs Yesterday' : 'This Week vs Last'}
              </button>
            ))}
          </div>
          {comparisonLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>Comparing...</div>
          ) : comparison && comparison.current_period && comparison.previous_period ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '10px' }}>
                <div style={{ padding: '10px', backgroundColor: colors.bgCard, borderRadius: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, marginBottom: '4px' }}>
                    {comparePeriod === 'day' ? 'Today' : 'This Week'}
                  </div>
                  <div style={{ fontSize: '11px', color: colors.textSecondary }}>
                    <div>Avg: <span style={{ color: colors.text }}>{(comparison.current_period.avg_usage ?? 0).toFixed(1)}%</span></div>
                    <div>Max: <span style={{ color: colors.text }}>{(comparison.current_period.max_usage ?? 0).toFixed(1)}%</span></div>
                  </div>
                </div>
                <div style={{ padding: '10px', backgroundColor: colors.bgCard, borderRadius: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, marginBottom: '4px' }}>
                    {comparePeriod === 'day' ? 'Yesterday' : 'Last Week'}
                  </div>
                  <div style={{ fontSize: '11px', color: colors.textSecondary }}>
                    <div>Avg: <span style={{ color: colors.text }}>{(comparison.previous_period.avg_usage ?? 0).toFixed(1)}%</span></div>
                    <div>Max: <span style={{ color: colors.text }}>{(comparison.previous_period.max_usage ?? 0).toFixed(1)}%</span></div>
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: comparison.changes?.trend === 'improving' ? '#dcfce7' : comparison.changes?.trend === 'degrading' ? '#fee2e2' : colors.bgCard,
                  fontSize: '12px',
                  fontWeight: 600,
                  color: comparison.changes?.trend === 'improving' ? '#166534' : comparison.changes?.trend === 'degrading' ? '#991b1b' : colors.text,
                }}
              >
                {comparison.changes?.trend === 'improving' ? '↓ Improving' : comparison.changes?.trend === 'degrading' ? '↑ Degrading' : '→ Stable'}
                <span style={{ fontWeight: 400, marginLeft: '8px', fontSize: '11px' }}>
                  ({(comparison.changes?.avg_usage_change ?? 0) >= 0 ? '+' : ''}{(comparison.changes?.avg_usage_change ?? 0).toFixed(1)}%)
                </span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>No comparison data</div>
          )}
        </div>
      )}

      {/* Recommendations View */}
      {detailView === 'recs' && (
        <div>
          {recsLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>Analyzing...</div>
          ) : recs && recs.recommendations && Array.isArray(recs.recommendations) ? (
            <div>
              <div style={{ marginBottom: '8px', fontSize: '11px', color: colors.textSecondary }}>
                Analyzed {recs.data_points || 0} points | Peak: {recs.stats?.peak_usage ?? 0}%
              </div>
              {recs.recommendations.map((rec, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px',
                    marginBottom: '4px',
                    backgroundColor: rec?.severity === 'critical' ? '#fee2e2' : rec?.severity === 'warning' ? '#fef3c7' : '#dbeafe',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, color: rec?.severity === 'critical' ? '#991b1b' : rec?.severity === 'warning' ? '#92400e' : '#1e40af' }}>
                      {rec?.type || 'Unknown'}
                    </span>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase' }}>{rec?.severity || ''}</span>
                  </div>
                  <div style={{ color: '#374151' }}>{rec?.reason || ''}</div>
                  {rec?.current !== rec?.recommended && (
                    <div style={{ color: '#6b7280', marginTop: '2px' }}>
                      {rec?.current || ''} → <strong>{rec?.recommended || ''}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>No recommendations</div>
          )}
        </div>
      )}

      {/* Leak Detection View */}
      {detailView === 'leaks' && (
        <div>
          {leaksLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>Analyzing...</div>
          ) : leaks ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 500,
                    backgroundColor: leaks.leak_risk === 'high' ? '#fee2e2' : leaks.leak_risk === 'medium' ? '#fef3c7' : leaks.leak_risk === 'low' ? '#dbeafe' : '#dcfce7',
                    color: leaks.leak_risk === 'high' ? '#991b1b' : leaks.leak_risk === 'medium' ? '#92400e' : leaks.leak_risk === 'low' ? '#1e40af' : '#166534',
                  }}
                >
                  Risk: {(leaks.leak_risk || 'none').toUpperCase()}
                </span>
                <span style={{ fontSize: '11px', color: colors.textSecondary }}>
                  Health: {leaks.health_score != null && leaks.health_score >= 0 ? `${leaks.health_score}/100` : 'N/A'}
                </span>
              </div>
              {leaks.alerts && Array.isArray(leaks.alerts) && leaks.alerts.length > 0 ? (
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {leaks.alerts.map((alert, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px',
                        marginBottom: '4px',
                        backgroundColor: alert?.severity === 'critical' ? '#fee2e2' : '#fef3c7',
                        borderRadius: '6px',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: alert?.severity === 'critical' ? '#991b1b' : '#92400e' }}>
                        {(alert?.type || '').replace(/_/g, ' ')}
                      </div>
                      <div style={{ color: '#374151' }}>{alert?.message || ''}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '8px', backgroundColor: '#dcfce7', borderRadius: '6px', color: '#166534', fontSize: '11px' }}>
                  No leak indicators detected
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>Unable to analyze</div>
          )}
        </div>
      )}
    </div>
  );
}