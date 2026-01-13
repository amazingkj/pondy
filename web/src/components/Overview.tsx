import { useState, useMemo } from 'react';
import { useTargets } from '../hooks/useMetrics';
import type { GlobalView } from './Dashboard';
import { ComparisonChart } from './ComparisonChart';
import { useTheme } from '../context/ThemeContext';
import { ActionButton } from './ActionButton';
import { AggregateStatsPanel } from './AggregateStatsPanel';
import { TargetDetailPanel, type DetailView } from './TargetDetailPanel';
import { HexagonView } from './HexagonView';

type ViewMode = 'cards' | 'hexagon';

const statusColors: Record<string, string> = {
  healthy: '#22c55e',
  running: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

const statusLabels: Record<string, string> = {
  healthy: 'RUNNING',
  running: 'RUNNING',
  warning: 'WARNING',
  critical: 'CRITICAL',
  unknown: 'UNKNOWN',
};

interface OverviewProps {
  globalView: GlobalView;
  onGlobalToggle: (view: GlobalView) => void;
  targetOrder: string[];
  onTargetOrderChange: (order: string[]) => void;
  selectedGroup: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function Overview({ globalView, onGlobalToggle, targetOrder, onTargetOrderChange, selectedGroup }: OverviewProps) {
  const { data } = useTargets(5000);
  const [showComparisonChart, setShowComparisonChart] = useState(false);
  const [comparisonRange, setComparisonRange] = useState('1h');
  const [chartMetric, setChartMetric] = useState<'usage' | 'cpu' | 'heap' | 'threads'>('usage');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<DetailView>('trend');
  const [detailRange, setDetailRange] = useState('1h');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
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

  // Filter targets by selected group
  const filteredTargets = useMemo(() => {
    if (!data || data.targets.length === 0) return [];
    return selectedGroup
      ? data.targets.filter(t => t.group === selectedGroup)
      : data.targets;
  }, [data, selectedGroup]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    return filteredTargets.reduce(
      (acc, t) => {
        const label = statusLabels[t.status] || 'UNKNOWN';
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [filteredTargets]);

  // Calculate aggregate stats - must be called unconditionally (React hooks rule)
  const aggregateStats = useMemo(() => {
    let totalActive = 0, totalIdle = 0, totalPending = 0, totalMax = 0;
    let totalHeapUsed = 0, totalHeapMax = 0;
    let totalThreads = 0;
    let totalCpu = 0, cpuCount = 0;
    let onlineCount = 0;

    filteredTargets.forEach(t => {
      if (t.current) {
        onlineCount++;
        totalActive += t.current.active || 0;
        totalIdle += t.current.idle || 0;
        totalPending += t.current.pending || 0;
        totalMax += t.current.max || 0;
        totalHeapUsed += t.current.heap_used || 0;
        totalHeapMax += t.current.heap_max || 0;
        totalThreads += t.current.threads_live || 0;
        if (t.current.cpu_usage > 0) {
          totalCpu += t.current.cpu_usage;
          cpuCount++;
        }
      }
    });

    return {
      pool: { active: totalActive, idle: totalIdle, pending: totalPending, max: totalMax },
      heap: { used: totalHeapUsed, max: totalHeapMax },
      threads: totalThreads,
      avgCpu: cpuCount > 0 ? totalCpu / cpuCount : 0,
      online: onlineCount,
      total: filteredTargets.length,
    };
  }, [filteredTargets]);

  // Early return after all hooks are called
  if (!data || data.targets.length === 0) {
    return null;
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: colors.text }}>
          {selectedGroup ? `${selectedGroup} Group` : 'All Targets'} Overview
        </h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          <ActionButton active={globalView === 'trend'} onClick={() => onGlobalToggle('trend')}>
            Trends
          </ActionButton>
          <ActionButton active={globalView === 'heatmap'} onClick={() => onGlobalToggle('heatmap')}>
            Heatmaps
          </ActionButton>
        </div>
      </div>

      {/* Aggregate Stats Panel */}
      <AggregateStatsPanel stats={aggregateStats} statusCounts={statusCounts} />

      {/* Comparison Section */}
      {data.targets.length > 1 && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '11px', color: colors.textSecondary }}>Comparison</div>
              {/* View Mode Toggle */}
              <div style={{ display: 'flex', gap: '2px', backgroundColor: colors.bgSecondary, borderRadius: '6px', padding: '2px' }}>
                <button
                  onClick={() => setViewMode('cards')}
                  style={{
                    padding: '4px 8px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: viewMode === 'cards' ? colors.bgCard : 'transparent',
                    color: viewMode === 'cards' ? colors.text : colors.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: viewMode === 'cards' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                  title="Card View"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                  </svg>
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('hexagon')}
                  style={{
                    padding: '4px 8px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: viewMode === 'hexagon' ? colors.bgCard : 'transparent',
                    color: viewMode === 'hexagon' ? colors.text : colors.textSecondary,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: viewMode === 'hexagon' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                  title="Hexagon View (MSA Style)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  Hexagon
                </button>
              </div>
            </div>
            <ActionButton active={showComparisonChart} onClick={() => setShowComparisonChart(!showComparisonChart)}>
              {showComparisonChart ? 'Hide Chart' : 'Show Chart'}
            </ActionButton>
          </div>

          {/* Hexagon View */}
          {viewMode === 'hexagon' && (
            <HexagonView
              targets={filteredTargets}
              selectedTarget={selectedTarget}
              onSelectTarget={(target) => setSelectedTarget(prev => prev === target.name ? null : target.name)}
            />
          )}

          {/* Target Cards with JVM info - Drag to reorder */}
          {viewMode === 'cards' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', color: colors.textSecondary }}>
                Drag cards to reorder
              </span>
            </div>
          )}
          {viewMode === 'cards' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {targetOrder.map((targetName) => {
              const t = data.targets.find((target) => target.name === targetName);
              if (!t) return null;
              // Filter by selected group
              if (selectedGroup && t.group !== selectedGroup) return null;

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
                      ? (theme === 'dark' ? '#1a3a2f' : '#dcfce7')
                      : isSelected
                        ? (theme === 'dark' ? '#14532d' : '#dcfce7')
                        : colors.bgSecondary,
                    borderRadius: '8px',
                    borderLeft: `3px solid ${isSelected ? '#22c55e' : statusColor}`,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transition: 'all 0.2s ease',
                    outline: isSelected ? '2px solid #22c55e' : isDragOver ? '2px dashed #22c55e' : 'none',
                    boxShadow: isSelected
                      ? '0 0 12px rgba(34, 197, 94, 0.5)'
                      : 'none',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
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
                      {isOffline ? 'OFFLINE' : (statusLabels[status] || status.toUpperCase())}
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
          )}

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
