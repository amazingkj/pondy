export interface PoolMetrics {
  id: number;
  target_name: string;
  instance_name: string;
  status: string;
  active: number;
  idle: number;
  pending: number;
  max: number;
  timeout: number;
  acquire_p99: number;
  // JVM metrics
  heap_used: number;
  heap_max: number;
  non_heap_used: number;
  threads_live: number;
  cpu_usage: number;
  // GC metrics
  gc_count: number;
  gc_time: number;
  young_gc_count: number;
  old_gc_count: number;
  timestamp: string;
}

export interface InstanceStatus {
  instance_name: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  current?: PoolMetrics;
}

export interface TargetStatus {
  name: string;
  group?: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  current?: PoolMetrics;
  instances?: InstanceStatus[];
}

export interface TargetsResponse {
  targets: TargetStatus[];
  groups?: string[];
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

// Alert types
export interface Alert {
  id: number;
  target_name: string;
  instance_name: string;
  rule_name: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  status: 'fired' | 'resolved';
  fired_at: string;
  resolved_at?: string;
  notified_at?: string;
  channels?: string;
}

export interface AlertsResponse {
  alerts: Alert[];
}

export interface AlertStats {
  total_alerts: number;
  active_alerts: number;
  resolved_alerts: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
}

// Alert Rule types
export interface AlertRule {
  id: number;
  name: string;
  condition: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleInput {
  name: string;
  condition: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  enabled?: boolean;
}

export interface AlertRulesResponse {
  rules: AlertRule[];
  config_rules: {
    name: string;
    condition: string;
    severity: string;
    message: string;
    enabled?: boolean;
  }[];
}
