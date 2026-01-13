import { useTheme } from '../context/ThemeContext';

const statusColors: Record<string, string> = {
  healthy: '#22c55e',
  running: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

interface AggregateStats {
  pool: { active: number; idle: number; pending: number; max: number };
  heap: { used: number; max: number };
  threads: number;
  avgCpu: number;
  online: number;
  total: number;
}

interface AggregateStatsPanelProps {
  stats: AggregateStats;
  statusCounts: Record<string, number>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function AggregateStatsPanel({ stats, statusCounts }: AggregateStatsPanelProps) {
  const { colors } = useTheme();

  const poolUsage = stats.pool.max > 0
    ? (stats.pool.active / stats.pool.max) * 100
    : 0;
  const heapUsage = stats.heap.max > 0
    ? (stats.heap.used / stats.heap.max) * 100
    : 0;

  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {/* Targets Count */}
      <div style={{
        flex: '1 1 120px',
        padding: '12px',
        backgroundColor: colors.bgSecondary,
        borderRadius: '8px',
        minWidth: '120px',
      }}>
        <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '4px' }}>Targets</div>
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: colors.text }}>
          {stats.online}<span style={{ fontSize: '14px', color: colors.textSecondary }}>/{stats.total}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          {Object.entries(statusCounts).map(([status, count]) => (
            <span
              key={status}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                color: colors.text,
              }}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: statusColors[status.toLowerCase()] || statusColors.unknown,
              }} />
              <span style={{ fontWeight: 600 }}>{count}</span>
              <span style={{ color: colors.textSecondary }}>{status}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Pool Stats */}
      <div style={{
        flex: '1 1 180px',
        padding: '12px',
        backgroundColor: colors.bgSecondary,
        borderRadius: '8px',
        minWidth: '180px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: colors.textSecondary }}>Connection Pool</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: poolUsage > 80 ? '#ef4444' : poolUsage > 60 ? '#f59e0b' : '#22c55e' }}>
            {poolUsage.toFixed(1)}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
          <div>
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>{stats.pool.active}</span>
            <span style={{ color: colors.textSecondary }}> active</span>
          </div>
          <div>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>{stats.pool.idle}</span>
            <span style={{ color: colors.textSecondary }}> idle</span>
          </div>
          {stats.pool.pending > 0 && (
            <div>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{stats.pool.pending}</span>
              <span style={{ color: colors.textSecondary }}> pending</span>
            </div>
          )}
        </div>
        <div style={{ marginTop: '6px', height: '4px', backgroundColor: colors.border, borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(poolUsage, 100)}%`,
            height: '100%',
            backgroundColor: poolUsage > 80 ? '#ef4444' : poolUsage > 60 ? '#f59e0b' : '#3b82f6',
            transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ fontSize: '10px', color: colors.textSecondary, marginTop: '4px' }}>
          {stats.pool.active + stats.pool.idle} / {stats.pool.max} connections
        </div>
      </div>

      {/* Heap Stats */}
      {stats.heap.max > 0 && (
        <div style={{
          flex: '1 1 160px',
          padding: '12px',
          backgroundColor: colors.bgSecondary,
          borderRadius: '8px',
          minWidth: '160px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: colors.textSecondary }}>Heap Memory</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: heapUsage > 85 ? '#ef4444' : heapUsage > 70 ? '#f59e0b' : '#22c55e' }}>
              {heapUsage.toFixed(1)}%
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
            {formatBytes(stats.heap.used)}
            <span style={{ fontSize: '11px', fontWeight: 400, color: colors.textSecondary }}> / {formatBytes(stats.heap.max)}</span>
          </div>
          <div style={{ marginTop: '6px', height: '4px', backgroundColor: colors.border, borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(heapUsage, 100)}%`,
              height: '100%',
              backgroundColor: heapUsage > 85 ? '#ef4444' : heapUsage > 70 ? '#f59e0b' : '#22c55e',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Threads & CPU */}
      <div style={{
        flex: '1 1 140px',
        padding: '12px',
        backgroundColor: colors.bgSecondary,
        borderRadius: '8px',
        minWidth: '140px',
      }}>
        <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '4px' }}>System</div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
          {stats.threads > 0 && (
            <div>
              <span style={{ color: '#8b5cf6', fontWeight: 600, fontSize: '16px' }}>{stats.threads}</span>
              <div style={{ color: colors.textSecondary, fontSize: '10px' }}>threads</div>
            </div>
          )}
          {stats.avgCpu > 0 && (
            <div>
              <span style={{
                color: stats.avgCpu > 0.8 ? '#ef4444' : stats.avgCpu > 0.6 ? '#f59e0b' : '#22c55e',
                fontWeight: 600,
                fontSize: '16px',
              }}>
                {(stats.avgCpu * 100).toFixed(1)}%
              </span>
              <div style={{ color: colors.textSecondary, fontSize: '10px' }}>avg CPU</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
