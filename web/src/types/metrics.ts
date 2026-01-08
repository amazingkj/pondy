export interface PoolMetrics {
  id: number;
  target_name: string;
  active: number;
  idle: number;
  pending: number;
  max: number;
  timeout: number;
  acquire_p99: number;
  timestamp: string;
}

export interface TargetStatus {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  current?: PoolMetrics;
}

export interface TargetsResponse {
  targets: TargetStatus[];
}

export interface HistoryResponse {
  target_name: string;
  datapoints: PoolMetrics[];
}

export interface Recommendation {
  type: string;
  current: string;
  recommended: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface PoolStats {
  avg_active: number;
  max_active: number;
  avg_idle: number;
  avg_pending: number;
  max_pending: number;
  avg_usage: number;
  peak_usage: number;
  current_max: number;
  timeout_count: number;
}

export interface AnalysisResult {
  target_name: string;
  analyzed_at: string;
  data_points: number;
  recommendations: Recommendation[];
  stats: PoolStats;
}

export interface LeakAlert {
  type: string;
  severity: string;
  message: string;
  detected_at: string;
  duration: string;
  avg_active: number;
  avg_idle: number;
  suggestions: string[];
}

export interface LeakAnalysisResult {
  target_name: string;
  analyzed_at: string;
  data_points: number;
  has_leak: boolean;
  leak_risk: 'none' | 'low' | 'medium' | 'high' | 'unknown';
  alerts: LeakAlert[];
  health_score: number;
}
