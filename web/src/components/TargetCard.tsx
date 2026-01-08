import { useState } from 'react';
import type { TargetStatus, Recommendation, LeakAlert } from '../types/metrics';
import { useHistory, useRecommendations, useLeakDetection, exportCSV } from '../hooks/useMetrics';
import { PoolGauge } from './PoolGauge';
import { TrendChart } from './TrendChart';
import type { GlobalView } from './Dashboard';

interface TargetCardProps {
  target: TargetStatus;
  globalView?: GlobalView;
}

const statusColors = {
  healthy: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  warning: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  unknown: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
};

const severityColors: Record<string, { bg: string; text: string }> = {
  info: { bg: '#dbeafe', text: '#1e40af' },
  warning: { bg: '#fef3c7', text: '#92400e' },
  critical: { bg: '#fee2e2', text: '#991b1b' },
};

const riskColors: Record<string, { bg: string; text: string }> = {
  none: { bg: '#dcfce7', text: '#166534' },
  low: { bg: '#dbeafe', text: '#1e40af' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  high: { bg: '#fee2e2', text: '#991b1b' },
  unknown: { bg: '#f3f4f6', text: '#374151' },
};

export function TargetCard({ target, globalView }: TargetCardProps) {
  const [localTrend, setLocalTrend] = useState(false);
  const [localRecs, setLocalRecs] = useState(false);
  const [localLeaks, setLocalLeaks] = useState(false);
  const [range, setRange] = useState('1h');

  const showTrend = globalView === 'trend' || localTrend;
  const showRecs = globalView === 'recs' || localRecs;
  const showLeaks = globalView === 'leaks' || localLeaks;

  const { data: history } = useHistory(showTrend ? target.name : '', range);
  const { data: recs, loading: recsLoading } = useRecommendations(target.name, showRecs);
  const { data: leaks, loading: leaksLoading } = useLeakDetection(target.name, showLeaks);

  const colors = statusColors[target.status];
  const current = target.current;

  return (
    <div
      style={{
        border: `2px solid ${colors.border}`,
        borderRadius: '12px',
        padding: '20px',
        backgroundColor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{target.name}</h3>
          <span
            style={{
              display: 'inline-block',
              marginTop: '8px',
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: colors.bg,
              color: colors.text,
            }}
          >
            {target.status.toUpperCase()}
          </span>
        </div>
        {current && <PoolGauge active={current.active} max={current.max} size={100} />}
      </div>

      {current && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
          }}
        >
          <MetricItem label="Active" value={current.active} color="#3b82f6" />
          <MetricItem label="Idle" value={current.idle} color="#22c55e" />
          <MetricItem label="Pending" value={current.pending} color="#f59e0b" />
          <MetricItem label="Timeout" value={current.timeout} color="#ef4444" />
        </div>
      )}

      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button onClick={() => setLocalTrend(!localTrend)} active={showTrend}>
          Trend
        </Button>
        <Button onClick={() => setLocalRecs(!localRecs)} active={showRecs}>
          Recommendations
        </Button>
        <Button onClick={() => setLocalLeaks(!localLeaks)} active={showLeaks}>
          Leak Detection
        </Button>
        <Button onClick={() => exportCSV(target.name)}>
          Export CSV
        </Button>
      </div>

      {showTrend && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            {['1h', '6h', '24h'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  marginRight: '8px',
                  padding: '4px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  backgroundColor: range === r ? '#3b82f6' : '#fff',
                  color: range === r ? '#fff' : '#374151',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                {r}
              </button>
            ))}
          </div>
          {history && history.datapoints.length > 0 ? (
            <TrendChart data={history.datapoints} height={200} />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              No data available
            </div>
          )}
        </div>
      )}

      {showRecs && (
        <div style={{ marginTop: '16px' }}>
          {recsLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
              Analyzing...
            </div>
          ) : recs ? (
            <div>
              <div style={{ marginBottom: '12px', fontSize: '12px', color: '#6b7280' }}>
                Analyzed {recs.data_points} data points | Peak usage: {recs.stats.peak_usage}%
              </div>
              {recs.recommendations.map((rec, i) => (
                <RecommendationItem key={i} rec={rec} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
              No recommendations available
            </div>
          )}
        </div>
      )}

      {showLeaks && (
        <div style={{ marginTop: '16px' }}>
          {leaksLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
              Analyzing for leaks...
            </div>
          ) : leaks ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: riskColors[leaks.leak_risk].bg,
                    color: riskColors[leaks.leak_risk].text,
                  }}
                >
                  Risk: {leaks.leak_risk.toUpperCase()}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  Health Score: {leaks.health_score >= 0 ? `${leaks.health_score}/100` : 'N/A'}
                </span>
              </div>
              {leaks.alerts.length > 0 ? (
                leaks.alerts.map((alert, i) => (
                  <LeakAlertItem key={i} alert={alert} />
                ))
              ) : (
                <div style={{ padding: '12px', backgroundColor: '#dcfce7', borderRadius: '8px', color: '#166534', fontSize: '13px' }}>
                  No leak indicators detected
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
              Unable to analyze
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
    </div>
  );
}

function Button({ children, onClick, active = false }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        backgroundColor: active ? '#3b82f6' : '#fff',
        color: active ? '#fff' : '#374151',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

function RecommendationItem({ rec }: { rec: Recommendation }) {
  const colors = severityColors[rec.severity] || severityColors.info;
  return (
    <div
      style={{
        padding: '12px',
        marginBottom: '8px',
        backgroundColor: colors.bg,
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 600, color: colors.text, fontSize: '14px' }}>{rec.type}</span>
        <span style={{ fontSize: '11px', color: colors.text, textTransform: 'uppercase' }}>{rec.severity}</span>
      </div>
      <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>{rec.reason}</div>
      {rec.current !== rec.recommended && (
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          {rec.current} → <strong>{rec.recommended}</strong>
        </div>
      )}
    </div>
  );
}

function LeakAlertItem({ alert }: { alert: LeakAlert }) {
  const colors = severityColors[alert.severity] || severityColors.warning;
  return (
    <div
      style={{
        padding: '12px',
        marginBottom: '8px',
        backgroundColor: colors.bg,
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 600, color: colors.text, fontSize: '14px' }}>{alert.type.replace(/_/g, ' ')}</span>
        <span style={{ fontSize: '11px', color: colors.text, textTransform: 'uppercase' }}>{alert.severity}</span>
      </div>
      <div style={{ fontSize: '13px', color: '#374151', marginBottom: '8px' }}>{alert.message}</div>
      {alert.suggestions.length > 0 && (
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          <strong>Suggestions:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {alert.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
