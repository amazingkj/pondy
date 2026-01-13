import { useState } from 'react';
import { useHistory, useRecommendations, useLeakDetection, usePeakTime, useAnomalies, useComparison } from '../hooks/useMetrics';
import type { AnomalySensitivity } from '../hooks/useMetrics';
import type { InstanceStatus } from '../types/metrics';
import { TrendChart } from './TrendChart';
import { HeatmapChart } from './HeatmapChart';
import { ExportModal } from './ExportModal';
import { useTheme } from '../context/ThemeContext';

export type DetailView = 'trend' | 'heatmap' | 'peakTime' | 'anomalies' | 'compare' | 'recs' | 'leaks' | null;

interface TargetDetailPanelProps {
  targetName: string;
  instances?: InstanceStatus[];
  detailView: DetailView;
  setDetailView: (v: DetailView) => void;
  detailRange: string;
  setDetailRange: (r: string) => void;
}

export function TargetDetailPanel({
  targetName,
  instances,
  detailView,
  setDetailView,
  detailRange,
  setDetailRange,
}: TargetDetailPanelProps) {
  const { colors } = useTheme();
  const [comparePeriod, setComparePeriod] = useState<'day' | 'week'>('day');
  const [anomalyRange, setAnomalyRange] = useState('24h');
  const [anomalySensitivity, setAnomalySensitivity] = useState<AnomalySensitivity>('medium');
  const [showExportModal, setShowExportModal] = useState(false);

  const needHistory = detailView === 'trend' || detailView === 'heatmap';
  const { data: history, loading: historyLoading } = useHistory(needHistory ? targetName : '', detailView === 'heatmap' ? '24h' : detailRange);
  const { data: recs, loading: recsLoading } = useRecommendations(targetName, detailView === 'recs');
  const { data: leaks, loading: leaksLoading } = useLeakDetection(targetName, detailView === 'leaks');
  const { data: peakTime, loading: peakTimeLoading } = usePeakTime(targetName, detailView === 'peakTime');
  const { data: anomalies, loading: anomaliesLoading } = useAnomalies(targetName, detailView === 'anomalies', anomalyRange, anomalySensitivity);
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
        <button
          onClick={() => setShowExportModal(true)}
          style={{
            padding: '4px 12px',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            backgroundColor: '#22c55e',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
          }}
        >
          Export / Report
        </button>
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
          {/* Range and Sensitivity Options */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: colors.textSecondary }}>Range:</span>
              {['1h', '6h', '12h', '24h', '7d'].map((r) => (
                <button
                  key={r}
                  onClick={() => setAnomalyRange(r)}
                  style={{
                    padding: '3px 8px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    backgroundColor: anomalyRange === r ? '#3b82f6' : colors.bgCard,
                    color: anomalyRange === r ? '#fff' : colors.text,
                    cursor: 'pointer',
                    fontSize: '10px',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: colors.textSecondary }}>Sensitivity:</span>
              {(['low', 'medium', 'high'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAnomalySensitivity(s)}
                  style={{
                    padding: '3px 8px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    backgroundColor: anomalySensitivity === s ? '#3b82f6' : colors.bgCard,
                    color: anomalySensitivity === s ? '#fff' : colors.text,
                    cursor: 'pointer',
                    fontSize: '10px',
                    textTransform: 'capitalize',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

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

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          targetName={targetName}
          instances={instances}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
