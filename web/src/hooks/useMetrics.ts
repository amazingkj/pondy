import { useState, useEffect, useCallback } from 'react';
import type { TargetsResponse, HistoryResponse, AnalysisResult, LeakAnalysisResult } from '../types/metrics';

const API_BASE = '/api';

export function useTargets(refreshInterval = 5000) {
  const [data, setData] = useState<TargetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const interval = setInterval(fetchTargets, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchTargets, refreshInterval]);

  return { data, loading, error, refetch: fetchTargets };
}

export function useHistory(targetName: string, range = '1h') {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!targetName) return;
    try {
      const res = await fetch(`${API_BASE}/targets/${targetName}/history?range=${range}`);
      if (!res.ok) throw new Error('Failed to fetch history');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [targetName, range]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

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

export function exportCSV(targetName: string, range = '24h') {
  window.open(`${API_BASE}/targets/${targetName}/export?range=${range}`, '_blank');
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

export function useAnomalies(targetName: string, enabled = false) {
  const [data, setData] = useState<AnomalyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnomalies = useCallback(async () => {
    if (!targetName || !enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/targets/${targetName}/anomalies?range=24h`);
      if (!res.ok) throw new Error('Failed to detect anomalies');
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
    fetchAnomalies();
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
