package analyzer

import (
	"fmt"
	"math"
	"time"

	"github.com/jiin/pondy/internal/models"
)

type Recommendation struct {
	Type        string `json:"type"`
	Current     string `json:"current"`
	Recommended string `json:"recommended"`
	Reason      string `json:"reason"`
	Severity    string `json:"severity"` // info, warning, critical
}

type AnalysisResult struct {
	TargetName      string           `json:"target_name"`
	AnalyzedAt      time.Time        `json:"analyzed_at"`
	DataPoints      int              `json:"data_points"`
	Recommendations []Recommendation `json:"recommendations"`
	Stats           PoolStats        `json:"stats"`
}

type PoolStats struct {
	AvgActive    float64 `json:"avg_active"`
	MaxActive    int     `json:"max_active"`
	AvgIdle      float64 `json:"avg_idle"`
	AvgPending   float64 `json:"avg_pending"`
	MaxPending   int     `json:"max_pending"`
	AvgUsage     float64 `json:"avg_usage"`
	PeakUsage    float64 `json:"peak_usage"`
	CurrentMax   int     `json:"current_max"`
	TimeoutCount int64   `json:"timeout_count"`
}

func Analyze(metrics []models.PoolMetrics) *AnalysisResult {
	if len(metrics) == 0 {
		return nil
	}

	result := &AnalysisResult{
		TargetName:      metrics[0].TargetName,
		AnalyzedAt:      time.Now(),
		DataPoints:      len(metrics),
		Recommendations: []Recommendation{},
	}

	// Calculate statistics
	stats := calculateStats(metrics)
	result.Stats = stats

	// Generate recommendations
	result.Recommendations = generateRecommendations(stats)

	return result
}

func calculateStats(metrics []models.PoolMetrics) PoolStats {
	var totalActive, totalIdle, totalPending float64
	var maxActive, maxPending int
	var peakUsage float64
	var lastTimeout int64

	currentMax := metrics[0].Max
	if len(metrics) > 0 {
		lastTimeout = metrics[len(metrics)-1].Timeout
	}

	for _, m := range metrics {
		totalActive += float64(m.Active)
		totalIdle += float64(m.Idle)
		totalPending += float64(m.Pending)

		if m.Active > maxActive {
			maxActive = m.Active
		}
		if m.Pending > maxPending {
			maxPending = m.Pending
		}

		if m.Max > 0 {
			usage := float64(m.Active) / float64(m.Max) * 100
			if usage > peakUsage {
				peakUsage = usage
			}
		}
	}

	n := float64(len(metrics))
	avgActive := totalActive / n
	avgUsage := 0.0
	if currentMax > 0 {
		avgUsage = avgActive / float64(currentMax) * 100
	}

	return PoolStats{
		AvgActive:    math.Round(avgActive*10) / 10,
		MaxActive:    maxActive,
		AvgIdle:      math.Round(totalIdle / n * 10) / 10,
		AvgPending:   math.Round(totalPending / n * 10) / 10,
		MaxPending:   maxPending,
		AvgUsage:     math.Round(avgUsage*10) / 10,
		PeakUsage:    math.Round(peakUsage*10) / 10,
		CurrentMax:   currentMax,
		TimeoutCount: lastTimeout,
	}
}

func generateRecommendations(stats PoolStats) []Recommendation {
	var recs []Recommendation

	// Pool size recommendations
	if stats.PeakUsage > 90 {
		newSize := int(float64(stats.CurrentMax) * 1.5)
		recs = append(recs, Recommendation{
			Type:        "maximumPoolSize",
			Current:     fmt.Sprintf("%d", stats.CurrentMax),
			Recommended: fmt.Sprintf("%d", newSize),
			Reason:      fmt.Sprintf("Peak usage reached %.1f%%. Increase pool size to prevent connection starvation.", stats.PeakUsage),
			Severity:    "critical",
		})
	} else if stats.PeakUsage > 70 {
		newSize := int(float64(stats.CurrentMax) * 1.25)
		recs = append(recs, Recommendation{
			Type:        "maximumPoolSize",
			Current:     fmt.Sprintf("%d", stats.CurrentMax),
			Recommended: fmt.Sprintf("%d", newSize),
			Reason:      fmt.Sprintf("Peak usage reached %.1f%%. Consider increasing pool size for safety margin.", stats.PeakUsage),
			Severity:    "warning",
		})
	} else if stats.PeakUsage < 30 && stats.CurrentMax > 10 {
		newSize := int(math.Max(10, float64(stats.MaxActive)*2))
		if newSize < stats.CurrentMax {
			recs = append(recs, Recommendation{
				Type:        "maximumPoolSize",
				Current:     fmt.Sprintf("%d", stats.CurrentMax),
				Recommended: fmt.Sprintf("%d", newSize),
				Reason:      fmt.Sprintf("Pool is oversized. Peak usage only %.1f%%. Reduce to save resources.", stats.PeakUsage),
				Severity:    "info",
			})
		}
	}

	// Pending connections
	if stats.MaxPending > 0 {
		recs = append(recs, Recommendation{
			Type:        "maximumPoolSize",
			Current:     fmt.Sprintf("%d", stats.CurrentMax),
			Recommended: fmt.Sprintf("%d", stats.CurrentMax+stats.MaxPending*2),
			Reason:      fmt.Sprintf("Detected %d pending requests. Threads are waiting for connections.", stats.MaxPending),
			Severity:    "warning",
		})
	}

	// Timeout recommendations
	if stats.TimeoutCount > 0 {
		recs = append(recs, Recommendation{
			Type:        "connectionTimeout",
			Current:     "30000ms (default)",
			Recommended: "45000ms",
			Reason:      fmt.Sprintf("Detected %d timeout(s). Consider increasing connectionTimeout or pool size.", stats.TimeoutCount),
			Severity:    "critical",
		})
	}

	// Idle connections
	if stats.AvgIdle > float64(stats.CurrentMax)*0.8 {
		minIdle := int(math.Max(2, stats.AvgActive))
		recs = append(recs, Recommendation{
			Type:        "minimumIdle",
			Current:     fmt.Sprintf("%d", stats.CurrentMax),
			Recommended: fmt.Sprintf("%d", minIdle),
			Reason:      fmt.Sprintf("Too many idle connections (avg %.1f). Set minimumIdle to reduce resource usage.", stats.AvgIdle),
			Severity:    "info",
		})
	}

	if len(recs) == 0 {
		recs = append(recs, Recommendation{
			Type:        "status",
			Current:     "OK",
			Recommended: "No changes needed",
			Reason:      "Pool configuration looks healthy based on current usage patterns.",
			Severity:    "info",
		})
	}

	return recs
}
