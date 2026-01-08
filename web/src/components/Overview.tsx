import { useState } from 'react';
import { useTargets, exportCSV } from '../hooks/useMetrics';
import type { GlobalView } from './Dashboard';
import { ComparisonChart } from './ComparisonChart';
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
}

export function Overview({ globalView, onGlobalToggle }: OverviewProps) {
  const { data } = useTargets(5000);
  const [showComparisonChart, setShowComparisonChart] = useState(false);
  const [comparisonRange, setComparisonRange] = useState('1h');
  const { theme, colors } = useTheme();

  if (!data || data.targets.length === 0) {
    return null;
  }

  const totalConnections = data.targets.reduce(
    (acc, t) => acc + (t.current?.active || 0),
    0
  );
  const totalMax = data.targets.reduce(
    (acc, t) => acc + (t.current?.max || 0),
    0
  );
  const avgUsage = totalMax > 0 ? (totalConnections / totalMax) * 100 : 0;

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
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'background-color 0.2s',
      }}
    >
      <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: colors.text }}>
        Overview
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
        <StatCard label="Total Targets" value={data.targets.length} />
        <StatCard
          label="Active Connections"
          value={totalConnections}
          subtext={`/ ${totalMax} max`}
        />
        <StatCard
          label="Avg Usage"
          value={`${avgUsage.toFixed(1)}%`}
          color={avgUsage > 80 ? '#ef4444' : avgUsage > 60 ? '#f59e0b' : '#22c55e'}
        />
        <div>
          <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>Status</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                {count} {status}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>All Targets</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <ActionButton active={globalView === 'trend'} onClick={() => onGlobalToggle('trend')}>
            All Trends
          </ActionButton>
          <ActionButton active={globalView === 'recs'} onClick={() => onGlobalToggle('recs')}>
            All Recommendations
          </ActionButton>
          <ActionButton active={globalView === 'leaks'} onClick={() => onGlobalToggle('leaks')}>
            All Leak Detection
          </ActionButton>
          <ActionButton onClick={() => data.targets.forEach(t => exportCSV(t.name))}>
            Export All CSV
          </ActionButton>
        </div>
      </div>

      {data.targets.length > 1 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', color: colors.textSecondary }}>
              Comparison
            </div>
            <ActionButton active={showComparisonChart} onClick={() => setShowComparisonChart(!showComparisonChart)}>
              {showComparisonChart ? 'Hide Chart' : 'Show Chart'}
            </ActionButton>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {data.targets.map((t) => {
              const usage = t.current && t.current.max > 0
                ? (t.current.active / t.current.max) * 100
                : 0;
              return (
                <div
                  key={t.name}
                  style={{
                    flex: '1 1 120px',
                    padding: '12px',
                    backgroundColor: colors.bgSecondary,
                    borderRadius: '8px',
                    borderLeft: `4px solid ${statusColors[t.status]}`,
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: colors.text }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: colors.text }}>
                    {usage.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: '11px', color: colors.textSecondary }}>
                    {t.current?.active || 0} / {t.current?.max || 0}
                  </div>
                </div>
              );
            })}
          </div>
          {showComparisonChart && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                {['1h', '6h', '24h'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setComparisonRange(r)}
                    style={{
                      marginRight: '8px',
                      padding: '4px 12px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      backgroundColor: comparisonRange === r ? '#3b82f6' : colors.bgCard,
                      color: comparisonRange === r ? '#fff' : colors.text,
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <ComparisonChart targetNames={data.targets.map(t => t.name)} range={comparisonRange} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <div>
      <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: color || colors.text }}>
        {value}
        {subtext && (
          <span style={{ fontSize: '12px', fontWeight: 'normal', color: colors.textSecondary }}>
            {' '}{subtext}
          </span>
        )}
      </div>
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
        padding: '8px 16px',
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        backgroundColor: active ? '#3b82f6' : colors.bgCard,
        color: active ? '#fff' : colors.text,
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}
