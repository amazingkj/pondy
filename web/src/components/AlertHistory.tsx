import { useState } from 'react';
import { useAlerts, useActiveAlerts, useAlertStats, resolveAlert, sendTestAlert } from '../hooks/useMetrics';
import { useTheme } from '../context/ThemeContext';
import type { Alert } from '../types/metrics';

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  warning: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  info: { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
};

const severityColorsDark: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#450a0a', text: '#fca5a5', border: '#7f1d1d' },
  warning: { bg: '#451a03', text: '#fcd34d', border: '#78350f' },
  info: { bg: '#172554', text: '#93c5fd', border: '#1e3a8a' },
};

interface AlertHistoryProps {
  onClose: () => void;
}

export function AlertHistory({ onClose }: AlertHistoryProps) {
  const { theme, colors } = useTheme();
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [sending, setSending] = useState(false);

  const { data: allAlerts, loading: allLoading, refetch: refetchAll } = useAlerts(
    filter === 'resolved' ? 'resolved' : undefined
  );
  const { data: activeAlerts, loading: activeLoading, refetch: refetchActive } = useActiveAlerts();
  const { data: stats } = useAlertStats();

  const alerts = filter === 'active' ? activeAlerts : allAlerts;
  const loading = filter === 'active' ? activeLoading : allLoading;

  const handleResolve = async (id: number) => {
    const result = await resolveAlert(id);
    if (result) {
      refetchAll();
      refetchActive();
    }
  };

  const handleTestAlert = async () => {
    setSending(true);
    await sendTestAlert();
    setSending(false);
    refetchAll();
    refetchActive();
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeDiff = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const sevColors = theme === 'dark' ? severityColorsDark : severityColors;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '450px',
        maxWidth: '100vw',
        backgroundColor: colors.bgCard,
        borderLeft: `1px solid ${colors.border}`,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
            Alerts
          </h2>
          {stats && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '12px' }}>
              <span style={{ color: '#ef4444' }}>
                {stats.active_alerts} active
              </span>
              <span style={{ color: colors.textSecondary }}>
                {stats.total_alerts} total
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: colors.textSecondary,
            fontSize: '20px',
          }}
        >
          &times;
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'active', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${filter === f ? '#3b82f6' : colors.border}`,
                borderRadius: '4px',
                backgroundColor: filter === f ? '#3b82f6' : 'transparent',
                color: filter === f ? '#fff' : colors.text,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={handleTestAlert}
          disabled={sending}
          style={{
            padding: '6px 12px',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            backgroundColor: colors.bgSecondary,
            color: colors.text,
            cursor: sending ? 'wait' : 'pointer',
            fontSize: '11px',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? 'Sending...' : 'Test Alert'}
        </button>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            gap: '16px',
          }}
        >
          <StatBadge label="Critical" count={stats.critical_count} color="#ef4444" />
          <StatBadge label="Warning" count={stats.warning_count} color="#f59e0b" />
          <StatBadge label="Info" count={stats.info_count} color="#3b82f6" />
        </div>
      )}

      {/* Alert List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
            Loading...
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>
              {filter === 'active' ? '✓' : '🔔'}
            </div>
            <div>
              {filter === 'active' ? 'No active alerts' : 'No alerts yet'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                colors={sevColors}
                themeColors={colors}
                formatTime={formatTime}
                getTimeDiff={getTimeDiff}
                onResolve={handleResolve}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  const { colors } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: color,
        }}
      />
      <span style={{ fontSize: '12px', color: colors.textSecondary }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>{count}</span>
    </div>
  );
}

interface AlertCardProps {
  alert: Alert;
  colors: Record<string, { bg: string; text: string; border: string }>;
  themeColors: { text: string; textSecondary: string; border: string };
  formatTime: (ts: string) => string;
  getTimeDiff: (ts: string) => string;
  onResolve: (id: number) => void;
}

function AlertCard({ alert, colors, themeColors, formatTime, getTimeDiff, onResolve }: AlertCardProps) {
  const sevColor = colors[alert.severity] || colors.info;
  const isActive = alert.status === 'fired';

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: sevColor.bg,
        borderRadius: '8px',
        border: `1px solid ${sevColor.border}`,
        opacity: isActive ? 1 : 0.7,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>
            {alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <span style={{ fontWeight: 600, color: sevColor.text, fontSize: '13px' }}>
            {alert.rule_name}
          </span>
        </div>
        <span
          style={{
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 600,
            backgroundColor: isActive ? '#ef4444' : '#22c55e',
            color: '#fff',
          }}
        >
          {isActive ? 'ACTIVE' : 'RESOLVED'}
        </span>
      </div>

      <div style={{ fontSize: '12px', color: sevColor.text, marginBottom: '8px' }}>
        {alert.message}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', color: themeColors.textSecondary }}>
          <span style={{ fontWeight: 500 }}>{alert.target_name}</span>
          {alert.instance_name && alert.instance_name !== alert.target_name && (
            <span> / {alert.instance_name}</span>
          )}
          <span style={{ marginLeft: '8px' }}>{getTimeDiff(alert.fired_at)}</span>
        </div>

        {isActive && (
          <button
            onClick={() => onResolve(alert.id)}
            style={{
              padding: '4px 8px',
              border: `1px solid ${themeColors.border}`,
              borderRadius: '4px',
              backgroundColor: 'rgba(255,255,255,0.8)',
              color: '#166534',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 500,
            }}
          >
            Resolve
          </button>
        )}
      </div>

      {alert.resolved_at && (
        <div style={{ fontSize: '10px', color: themeColors.textSecondary, marginTop: '4px' }}>
          Resolved: {formatTime(alert.resolved_at)}
        </div>
      )}
    </div>
  );
}
