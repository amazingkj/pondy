package analyzer

import (
	"time"

	"github.com/jiin/pondy/internal/models"
)

type LeakAlert struct {
	Type        string    `json:"type"`
	Severity    string    `json:"severity"`
	Message     string    `json:"message"`
	DetectedAt  time.Time `json:"detected_at"`
	Duration    string    `json:"duration"`
	AvgActive   float64   `json:"avg_active"`
	AvgIdle     float64   `json:"avg_idle"`
	Suggestions []string  `json:"suggestions"`
}

type LeakAnalysisResult struct {
	TargetName   string      `json:"target_name"`
	AnalyzedAt   time.Time   `json:"analyzed_at"`
	DataPoints   int         `json:"data_points"`
	HasLeak      bool        `json:"has_leak"`
	LeakRisk     string      `json:"leak_risk"` // none, low, medium, high
	Alerts       []LeakAlert `json:"alerts"`
	HealthScore  int         `json:"health_score"` // 0-100
}

// DetectLeaks analyzes metrics for connection leak patterns
// loc is the timezone for timestamps (if nil, uses UTC)
func DetectLeaks(metrics []models.PoolMetrics, loc *time.Location) *LeakAnalysisResult {
	if loc == nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)

	if len(metrics) < 6 { // Need at least 1 minute of data (10s intervals)
		return &LeakAnalysisResult{
			TargetName:  metrics[0].TargetName,
			AnalyzedAt:  now,
			DataPoints:  len(metrics),
			HasLeak:     false,
			LeakRisk:    "unknown",
			Alerts:      []LeakAlert{},
			HealthScore: -1,
		}
	}

	result := &LeakAnalysisResult{
		TargetName:  metrics[0].TargetName,
		AnalyzedAt:  now,
		DataPoints:  len(metrics),
		HasLeak:     false,
		LeakRisk:    "none",
		Alerts:      []LeakAlert{},
		HealthScore: 100,
	}

	// Analyze for different leak patterns
	analyzeHighActivePattern(metrics, result, now)
	analyzeNoIdlePattern(metrics, result, now)
	analyzePendingPattern(metrics, result, now)
	analyzeGrowthPattern(metrics, result, now)

	// Calculate final risk level
	calculateRisk(result)

	return result
}

// Detect sustained high active connections
func analyzeHighActivePattern(metrics []models.PoolMetrics, result *LeakAnalysisResult, now time.Time) {
	highCount := 0
	var totalActive float64
	threshold := 0.8 // 80% of max

	for _, m := range metrics {
		if m.Max > 0 && float64(m.Active)/float64(m.Max) >= threshold {
			highCount++
		}
		totalActive += float64(m.Active)
	}

	avgActive := totalActive / float64(len(metrics))
	highRatio := float64(highCount) / float64(len(metrics))

	if highRatio > 0.7 { // 70% of time at high usage
		result.Alerts = append(result.Alerts, LeakAlert{
			Type:       "sustained_high_usage",
			Severity:   "warning",
			Message:    "Connection pool consistently at high utilization",
			DetectedAt: now,
			Duration:   calculateDuration(metrics),
			AvgActive:  avgActive,
			Suggestions: []string{
				"Check for long-running queries",
				"Review connection release in code (try-with-resources, defer)",
				"Consider increasing pool size if load is legitimate",
			},
		})
		result.HealthScore -= 20
	}
}

// Detect no idle connections available
func analyzeNoIdlePattern(metrics []models.PoolMetrics, result *LeakAnalysisResult, now time.Time) {
	noIdleCount := 0
	var totalIdle float64

	for _, m := range metrics {
		if m.Idle == 0 {
			noIdleCount++
		}
		totalIdle += float64(m.Idle)
	}

	avgIdle := totalIdle / float64(len(metrics))
	noIdleRatio := float64(noIdleCount) / float64(len(metrics))

	if noIdleRatio > 0.5 { // 50% of time with no idle
		result.Alerts = append(result.Alerts, LeakAlert{
			Type:       "no_idle_connections",
			Severity:   "critical",
			Message:    "Pool exhausted - no idle connections available",
			DetectedAt: now,
			Duration:   calculateDuration(metrics),
			AvgIdle:    avgIdle,
			Suggestions: []string{
				"Possible connection leak detected",
				"Check for connections not being closed",
				"Review transaction management",
				"Enable leak detection in HikariCP: leakDetectionThreshold=60000",
			},
		})
		result.HasLeak = true
		result.HealthScore -= 40
	}
}

// Detect persistent pending requests
func analyzePendingPattern(metrics []models.PoolMetrics, result *LeakAnalysisResult, now time.Time) {
	pendingCount := 0
	var totalPending float64
	maxPending := 0

	for _, m := range metrics {
		if m.Pending > 0 {
			pendingCount++
			if m.Pending > maxPending {
				maxPending = m.Pending
			}
		}
		totalPending += float64(m.Pending)
	}

	pendingRatio := float64(pendingCount) / float64(len(metrics))

	if pendingRatio > 0.3 { // 30% of time with pending
		result.Alerts = append(result.Alerts, LeakAlert{
			Type:       "persistent_pending",
			Severity:   "warning",
			Message:    "Threads frequently waiting for connections",
			DetectedAt: now,
			Duration:   calculateDuration(metrics),
			AvgActive:  totalPending / float64(len(metrics)),
			Suggestions: []string{
				"Pool size may be too small for current load",
				"Check for slow queries blocking connections",
				"Consider connection timeout settings",
			},
		})
		result.HealthScore -= 15
	}
}

// Detect gradual growth pattern (leak indicator)
func analyzeGrowthPattern(metrics []models.PoolMetrics, result *LeakAnalysisResult, now time.Time) {
	if len(metrics) < 12 { // Need more data for trend
		return
	}

	// Compare first quarter vs last quarter
	quarter := len(metrics) / 4
	var firstQuarterAvg, lastQuarterAvg float64

	for i := 0; i < quarter; i++ {
		firstQuarterAvg += float64(metrics[i].Active)
	}
	firstQuarterAvg /= float64(quarter)

	for i := len(metrics) - quarter; i < len(metrics); i++ {
		lastQuarterAvg += float64(metrics[i].Active)
	}
	lastQuarterAvg /= float64(quarter)

	// Check if there's significant growth
	if firstQuarterAvg > 0 {
		growthRate := (lastQuarterAvg - firstQuarterAvg) / firstQuarterAvg

		if growthRate > 0.5 { // 50% growth
			result.Alerts = append(result.Alerts, LeakAlert{
				Type:       "growing_active_trend",
				Severity:   "critical",
				Message:    "Active connections showing upward trend - possible leak",
				DetectedAt: now,
				Duration:   calculateDuration(metrics),
				AvgActive:  lastQuarterAvg,
				Suggestions: []string{
					"Strong indicator of connection leak",
					"Review recent code changes",
					"Check for missing connection.close() calls",
					"Enable HikariCP leak detection immediately",
				},
			})
			result.HasLeak = true
			result.HealthScore -= 30
		}
	}
}

func calculateRisk(result *LeakAnalysisResult) {
	if result.HealthScore < 0 {
		result.HealthScore = 0
	}

	switch {
	case result.HealthScore >= 80:
		result.LeakRisk = "none"
	case result.HealthScore >= 60:
		result.LeakRisk = "low"
	case result.HealthScore >= 40:
		result.LeakRisk = "medium"
	default:
		result.LeakRisk = "high"
	}
}

func calculateDuration(metrics []models.PoolMetrics) string {
	if len(metrics) < 2 {
		return "unknown"
	}

	duration := metrics[len(metrics)-1].Timestamp.Sub(metrics[0].Timestamp)

	if duration < time.Minute {
		return duration.Round(time.Second).String()
	}
	if duration < time.Hour {
		return duration.Round(time.Minute).String()
	}
	return duration.Round(time.Hour).String()
}
