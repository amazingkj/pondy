import { useState, useEffect, useCallback, memo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import type { AlertingConfig } from './types';
import { LabelledCheckbox } from '../common';

export const AlertChannelsTab = memo(function AlertChannelsTab() {
  const { colors } = useTheme();
  const [config, setConfig] = useState<AlertingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config/alerting');
      const data = await res.json() as AlertingConfig;
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
    value: AlertingConfig['channels'][T][keyof AlertingConfig['channels'][T]]
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
      <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }} role="status" aria-live="polite">
        Loading...
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }} role="alert">
        Failed to load configuration
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      {error && (
        <div role="alert" style={{
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
        <div role="status" aria-live="polite" style={{
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
        <div style={{ marginBottom: '12px' }}>
          <LabelledCheckbox
            id="alerting-enabled"
            label="Enable Alerting"
            checked={config.enabled}
            onChange={(checked) => setConfig({ ...config, enabled: checked })}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="check-interval" style={labelStyle}>Check Interval</label>
            <input
              id="check-interval"
              type="text"
              value={config.check_interval}
              onChange={(e) => setConfig({ ...config, check_interval: e.target.value })}
              placeholder="30s"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="cooldown" style={labelStyle}>Cooldown</label>
            <input
              id="cooldown"
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
        <div style={{ marginBottom: '12px' }}>
          <LabelledCheckbox
            id="slack-enabled"
            label="Slack"
            checked={config.channels.slack.enabled}
            onChange={(checked) => updateChannel('slack', 'enabled', checked)}
          />
        </div>
        {config.channels.slack.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label htmlFor="slack-webhook" style={labelStyle}>Webhook URL</label>
              <input
                id="slack-webhook"
                type="text"
                value={config.channels.slack.webhook_url}
                onChange={(e) => updateChannel('slack', 'webhook_url', e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="slack-channel" style={labelStyle}>Channel</label>
                <input
                  id="slack-channel"
                  type="text"
                  value={config.channels.slack.channel}
                  onChange={(e) => updateChannel('slack', 'channel', e.target.value)}
                  placeholder="#alerts"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="slack-username" style={labelStyle}>Username</label>
                <input
                  id="slack-username"
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
        <div style={{ marginBottom: '12px' }}>
          <LabelledCheckbox
            id="discord-enabled"
            label="Discord"
            checked={config.channels.discord.enabled}
            onChange={(checked) => updateChannel('discord', 'enabled', checked)}
          />
        </div>
        {config.channels.discord.enabled && (
          <div>
            <label htmlFor="discord-webhook" style={labelStyle}>Webhook URL</label>
            <input
              id="discord-webhook"
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
        <div style={{ marginBottom: '12px' }}>
          <LabelledCheckbox
            id="webhook-enabled"
            label="Custom Webhook"
            checked={config.channels.webhook.enabled}
            onChange={(checked) => updateChannel('webhook', 'enabled', checked)}
          />
        </div>
        {config.channels.webhook.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label htmlFor="webhook-url" style={labelStyle}>URL</label>
              <input
                id="webhook-url"
                type="text"
                value={config.channels.webhook.url}
                onChange={(e) => updateChannel('webhook', 'url', e.target.value)}
                placeholder="https://your-webhook-endpoint.com/alerts"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="webhook-method" style={labelStyle}>Method</label>
              <select
                id="webhook-method"
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
        <div style={{ marginBottom: '12px' }}>
          <LabelledCheckbox
            id="email-enabled"
            label="Email"
            checked={config.channels.email.enabled}
            onChange={(checked) => updateChannel('email', 'enabled', checked)}
          />
        </div>
        {config.channels.email.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 2 }}>
                <label htmlFor="smtp-host" style={labelStyle}>SMTP Host</label>
                <input
                  id="smtp-host"
                  type="text"
                  value={config.channels.email.smtp_host}
                  onChange={(e) => updateChannel('email', 'smtp_host', e.target.value)}
                  placeholder="smtp.gmail.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="smtp-port" style={labelStyle}>Port</label>
                <input
                  id="smtp-port"
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
                <label htmlFor="email-username" style={labelStyle}>Username</label>
                <input
                  id="email-username"
                  type="text"
                  value={config.channels.email.username}
                  onChange={(e) => updateChannel('email', 'username', e.target.value)}
                  placeholder="user@example.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="email-from" style={labelStyle}>From</label>
                <input
                  id="email-from"
                  type="text"
                  value={config.channels.email.from}
                  onChange={(e) => updateChannel('email', 'from', e.target.value)}
                  placeholder="alerts@example.com"
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label htmlFor="email-to" style={labelStyle}>To (comma separated)</label>
              <input
                id="email-to"
                type="text"
                value={config.channels.email.to?.join(', ') || ''}
                onChange={(e) => updateChannel('email', 'to', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="admin@example.com, team@example.com"
                style={inputStyle}
              />
            </div>
            <LabelledCheckbox
              id="email-tls"
              label="Use TLS"
              checked={config.channels.email.use_tls}
              onChange={(checked) => updateChannel('email', 'use_tls', checked)}
            />
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        aria-busy={saving}
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
});
