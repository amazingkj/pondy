import { memo } from 'react';
import type { Alert } from '../../types/metrics';
import { severityEmojis } from '../../constants/colors';

interface AlertCardProps {
  alert: Alert;
  colors: Record<string, { bg: string; text: string; border: string }>;
  themeColors: { text: string; textSecondary: string; border: string };
  formatTime: (ts: string) => string;
  getTimeDiff: (ts: string) => string;
  onResolve: (id: number) => void;
}

export const AlertCard = memo(function AlertCard({
  alert,
  colors,
  themeColors,
  formatTime,
  getTimeDiff,
  onResolve,
}: AlertCardProps) {
  const sevColor = colors[alert.severity] || colors.info;
  const isActive = alert.status === 'fired';

  return (
    <div
      role="article"
      aria-label={`${alert.severity} alert: ${alert.rule_name}`}
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
          <span style={{ fontSize: '14px' }} aria-hidden="true">
            {severityEmojis[alert.severity] || severityEmojis.info}
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
            aria-label={`Resolve alert: ${alert.rule_name}`}
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
});

interface StatBadgeProps {
  label: string;
  count: number;
  color: string;
  themeColors: { text: string; textSecondary: string };
}

export const StatBadge = memo(function StatBadge({ label, count, color, themeColors }: StatBadgeProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: color,
        }}
        aria-hidden="true"
      />
      <span style={{ fontSize: '12px', color: themeColors.textSecondary }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: themeColors.text }}>{count}</span>
    </div>
  );
});
