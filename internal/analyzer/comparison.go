package analyzer

import (
	"time"

	"github.com/jiin/pondy/internal/models"
)

// PeriodComparisonResult contains comparison between two periods
type PeriodComparisonResult struct {
	TargetName     string        `json:"target_name"`
	Period         string        `json:"period"`
	CurrentPeriod  PeriodStats   `json:"current_period"`
	PreviousPeriod PeriodStats   `json:"previous_period"`
	Changes        PeriodChanges `json:"changes"`
}

// PeriodStats contains statistics for a period
type PeriodStats struct {
	From       time.Time `json:"from"`
	To         time.Time `json:"to"`
	DataPoints int       `json:"data_points"`
	AvgUsage   float64   `json:"avg_usage"`
	MaxUsage   float64   `json:"max_usage"`
	MinUsage   float64   `json:"min_usage"`
	AvgActive  float64   `json:"avg_active"`
	MaxActive  int       `json:"max_active"`
	AvgPending float64   `json:"avg_pending"`
	MaxPending int       `json:"max_pending"`
	TimeoutSum int64     `json:"timeout_sum"`
}

// PeriodChanges contains the changes between periods
type PeriodChanges struct {
	AvgUsageChange   float64 `json:"avg_usage_change"`
	MaxUsageChange   float64 `json:"max_usage_change"`
	AvgActiveChange  float64 `json:"avg_active_change"`
	AvgPendingChange float64 `json:"avg_pending_change"`
	TimeoutChange    float64 `json:"timeout_change"`
	Trend            string  `json:"trend"` // improving, stable, degrading
}

// ComparePeriods compares metrics between current and previous periods
func ComparePeriods(targetName string, currentMetrics, previousMetrics []models.PoolMetrics, period string) *PeriodComparisonResult {
	result := &PeriodComparisonResult{
		TargetName: targetName,
		Period:     period,
	}

	result.CurrentPeriod = calculatePeriodStats(currentMetrics)
	result.PreviousPeriod = calculatePeriodStats(previousMetrics)
	result.Changes = calculateChanges(result.CurrentPeriod, result.PreviousPeriod)

	return result
}

func calculatePeriodStats(metrics []models.PoolMetrics) PeriodStats {
	if len(metrics) == 0 {
		return PeriodStats{}
	}

	stats := PeriodStats{
		From:       metrics[0].Timestamp,
		To:         metrics[len(metrics)-1].Timestamp,
		DataPoints: len(metrics),
	}

	var totalUsage, totalActive, totalPending float64
	var maxUsage, minUsage float64 = 0, 100
	var maxActive, maxPending int

	for _, m := range metrics {
		var usage float64
		if m.Max > 0 {
			usage = float64(m.Active) / float64(m.Max) * 100
		}
		totalUsage += usage
		totalActive += float64(m.Active)
		totalPending += float64(m.Pending)

		if usage > maxUsage {
			maxUsage = usage
		}
		if usage < minUsage {
			minUsage = usage
		}
		if m.Active > maxActive {
			maxActive = m.Active
		}
		if m.Pending > maxPending {
			maxPending = m.Pending
		}

		stats.TimeoutSum += m.Timeout
	}

	n := float64(len(metrics))
	stats.AvgUsage = totalUsage / n
	stats.MaxUsage = maxUsage
	stats.MinUsage = minUsage
	stats.AvgActive = totalActive / n
	stats.MaxActive = maxActive
	stats.AvgPending = totalPending / n
	stats.MaxPending = maxPending

	return stats
}

func calculateChanges(current, previous PeriodStats) PeriodChanges {
	changes := PeriodChanges{}

	if previous.AvgUsage > 0 {
		changes.AvgUsageChange = (current.AvgUsage - previous.AvgUsage) / previous.AvgUsage * 100
	}
	if previous.MaxUsage > 0 {
		changes.MaxUsageChange = (current.MaxUsage - previous.MaxUsage) / previous.MaxUsage * 100
	}
	if previous.AvgActive > 0 {
		changes.AvgActiveChange = (current.AvgActive - previous.AvgActive) / previous.AvgActive * 100
	}
	if previous.AvgPending > 0 {
		changes.AvgPendingChange = (current.AvgPending - previous.AvgPending) / previous.AvgPending * 100
	}
	if previous.TimeoutSum > 0 {
		changes.TimeoutChange = float64(current.TimeoutSum-previous.TimeoutSum) / float64(previous.TimeoutSum) * 100
	}

	// Determine trend based on average usage change
	avgChange := changes.AvgUsageChange
	if avgChange < -10 {
		changes.Trend = "improving"
	} else if avgChange > 10 {
		changes.Trend = "degrading"
	} else {
		changes.Trend = "stable"
	}

	return changes
}
