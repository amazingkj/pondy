import { useState, useEffect, useCallback, useRef } from 'react';
import type { TargetsResponse, HistoryResponse, AnalysisResult, LeakAnalysisResult, Alert, AlertsResponse, AlertStats } from '../types/metrics';

const API_BASE = '/api';

// Hook to check if the page is visible
function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

// Settings interface
export interface Settings {
  timezone: string;
}

// Cache for settings
let cachedSettings: Settings | null = null;

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(cachedSettings);
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    if (cachedSettings) return;

    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/settings`);
        if (res.ok) {
          const json = await res.json();
          cachedSettings = json;
          setSettings(json);
        }
      } catch {
        // Use default settings
        cachedSettings = { timezone: 'Local' };
        setSettings(cachedSettings);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  return { settings, loading };
}

// Format time based on timezone setting
export function formatTime(timestamp: string | undefined | null, timezone: string = 'Local'): string {
  if (!timestamp) return '--:--';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '--:--';

  // Handle special timezone values
  if (timezone === 'Local' || timezone === '') {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Use specific timezone
  try {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone === 'UTC' ? 'UTC' : timezone,
    });
  } catch {
    // Fallback to local time if timezone is invalid
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

// Format date+time for longer ranges (includes month/day)
export function formatDateTime(timestamp: string | undefined | null, timezone: string = 'Local'): string {
  if (!timestamp) return '--/-- --:--';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '--/-- --:--';

  const options: Intl.DateTimeFormatOptions = {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };

  // Handle special timezone values
  if (timezone === 'Local' || timezone === '') {
    return date.toLocaleString('ko-KR', options);
  }

  // Use specific timezone
  try {
    return date.toLocaleString('ko-KR', {
      ...options,
      timeZone: timezone === 'UTC' ? 'UTC' : timezone,
    });
  } catch {
    return date.toLocaleString('ko-KR', options);
  }
}

export function useTargets(refreshInterval = 5000) {
  const [data, setData] = useState<TargetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isVisible = usePageVisibility();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/targets`);
      if (!res.ok) throw new Error('Failed to fetch targets');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  // Pause polling when tab is not visible
  useEffect(() => {
    if (isVisible) {
      fetchTargets(); // Refresh immediately when becoming visible
      intervalRef.current = setInterval(fetchTargets, refreshInterval);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isVisible, fetchTargets, refreshInterval]);

  return { data, loading, error, refetch: fetchTargets };
}

// History cache with TTL
const historyCache = new Map<string, { data: HistoryResponse; timestamp: number }>();
const HISTORY_CACHE_TTL = 5000; // 5 seconds
const MAX_CHART_POINTS = 200; // Maximum data points for smooth rendering

// Downsample data for better chart performance
function downsampleData(datapoints: HistoryResponse['datapoints'], maxPoints: number): HistoryResponse['datapoints'] {
  if (!datapoints || datapoints.length <= maxPoints) return datapoints;

  const step = Math.ceil(datapoints.length / maxPoints);
  const result: typeof datapoints = [];

  for (let i = 0; i < datapoints.length; i += step) {
    // Take the point with highest activity in each window
    let maxPoint = datapoints[i];
    for (let j = i + 1; j < Math.min(i + step, datapoints.length); j++) {
      if (datapoints[j].active > maxPoint.active) {
        maxPoint = datapoints[j];
      }
    }
    result.push(maxPoint);
  }

  return result;
}

export function useHistory(targetName: string, range = '1h') {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isVisible = usePageVisibility();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!targetName) return;

    const cacheKey = `${targetName}-${range}`;
    const cached = historyCache.get(cacheKey);

    // Return cached data if still fresh
    if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/targets/${targetName}/history?range=${range}`, {
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      const json: HistoryResponse = await res.json();

      // Downsample data for better performance
      if (json.datapoints && json.datapoints.length > MAX_CHART_POINTS) {
        json.datapoints = downsampleData(json.datapoints, MAX_CHART_POINTS);
      }

      // Cache the result
      historyCache.set(cacheKey, { data: json, timestamp: Date.now() });

      setData(json);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [targetName, range]);

  useEffect(() => {
    if (targetName) fetchHistory();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchHistory, targetName]);

  // Pause polling when tab is not visible
  useEffect(() => {
    if (!targetName) return;

    if (isVisible) {
      intervalRef.current = setInterval(fetchHistory, 10000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isVisible, fetchHistory, targetName]);

  return { data, loading, error, refetch: fetchHistory };
}

export function useRecommendations(targetName: string, enabled = false) {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    if (!targetName || !enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/targets/${targetName}/recommendations?range=1h`);
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [targetName, enabled]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return { data, loading, error, refetch: fetchRecommendations };
}

export function useLeakDetection(targetName: string, enabled = false) {
  const [data, setData] = useState<LeakAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaks = useCallback(async () => {
    if (!targetName || !enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/targets/${targetName}/leaks?range=1h`);
      if (!res.ok) throw new Error('Failed to detect leaks');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [targetName, enabled]);

  useEffect(() => {
    fetchLeaks();
  }, [fetchLeaks]);

  return { data, loading, error, refetch: fetchLeaks };
}

export function exportCSV(targetName: string, range = '24h', instance?: string) {
  let url = `${API_BASE}/targets/${targetName}/export?range=${range}`;
  if (instance) {
    url += `&instance=${encodeURIComponent(instance)}`;
  }
  window.open(url, '_blank');
}

export function openReport(targetName: string, range = '24h') {
  window.open(`${API_BASE}/targets/${targetName}/report?range=${range}`, '_blank');
}

export function exportAllCSV(range = '24h') {
  window.open(`${API_BASE}/export/all?range=${range}`, '_blank');
}

export function openCombinedReport(range = '24h') {
  window.open(`${API_BASE}/report/combined?range=${range}`, '_blank');
}

export function usePeakTime(targetName: string, enabled = false) {
  const [data, setData] = useState<PeakTimeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPeakTime = useCallback(async () => {
    if (!targetName || !enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/targets/${targetName}/peaktime?range=24h`);
      if (!res.ok) throw new Error('Failed to fetch peak time analysis');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [targetName, enabled]);

  useEffect(() => {
    fetchPeakTime();
  }, [fetchPeakTime]);

  return { data, loading, error, refetch: fetchPeakTime };
}

export type AnomalySensitivity = 'low' | 'medium' | 'high';

export function useAnomalies(
  targetName: string,
  enabled = false,
  range = '24h',
  sensitivity: AnomalySensitivity = 'medium'
) {
  const [data, setData] = useState<AnomalyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAnomalies = useCallback(async () => {
    if (!targetName || !enabled) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/targets/${targetName}/anomalies?range=${range}&sensitivity=${sensitivity}`,
        { signal: abortControllerRef.current.signal }
      );
      if (!res.ok) throw new Error('Failed to detect anomalies');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [targetName, enabled, range, sensitivity]);

  useEffect(() => {
    fetchAnomalies();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAnomalies]);

  return { data, loading, error, refetch: fetchAnomalies };
}

interface PeakTimeResult {
  target_name: string;
  data_points: number;
  peak_hours: HourlyStats[];
  quiet_hours: HourlyStats[];
  daily_pattern: HourlyStats[];
  summary: {
    busiest_hour: number;
    busiest_hour_usage: number;
    quietest_hour: number;
    quietest_usage: number;
    avg_daily_peak: number;
    recommendation: string;
  };
}

interface HourlyStats {
  hour: number;
  avg_usage: number;
  max_usage: number;
  min_usage: number;
  sample_size: number;
}

interface AnomalyResult {
  target_name: string;
  data_points: number;
  anomalies: Anomaly[];
  statistics: {
    mean_usage: number;
    std_deviation: number;
    threshold: number;
    anomaly_count: number;
    anomaly_percent: number;
  };
  risk_level: string;
}

interface Anomaly {
  timestamp: string;
  type: string;
  severity: string;
  message: string;
  value: number;
  expected: number;
  deviation: number;
}

interface ComparisonResult {
  target_name: string;
  period: string;
  current_period: PeriodStats;
  previous_period: PeriodStats;
  changes: PeriodChanges;
}

interface PeriodStats {
  from: string;
  to: string;
  data_points: number;
  avg_usage: number;
  max_usage: number;
  min_usage: number;
  avg_active: number;
  max_active: number;
  avg_pending: number;
  max_pending: number;
  timeout_sum: number;
}

interface PeriodChanges {
  avg_usage_change: number;
  max_usage_change: number;
  avg_active_change: number;
  avg_pending_change: number;
  timeout_change: number;
  trend: string;
}

export function useComparison(targetName: string, period: 'day' | 'week' = 'day', enabled = false) {
  const [data, setData] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComparison = useCallback(async () => {
    if (!targetName || !enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/targets/${targetName}/compare?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch comparison');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [targetName, period, enabled]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  return { data, loading, error, refetch: fetchComparison };
}

// Alert hooks
export function useAlerts(status?: string, limit = 100) {
  const [data, setData] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isVisible = usePageVisibility();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      let url = `${API_BASE}/alerts?limit=${limit}`;
      if (status) {
        url += `&status=${status}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch alerts');
      const json: AlertsResponse = await res.json();
      setData(json.alerts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [status, limit]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Pause polling when tab is not visible
  useEffect(() => {
    if (isVisible) {
      intervalRef.current = setInterval(fetchAlerts, 10000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isVisible, fetchAlerts]);

  return { data, loading, error, refetch: fetchAlerts };
}

export function useActiveAlerts() {
  const [data, setData] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isVisible = usePageVisibility();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActiveAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts/active`);
      if (!res.ok) throw new Error('Failed to fetch active alerts');
      const json: AlertsResponse = await res.json();
      setData(json.alerts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveAlerts();
  }, [fetchActiveAlerts]);

  // Poll more frequently for active alerts
  useEffect(() => {
    if (isVisible) {
      intervalRef.current = setInterval(fetchActiveAlerts, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isVisible, fetchActiveAlerts]);

  return { data, loading, error, refetch: fetchActiveAlerts };
}

export function useAlertStats() {
  const [data, setData] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts/stats`);
      if (!res.ok) throw new Error('Failed to fetch alert stats');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { data, loading, error, refetch: fetchStats };
}

export async function resolveAlert(id: number): Promise<Alert | null> {
  try {
    const res = await fetch(`${API_BASE}/alerts/${id}/resolve`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to resolve alert');
    return await res.json();
  } catch {
    return null;
  }
}

export interface TestAlertOptions {
  severity?: 'info' | 'warning' | 'critical';
  channels?: string[];
  message?: string;
}

export async function sendTestAlert(options?: TestAlertOptions): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/alerts/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAlertChannels(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/alerts/channels`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.channels || [];
  } catch {
    return [];
  }
}

// Alert Rule hooks
import type { AlertRule, AlertRuleInput, AlertRulesResponse } from '../types/metrics';

export function useAlertRules() {
  const [data, setData] = useState<AlertRulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/rules`);
      if (!res.ok) throw new Error('Failed to fetch rules');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return { data, loading, error, refetch: fetchRules };
}

export async function createAlertRule(input: AlertRuleInput): Promise<AlertRule | null> {
  try {
    const res = await fetch(`${API_BASE}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create rule');
    }
    return await res.json();
  } catch (err) {
    console.error('Create rule error:', err);
    throw err;
  }
}

export async function updateAlertRule(id: number, input: AlertRuleInput): Promise<AlertRule | null> {
  try {
    const res = await fetch(`${API_BASE}/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update rule');
    }
    return await res.json();
  } catch (err) {
    console.error('Update rule error:', err);
    throw err;
  }
}

export async function deleteAlertRule(id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/rules/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function toggleAlertRule(id: number): Promise<AlertRule | null> {
  try {
    const res = await fetch(`${API_BASE}/rules/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to toggle rule');
    return await res.json();
  } catch {
    return null;
  }
}

// Backup API
export async function createBackup(): Promise<{ message: string; path: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/backup`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to create backup');
    return await res.json();
  } catch {
    return null;
  }
}

export function downloadBackup(): void {
  window.open(`${API_BASE}/backup/download`, '_blank');
}

export async function restoreBackup(file: File): Promise<{ message: string } | { error: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/backup/restore`, {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();

    if (!res.ok) {
      return { error: json.error || 'Failed to restore backup' };
    }

    return { message: json.message || 'Backup restored successfully' };
  } catch {
    return { error: 'Failed to upload backup file' };
  }
}
