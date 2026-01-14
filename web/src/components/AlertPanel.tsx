import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts, useActiveAlerts, useAlertStats, resolveAlert, sendTestAlert, getAlertChannels, useMaintenanceWindows, useTargets, createMaintenanceWindow, deleteMaintenanceWindow } from '../hooks/useMetrics';
import type { TestAlertOptions } from '../hooks/useMetrics';
import { AlertRulesPanel } from './AlertRulesPanel';
import type { Alert, MaintenanceWindowInput } from '../types/metrics';
import { AlertItemSkeleton } from './Skeleton';
import { NoAlertsEmpty } from './EmptyState';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';

type Tab = 'history' | 'rules' | 'channels' | 'maintenance';

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
      role="dialog"
      aria-modal="true"
      aria-labelledby="alerts-title"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(500px, 100vw)',
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
          <h2 id="alerts-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
            Alerts
          </h2>
          <button
            onClick={onClose}
            aria-label="Close alerts panel"
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
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {([
            { key: 'history', label: 'History', icon: '📋' },
            { key: 'rules', label: 'Rules', icon: '⚙️' },
            { key: 'channels', label: 'Channels', icon: '📡' },
            { key: 'maintenance', label: 'Maintenance', icon: '🔧' },
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
        {activeTab === 'channels' && <AlertChannelsTab />}
        {activeTab === 'maintenance' && <MaintenanceTab />}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1, 2, 3].map((i) => (
              <AlertItemSkeleton key={i} />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <NoAlertsEmpty isActive={filter === 'active'} />
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

interface AlertingConfig {
  enabled: boolean;
  check_interval: string;
  cooldown: string;
  channels: {
    slack: {
      enabled: boolean;
      webhook_url: string;
      channel: string;
      username: string;
    };
    discord: {
      enabled: boolean;
      webhook_url: string;
    };
    mattermost: {
      enabled: boolean;
      webhook_url: string;
      channel: string;
      username: string;
    };
    webhook: {
      enabled: boolean;
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    email: {
      enabled: boolean;
      smtp_host: string;
      smtp_port: number;
      username: string;
      from: string;
      to: string[];
      use_tls: boolean;
    };
    notion: {
      enabled: boolean;
      database_id: string;
    };
  };
}

function AlertChannelsTab() {
  const { colors } = useTheme();
  const [config, setConfig] = useState<AlertingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config/alerting');
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch alerting config:', err);
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/config/alerting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save configuration');
      }

      setSuccess('Configuration saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const updateChannel = <T extends keyof AlertingConfig['channels']>(
    channel: T,
    field: keyof AlertingConfig['channels'][T],
    value: unknown
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      channels: {
        ...config.channels,
        [channel]: {
          ...config.channels[channel],
          [field]: value,
        },
      },
    });
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    color: colors.text,
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block' as const,
    marginBottom: '4px',
    color: colors.textSecondary,
    fontSize: '12px',
    fontWeight: 500 as const,
  };

  const sectionStyle = {
    padding: '14px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    marginBottom: '12px',
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
        Loading...
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
        Failed to load configuration
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      {error && (
        <div style={{
          padding: '10px 12px',
          backgroundColor: '#ef444420',
          border: '1px solid #ef4444',
          borderRadius: '6px',
          color: '#ef4444',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '10px 12px',
          backgroundColor: '#22c55e20',
          border: '1px solid #22c55e',
          borderRadius: '6px',
          color: '#22c55e',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          {success}
        </div>
      )}

      {/* Global Settings */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <input
            type="checkbox"
            id="alerting-enabled"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            style={{ width: '16px', height: '16px' }}
          />
          <label htmlFor="alerting-enabled" style={{ color: colors.text, fontSize: '14px', fontWeight: 600 }}>
            Enable Alerting
          </label>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Check Interval</label>
            <input
              type="text"
              value={config.check_interval}
              onChange={(e) => setConfig({ ...config, check_interval: e.target.value })}
              placeholder="30s"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Cooldown</label>
            <input
              type="text"
              value={config.cooldown}
              onChange={(e) => setConfig({ ...config, cooldown: e.target.value })}
              placeholder="5m"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Slack */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <input
            type="checkbox"
            id="slack-enabled"
            checked={config.channels.slack.enabled}
            onChange={(e) => updateChannel('slack', 'enabled', e.target.checked)}
            style={{ width: '16px', height: '16px' }}
          />
          <label htmlFor="slack-enabled" style={{ color: colors.text, fontSize: '14px', fontWeight: 600 }}>
            Slack
          </label>
        </div>
        {config.channels.slack.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Webhook URL</label>
              <input
                type="text"
                value={config.channels.slack.webhook_url}
                onChange={(e) => updateChannel('slack', 'webhook_url', e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Channel</label>
                <input
                  type="text"
                  value={config.channels.slack.channel}
                  onChange={(e) => updateChannel('slack', 'channel', e.target.value)}
                  placeholder="#alerts"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Username</label>
                <input
                  type="text"
                  value={config.channels.slack.username}
                  onChange={(e) => updateChannel('slack', 'username', e.target.value)}
                  placeholder="Pondy"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Discord */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <input
            type="checkbox"
            id="discord-enabled"
            checked={config.channels.discord.enabled}
            onChange={(e) => updateChannel('discord', 'enabled', e.target.checked)}
            style={{ width: '16px', height: '16px' }}
          />
          <label htmlFor="discord-enabled" style={{ color: colors.text, fontSize: '14px', fontWeight: 600 }}>
            Discord
          </label>
        </div>
        {config.channels.discord.enabled && (
          <div>
            <label style={labelStyle}>Webhook URL</label>
            <input
              type="text"
              value={config.channels.discord.webhook_url}
              onChange={(e) => updateChannel('discord', 'webhook_url', e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {/* Custom Webhook */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <input
            type="checkbox"
            id="webhook-enabled"
            checked={config.channels.webhook.enabled}
            onChange={(e) => updateChannel('webhook', 'enabled', e.target.checked)}
            style={{ width: '16px', height: '16px' }}
          />
          <label htmlFor="webhook-enabled" style={{ color: colors.text, fontSize: '14px', fontWeight: 600 }}>
            Custom Webhook
          </label>
        </div>
        {config.channels.webhook.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={labelStyle}>URL</label>
              <input
                type="text"
                value={config.channels.webhook.url}
                onChange={(e) => updateChannel('webhook', 'url', e.target.value)}
                placeholder="https://your-webhook-endpoint.com/alerts"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Method</label>
              <select
                value={config.channels.webhook.method || 'POST'}
                onChange={(e) => updateChannel('webhook', 'method', e.target.value)}
                style={inputStyle}
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Email */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <input
            type="checkbox"
            id="email-enabled"
            checked={config.channels.email.enabled}
            onChange={(e) => updateChannel('email', 'enabled', e.target.checked)}
            style={{ width: '16px', height: '16px' }}
          />
          <label htmlFor="email-enabled" style={{ color: colors.text, fontSize: '14px', fontWeight: 600 }}>
            Email
          </label>
        </div>
        {config.channels.email.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>SMTP Host</label>
                <input
                  type="text"
                  value={config.channels.email.smtp_host}
                  onChange={(e) => updateChannel('email', 'smtp_host', e.target.value)}
                  placeholder="smtp.gmail.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Port</label>
                <input
                  type="number"
                  value={config.channels.email.smtp_port || ''}
                  onChange={(e) => updateChannel('email', 'smtp_port', parseInt(e.target.value) || 0)}
                  placeholder="587"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Username</label>
                <input
                  type="text"
                  value={config.channels.email.username}
                  onChange={(e) => updateChannel('email', 'username', e.target.value)}
                  placeholder="user@example.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>From</label>
                <input
                  type="text"
                  value={config.channels.email.from}
                  onChange={(e) => updateChannel('email', 'from', e.target.value)}
                  placeholder="alerts@example.com"
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>To (comma separated)</label>
              <input
                type="text"
                value={config.channels.email.to?.join(', ') || ''}
                onChange={(e) => updateChannel('email', 'to', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="admin@example.com, team@example.com"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="email-tls"
                checked={config.channels.email.use_tls}
                onChange={(e) => updateChannel('email', 'use_tls', e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="email-tls" style={{ color: colors.text, fontSize: '13px' }}>
                Use TLS
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          padding: '10px 16px',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: '#3b82f6',
          color: '#fff',
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: 600,
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
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

// Maintenance Windows Tab
function MaintenanceTab() {
  const { colors } = useTheme();
  const toast = useToast();
  const { data, loading, error, refetch } = useMaintenanceWindows();
  const { data: targetsData } = useTargets();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<MaintenanceWindowInput>({
    name: '',
    description: '',
    target_name: '',
    start_time: '',
    end_time: '',
    recurring: false,
    days_of_week: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name || !formData.start_time || !formData.end_time) {
      setFormError('Please fill in required fields');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await createMaintenanceWindow(formData);
      setShowForm(false);
      setFormData({
        name: '',
        description: '',
        target_name: '',
        start_time: '',
        end_time: '',
        recurring: false,
        days_of_week: '',
      });
      refetch();
      toast.success('Maintenance window created successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create maintenance window';
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      await deleteMaintenanceWindow(deleteConfirm.id);
      refetch();
      toast.success('Maintenance window deleted');
    } catch (err) {
      toast.error('Failed to delete maintenance window');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const isActive = (window: { start_time: string; end_time: string; recurring: boolean }) => {
    if (window.recurring) return false; // Recurring check is complex, simplified here
    const now = new Date();
    const start = new Date(window.start_time);
    const end = new Date(window.end_time);
    return now >= start && now <= end;
  };

  const targets = targetsData?.targets?.map(t => t.name) || [];

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: colors.text }}>
            Maintenance Windows
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: colors.textSecondary }}>
            Alerts are suppressed during maintenance
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {showForm ? 'Cancel' : '+ Add Window'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            border: `1px solid ${colors.border}`,
          }}
        >
          {formError && (
            <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px', padding: '8px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>
              {formError}
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Weekly Deployment"
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                backgroundColor: colors.bgCard,
                color: colors.text,
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
              Target (empty = all targets)
            </label>
            <select
              value={formData.target_name || ''}
              onChange={(e) => setFormData({ ...formData, target_name: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                backgroundColor: colors.bgCard,
                color: colors.text,
                fontSize: '13px',
              }}
            >
              <option value="">All Targets</option>
              {targets.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
                Start Time *
              </label>
              <input
                type="datetime-local"
                value={formData.start_time ? formData.start_time.slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  backgroundColor: colors.bgCard,
                  color: colors.text,
                  fontSize: '13px',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
                End Time *
              </label>
              <input
                type="datetime-local"
                value={formData.end_time ? formData.end_time.slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  backgroundColor: colors.bgCard,
                  color: colors.text,
                  fontSize: '13px',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
              Description
            </label>
            <input
              type="text"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                backgroundColor: colors.bgCard,
                color: colors.text,
                fontSize: '13px',
              }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#22c55e',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Creating...' : 'Create Maintenance Window'}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: colors.textSecondary, fontSize: '13px', textAlign: 'center', padding: '20px' }}>
          Loading...
        </div>
      ) : error ? (
        <div style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
          {error}
        </div>
      ) : !data?.windows?.length ? (
        <div style={{ color: colors.textSecondary, fontSize: '13px', textAlign: 'center', padding: '40px' }}>
          No maintenance windows configured
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {data.windows.map((w) => {
            const active = isActive(w);
            return (
              <div
                key={w.id}
                style={{
                  padding: '12px',
                  backgroundColor: active ? 'rgba(34, 197, 94, 0.1)' : colors.bgSecondary,
                  border: `1px solid ${active ? '#22c55e' : colors.border}`,
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: colors.text, fontSize: '13px' }}>
                        {w.name}
                      </span>
                      {active && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          backgroundColor: '#22c55e',
                          color: '#fff',
                          borderRadius: '4px',
                        }}>
                          ACTIVE
                        </span>
                      )}
                      {w.recurring && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          backgroundColor: colors.bgCard,
                          color: colors.textSecondary,
                          borderRadius: '4px',
                          border: `1px solid ${colors.border}`,
                        }}>
                          Recurring
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: colors.textSecondary }}>
                      {w.target_name || 'All targets'} | {formatDateTime(w.start_time)} - {formatDateTime(w.end_time)}
                    </div>
                    {w.description && (
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                        {w.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteConfirm({ id: w.id, name: w.name })}
                    aria-label={`Delete ${w.name}`}
                    style={{
                      padding: '4px 8px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: colors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '10px',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Maintenance Window"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
