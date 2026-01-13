import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts, useActiveAlerts, useAlertStats, resolveAlert, sendTestAlert, getAlertChannels } from '../hooks/useMetrics';
import type { TestAlertOptions } from '../hooks/useMetrics';
import { AlertRulesPanel } from './AlertRulesPanel';
import type { Alert } from '../types/metrics';

type Tab = 'history' | 'rules';

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

interface AlertPanelProps {
  onClose: () => void;
  initialTab?: Tab;
}

export function AlertPanel({ onClose, initialTab = 'history' }: AlertPanelProps) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '500px',
        maxWidth: '100vw',
        backgroundColor: colors.bgCard,
        borderLeft: `1px solid ${colors.border}`,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header with Tabs */}
      <div
        style={{
          padding: '16px',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
            Alerts
          </h2>
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

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {([
            { key: 'history', label: 'History', icon: '📋' },
            { key: 'rules', label: 'Rules', icon: '⚙️' },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderBottom: activeTab === key ? `2px solid #3b82f6` : '2px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === key ? '#3b82f6' : colors.textSecondary,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: activeTab === key ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'history' && <AlertHistoryTab />}
        {activeTab === 'rules' && <AlertRulesPanel />}
      </div>
    </div>
  );
}

function AlertHistoryTab() {
  const { theme, colors } = useTheme();
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [sending, setSending] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [testOptions, setTestOptions] = useState<TestAlertOptions>({
    severity: 'warning',
    channels: [],
    message: '',
  });

  const { data: allAlerts, loading: allLoading, refetch: refetchAll } = useAlerts(
    filter === 'resolved' ? 'resolved' : undefined
  );
  const { data: activeAlerts, loading: activeLoading, refetch: refetchActive } = useActiveAlerts();
  const { data: stats } = useAlertStats();

  const alerts = filter === 'active' ? activeAlerts : allAlerts;
  const loading = filter === 'active' ? activeLoading : allLoading;

  // Load available channels
  useEffect(() => {
    if (showTestPanel) {
      getAlertChannels().then(setAvailableChannels);
    }
  }, [showTestPanel]);

  const handleResolve = async (id: number) => {
    const result = await resolveAlert(id);
    if (result) {
      refetchAll();
      refetchActive();
    }
  };

  const handleTestAlert = async () => {
    setSending(true);
    await sendTestAlert(testOptions);
    setSending(false);
    refetchAll();
    refetchActive();
    setShowTestPanel(false);
  };

  const toggleChannel = (channel: string) => {
    setTestOptions(prev => ({
      ...prev,
      channels: prev.channels?.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...(prev.channels || []), channel],
    }));
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
    <div>
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
          onClick={() => setShowTestPanel(!showTestPanel)}
          style={{
            padding: '6px 12px',
            border: `1px solid ${showTestPanel ? '#3b82f6' : colors.border}`,
            borderRadius: '4px',
            backgroundColor: showTestPanel ? '#3b82f6' : colors.bgSecondary,
            color: showTestPanel ? '#fff' : colors.text,
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          Test Alert
        </button>
      </div>

      {/* Test Alert Panel */}
      {showTestPanel && (
        <div
          style={{
            padding: '16px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSecondary,
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
              Severity
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['info', 'warning', 'critical'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setTestOptions(prev => ({ ...prev, severity: sev }))}
                  style={{
                    padding: '6px 12px',
                    border: `1px solid ${testOptions.severity === sev ? severityColors[sev].border : colors.border}`,
                    borderRadius: '4px',
                    backgroundColor: testOptions.severity === sev ? severityColors[sev].bg : 'transparent',
                    color: testOptions.severity === sev ? severityColors[sev].text : colors.text,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    textTransform: 'capitalize',
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
              Channels {availableChannels.length === 0 && '(none configured)'}
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {availableChannels.length > 0 ? (
                availableChannels.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => toggleChannel(ch)}
                    style={{
                      padding: '6px 12px',
                      border: `1px solid ${testOptions.channels?.includes(ch) ? '#3b82f6' : colors.border}`,
                      borderRadius: '4px',
                      backgroundColor: testOptions.channels?.includes(ch) ? '#3b82f6' : 'transparent',
                      color: testOptions.channels?.includes(ch) ? '#fff' : colors.text,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 500,
                      textTransform: 'capitalize',
                    }}
                  >
                    {ch}
                  </button>
                ))
              ) : (
                <span style={{ fontSize: '11px', color: colors.textSecondary }}>
                  Configure channels in config.yaml
                </span>
              )}
            </div>
            {testOptions.channels && testOptions.channels.length === 0 && availableChannels.length > 0 && (
              <span style={{ fontSize: '10px', color: colors.textSecondary, marginTop: '4px', display: 'block' }}>
                Select none to send to all channels
              </span>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
              Custom Message (optional)
            </label>
            <input
              type="text"
              value={testOptions.message || ''}
              onChange={(e) => setTestOptions(prev => ({ ...prev, message: e.target.value }))}
              placeholder="This is a test alert from Pondy"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                backgroundColor: colors.bgCard,
                color: colors.text,
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          <button
            onClick={handleTestAlert}
            disabled={sending}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              cursor: sending ? 'wait' : 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? 'Sending...' : 'Send Test Alert'}
          </button>
        </div>
      )}

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
          <StatBadge label="Active" count={stats.active_alerts} color="#ef4444" />
          <StatBadge label="Critical" count={stats.critical_count} color="#dc2626" />
          <StatBadge label="Warning" count={stats.warning_count} color="#f59e0b" />
          <StatBadge label="Info" count={stats.info_count} color="#3b82f6" />
        </div>
      )}

      {/* Alert List */}
      <div style={{ padding: '8px' }}>
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
