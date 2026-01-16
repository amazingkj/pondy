import { useState, useEffect, memo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAlerts, useActiveAlerts, useAlertStats, resolveAlert, sendTestAlert, getAlertChannels } from '../../hooks/useMetrics';
import type { TestAlertOptions } from '../../hooks/useMetrics';
import { severityColors, severityColorsDark } from '../../constants/colors';
import { AlertItemSkeleton } from '../Skeleton';
import { NoAlertsEmpty } from '../EmptyState';
import { AlertCard, StatBadge } from './AlertCard';
import { FilterButton, ButtonGroup } from '../common';

export const AlertHistoryTab = memo(function AlertHistoryTab() {
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
        <ButtonGroup aria-label="Alert filters">
          {(['all', 'active', 'resolved'] as const).map((f) => (
            <FilterButton
              key={f}
              active={filter === f}
              onClick={() => setFilter(f)}
              aria-label={`Show ${f} alerts`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </FilterButton>
          ))}
        </ButtonGroup>
        <button
          onClick={() => setShowTestPanel(!showTestPanel)}
          aria-expanded={showTestPanel}
          aria-controls="test-alert-panel"
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
          id="test-alert-panel"
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
            <ButtonGroup>
              {(['info', 'warning', 'critical'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setTestOptions(prev => ({ ...prev, severity: sev }))}
                  aria-pressed={testOptions.severity === sev}
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
            </ButtonGroup>
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
                    aria-pressed={testOptions.channels?.includes(ch)}
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
            <label htmlFor="test-message" style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
              Custom Message (optional)
            </label>
            <input
              id="test-message"
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
            aria-busy={sending}
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
          role="region"
          aria-label="Alert statistics"
        >
          <StatBadge label="Active" count={stats.active_alerts} color="#ef4444" themeColors={colors} />
          <StatBadge label="Critical" count={stats.critical_count} color="#dc2626" themeColors={colors} />
          <StatBadge label="Warning" count={stats.warning_count} color="#f59e0b" themeColors={colors} />
          <StatBadge label="Info" count={stats.info_count} color="#3b82f6" themeColors={colors} />
        </div>
      )}

      {/* Alert List */}
      <div style={{ padding: '8px' }} role="list" aria-label="Alert list">
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
});
