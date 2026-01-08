import { useState } from 'react';
import type { TargetStatus, Recommendation, LeakAlert } from '../types/metrics';
import { useHistory, useRecommendations, useLeakDetection, usePeakTime, useAnomalies, useComparison, exportCSV } from '../hooks/useMetrics';
import { PoolGauge } from './PoolGauge';
import { TrendChart } from './TrendChart';
import { HeatmapChart } from './HeatmapChart';
import type { GlobalView } from './Dashboard';
import { useTheme } from '../context/ThemeContext';

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
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showPeakTime, setShowPeakTime] = useState(false);
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [comparePeriod, setComparePeriod] = useState<'day' | 'week'>('day');
  const [range, setRange] = useState('1h');
  const { theme, colors: themeColors } = useTheme();

  const showTrend = globalView === 'trend' || localTrend;
  const showRecs = globalView === 'recs' || localRecs;
  const showLeaks = globalView === 'leaks' || localLeaks;

  const needHistory = showTrend || showHeatmap;
  const { data: history } = useHistory(needHistory ? target.name : '', showHeatmap ? '24h' : range);
  const { data: recs, loading: recsLoading } = useRecommendations(target.name, showRecs);
  const { data: leaks, loading: leaksLoading } = useLeakDetection(target.name, showLeaks);
  const { data: peakTime, loading: peakTimeLoading } = usePeakTime(target.name, showPeakTime);
  const { data: anomalies, loading: anomaliesLoading } = useAnomalies(target.name, showAnomalies);
  const { data: comparison, loading: comparisonLoading } = useComparison(target.name, comparePeriod, showCompare);

  const statusColor = statusColors[target.status];
  const current = target.current;

  return (
    <div
      style={{
        border: `2px solid ${statusColor.border}`,
        borderRadius: '12px',
        padding: '20px',
        backgroundColor: themeColors.bgCard,
        boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'background-color 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: themeColors.text }}>{target.name}</h3>
          <span
            style={{
              display: 'inline-block',
              marginTop: '8px',
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: statusColor.bg,
              color: statusColor.text,
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
            backgroundColor: themeColors.bgSecondary,
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
        <Button onClick={() => setShowHeatmap(!showHeatmap)} active={showHeatmap}>
          Heatmap
        </Button>
        <Button onClick={() => setShowPeakTime(!showPeakTime)} active={showPeakTime}>
          Peak Time
        </Button>
        <Button onClick={() => setShowAnomalies(!showAnomalies)} active={showAnomalies}>
          Anomalies
        </Button>
        <Button onClick={() => setShowCompare(!showCompare)} active={showCompare}>
          Compare
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
        <Button onClick={() => window.open(`/api/targets/${target.name}/report?range=24h`, '_blank')}>
          Report
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
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '4px',
                  backgroundColor: range === r ? '#3b82f6' : themeColors.bgCard,
                  color: range === r ? '#fff' : themeColors.text,
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
            <div style={{ textAlign: 'center', padding: '40px', color: themeColors.textSecondary }}>
              No data available
            </div>
          )}
        </div>
      )}

      {showHeatmap && (
        <div style={{ marginTop: '16px' }}>
          {history && history.datapoints.length > 0 ? (
            <HeatmapChart data={history.datapoints} />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: themeColors.textSecondary }}>
              No data available
            </div>
          )}
        </div>
      )}

      {showPeakTime && (
        <div style={{ marginTop: '16px' }}>
          {peakTimeLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary }}>
              Analyzing peak times...
            </div>
          ) : peakTime && peakTime.summary ? (
            <div>
              <div style={{ marginBottom: '12px', fontSize: '12px', color: themeColors.textSecondary }}>
                Analyzed {peakTime.data_points || 0} data points (24h)
              </div>
              <div style={{ padding: '12px', backgroundColor: themeColors.bgSecondary, borderRadius: '8px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: themeColors.text, marginBottom: '8px' }}>Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: themeColors.textSecondary }}>Busiest Hour: </span>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{peakTime.summary.busiest_hour ?? 0}:00</span>
                    <span style={{ color: themeColors.textSecondary }}> ({(peakTime.summary.busiest_hour_usage ?? 0).toFixed(1)}%)</span>
                  </div>
                  <div>
                    <span style={{ color: themeColors.textSecondary }}>Quietest Hour: </span>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{peakTime.summary.quietest_hour ?? 0}:00</span>
                    <span style={{ color: themeColors.textSecondary }}> ({(peakTime.summary.quietest_usage ?? 0).toFixed(1)}%)</span>
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: themeColors.text }}>{peakTime.summary.recommendation || ''}</div>
              </div>
              {peakTime.peak_hours && peakTime.peak_hours.length > 0 && (
                <>
                  <div style={{ fontSize: '12px', color: themeColors.textSecondary, marginBottom: '4px' }}>Peak Hours</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {peakTime.peak_hours.map((h) => (
                      <span key={h.hour} style={{ padding: '4px 8px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '11px' }}>
                        {h.hour}:00 ({(h.avg_usage ?? 0).toFixed(0)}%)
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary }}>
              No peak time data available
            </div>
          )}
        </div>
      )}

      {showAnomalies && (
        <div style={{ marginTop: '16px' }}>
          {anomaliesLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary }}>
              Detecting anomalies...
            </div>
          ) : anomalies && anomalies.statistics ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: anomalies.risk_level === 'high' ? '#fee2e2' : anomalies.risk_level === 'elevated' ? '#fef3c7' : '#dcfce7',
                    color: anomalies.risk_level === 'high' ? '#991b1b' : anomalies.risk_level === 'elevated' ? '#92400e' : '#166534',
                  }}
                >
                  Risk: {(anomalies.risk_level || 'unknown').toUpperCase()}
                </span>
                <span style={{ fontSize: '12px', color: themeColors.textSecondary }}>
                  {anomalies.statistics.anomaly_count || 0} anomalies ({(anomalies.statistics.anomaly_percent ?? 0).toFixed(1)}%)
                </span>
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: themeColors.bgSecondary, borderRadius: '8px', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: themeColors.textSecondary }}>Mean: </span>
                <span style={{ color: themeColors.text }}>{(anomalies.statistics.mean_usage ?? 0).toFixed(1)}%</span>
                <span style={{ color: themeColors.textSecondary, marginLeft: '12px' }}>Std Dev: </span>
                <span style={{ color: themeColors.text }}>{(anomalies.statistics.std_deviation ?? 0).toFixed(1)}</span>
              </div>
              {anomalies.anomalies && anomalies.anomalies.length > 0 ? (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {anomalies.anomalies.slice(0, 10).map((a, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px',
                        marginBottom: '8px',
                        backgroundColor: a.severity === 'critical' ? '#fee2e2' : '#fef3c7',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: a.severity === 'critical' ? '#991b1b' : '#92400e' }}>
                          {(a.type || '').replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: '11px', color: a.severity === 'critical' ? '#991b1b' : '#92400e', textTransform: 'uppercase' }}>{a.severity}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>{a.message}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {new Date(a.timestamp).toLocaleTimeString()} | Deviation: {(a.deviation ?? 0).toFixed(1)}
                      </div>
                    </div>
                  ))}
                  {anomalies.anomalies.length > 10 && (
                    <div style={{ fontSize: '12px', color: themeColors.textSecondary, textAlign: 'center', padding: '8px' }}>
                      +{anomalies.anomalies.length - 10} more anomalies
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '12px', backgroundColor: '#dcfce7', borderRadius: '8px', color: '#166534', fontSize: '13px' }}>
                  No anomalies detected
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary }}>
              Unable to analyze
            </div>
          )}
        </div>
      )}

      {showCompare && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            {(['day', 'week'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setComparePeriod(p)}
                style={{
                  marginRight: '8px',
                  padding: '4px 12px',
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '4px',
                  backgroundColor: comparePeriod === p ? '#3b82f6' : themeColors.bgCard,
                  color: comparePeriod === p ? '#fff' : themeColors.text,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                {p === 'day' ? 'Today vs Yesterday' : 'This Week vs Last Week'}
              </button>
            ))}
          </div>
          {comparisonLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary }}>
              Comparing periods...
            </div>
          ) : comparison ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div style={{ padding: '12px', backgroundColor: themeColors.bgSecondary, borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: themeColors.text, marginBottom: '8px' }}>
                    {comparePeriod === 'day' ? 'Today' : 'This Week'}
                  </div>
                  <div style={{ fontSize: '12px', color: themeColors.textSecondary }}>
                    <div>Avg Usage: <span style={{ color: themeColors.text }}>{(comparison.current_period.avg_usage ?? 0).toFixed(1)}%</span></div>
                    <div>Max Usage: <span style={{ color: themeColors.text }}>{(comparison.current_period.max_usage ?? 0).toFixed(1)}%</span></div>
                    <div>Data Points: <span style={{ color: themeColors.text }}>{comparison.current_period.data_points ?? 0}</span></div>
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: themeColors.bgSecondary, borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: themeColors.text, marginBottom: '8px' }}>
                    {comparePeriod === 'day' ? 'Yesterday' : 'Last Week'}
                  </div>
                  <div style={{ fontSize: '12px', color: themeColors.textSecondary }}>
                    <div>Avg Usage: <span style={{ color: themeColors.text }}>{(comparison.previous_period.avg_usage ?? 0).toFixed(1)}%</span></div>
                    <div>Max Usage: <span style={{ color: themeColors.text }}>{(comparison.previous_period.max_usage ?? 0).toFixed(1)}%</span></div>
                    <div>Data Points: <span style={{ color: themeColors.text }}>{comparison.previous_period.data_points ?? 0}</span></div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', backgroundColor: comparison.changes.trend === 'improving' ? '#dcfce7' : comparison.changes.trend === 'degrading' ? '#fee2e2' : themeColors.bgSecondary }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: comparison.changes.trend === 'improving' ? '#166534' : comparison.changes.trend === 'degrading' ? '#991b1b' : themeColors.text }}>
                    {comparison.changes.trend === 'improving' ? '↓ Improving' : comparison.changes.trend === 'degrading' ? '↑ Degrading' : '→ Stable'}
                  </span>
                  <span style={{ fontSize: '12px', color: themeColors.textSecondary }}>
                    Avg Usage: {comparison.changes.avg_usage_change >= 0 ? '+' : ''}{(comparison.changes.avg_usage_change ?? 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: themeColors.textSecondary }}>
              No data available for comparison
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
  const { colors } = useTheme();
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: '12px', color: colors.textSecondary }}>{label}</div>
    </div>
  );
}

function Button({ children, onClick, active = false }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
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
