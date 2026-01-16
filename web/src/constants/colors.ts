// Centralized color definitions for consistent styling across components

// Status colors for target/instance status indicators
export const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  healthy: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  running: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  warning: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  unknown: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  offline: { bg: '#fef2f2', text: '#7f1d1d', border: '#991b1b' },
};

export const statusLabels: Record<string, string> = {
  healthy: 'RUNNING',
  running: 'RUNNING',
  warning: 'WARNING',
  critical: 'CRITICAL',
  unknown: 'UNKNOWN',
  offline: 'OFFLINE',
};

// Alert severity colors (light theme)
export const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  warning: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  info: { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
};

// Alert severity colors (dark theme)
export const severityColorsDark: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#450a0a', text: '#fca5a5', border: '#7f1d1d' },
  warning: { bg: '#451a03', text: '#fcd34d', border: '#78350f' },
  info: { bg: '#172554', text: '#93c5fd', border: '#1e3a8a' },
};

// Memory usage color thresholds
export function getMemoryColor(ratio: number): string {
  if (ratio >= 0.9) return '#ef4444';
  if (ratio >= 0.75) return '#f59e0b';
  return '#22c55e';
}

// Common UI colors
export const uiColors = {
  primary: '#3b82f6',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
} as const;

// Severity emojis
export const severityEmojis: Record<string, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};
