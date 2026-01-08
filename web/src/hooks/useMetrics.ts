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
