package analyzer

import (
	"sort"
	"time"

	"github.com/jiin/pondy/internal/models"
)

// PeakTimeResult contains peak time analysis results
type PeakTimeResult struct {
	TargetName   string          `json:"target_name"`
	AnalyzedFrom time.Time       `json:"analyzed_from"`
	AnalyzedTo   time.Time       `json:"analyzed_to"`
	DataPoints   int             `json:"data_points"`
	PeakHours    []HourlyStats   `json:"peak_hours"`
	QuietHours   []HourlyStats   `json:"quiet_hours"`
	DailyPattern []HourlyStats   `json:"daily_pattern"`
	Summary      PeakTimeSummary `json:"summary"`
}

// HourlyStats contains statistics for a specific hour
type HourlyStats struct {
	Hour       int     `json:"hour"`
	AvgUsage   float64 `json:"avg_usage"`
	MaxUsage   float64 `json:"max_usage"`
	MinUsage   float64 `json:"min_usage"`
	SampleSize int     `json:"sample_size"`
}

// PeakTimeSummary provides a summary of peak time analysis
type PeakTimeSummary struct {
	BusiestHour      int     `json:"busiest_hour"`
	BusiestHourUsage float64 `json:"busiest_hour_usage"`
	QuietestHour     int     `json:"quietest_hour"`
	QuietestUsage    float64 `json:"quietest_hour_usage"`
	AvgDailyPeak     float64 `json:"avg_daily_peak"`
	Recommendation   string  `json:"recommendation"`
}

// AnalyzePeakTime analyzes metrics to find peak usage times
func AnalyzePeakTime(targetName string, metrics []models.PoolMetrics) *PeakTimeResult {
	if len(metrics) == 0 {
		return &PeakTimeResult{
			TargetName: targetName,
			DataPoints: 0,
		}
	}

	// Initialize hourly buckets
	hourlyData := make(map[int]*hourlyBucket)
	for i := 0; i < 24; i++ {
		hourlyData[i] = &hourlyBucket{
			hour:   i,
			usages: make([]float64, 0),
		}
	}

	// Collect data by hour
	var minTime, maxTime time.Time
	for i, m := range metrics {
		hour := m.Timestamp.Hour()
		usage := float64(0)
		if m.Max > 0 {
			usage = float64(m.Active) / float64(m.Max) * 100
		}
		hourlyData[hour].usages = append(hourlyData[hour].usages, usage)

		if i == 0 || m.Timestamp.Before(minTime) {
			minTime = m.Timestamp
		}
		if i == 0 || m.Timestamp.After(maxTime) {
			maxTime = m.Timestamp
		}
	}

	// Calculate stats for each hour
	dailyPattern := make([]HourlyStats, 24)
	for hour := 0; hour < 24; hour++ {
		bucket := hourlyData[hour]
		stats := HourlyStats{
			Hour:       hour,
			SampleSize: len(bucket.usages),
		}

		if len(bucket.usages) > 0 {
			var sum, max, min float64
			min = 100
			for _, u := range bucket.usages {
				sum += u
				if u > max {
					max = u
				}
				if u < min {
					min = u
				}
			}
			stats.AvgUsage = sum / float64(len(bucket.usages))
			stats.MaxUsage = max
			stats.MinUsage = min
		}

		dailyPattern[hour] = stats
	}

	// Sort to find peak and quiet hours
	sortedByUsage := make([]HourlyStats, 24)
	copy(sortedByUsage, dailyPattern)
	sort.Slice(sortedByUsage, func(i, j int) bool {
		return sortedByUsage[i].AvgUsage > sortedByUsage[j].AvgUsage
	})

	// Get top 3 peak hours and bottom 3 quiet hours
	peakHours := sortedByUsage[:3]
	quietHours := sortedByUsage[21:]

	// Reverse quiet hours to show lowest first
	for i, j := 0, len(quietHours)-1; i < j; i, j = i+1, j-1 {
		quietHours[i], quietHours[j] = quietHours[j], quietHours[i]
	}

	// Generate summary
	summary := PeakTimeSummary{
		BusiestHour:      peakHours[0].Hour,
		BusiestHourUsage: peakHours[0].AvgUsage,
		QuietestHour:     quietHours[0].Hour,
		QuietestUsage:    quietHours[0].AvgUsage,
	}

	// Calculate average daily peak
	var peakSum float64
	for _, h := range peakHours {
		peakSum += h.AvgUsage
	}
	summary.AvgDailyPeak = peakSum / float64(len(peakHours))

	// Generate recommendation
	summary.Recommendation = generatePeakTimeRecommendation(summary, peakHours)

	return &PeakTimeResult{
		TargetName:   targetName,
		AnalyzedFrom: minTime,
		AnalyzedTo:   maxTime,
		DataPoints:   len(metrics),
		PeakHours:    peakHours,
		QuietHours:   quietHours,
		DailyPattern: dailyPattern,
		Summary:      summary,
	}
}

type hourlyBucket struct {
	hour   int
	usages []float64
}

func generatePeakTimeRecommendation(summary PeakTimeSummary, peakHours []HourlyStats) string {
	if summary.BusiestHourUsage > 80 {
		return "Critical: Peak usage exceeds 80%. Consider increasing pool size or scheduling heavy tasks during off-peak hours."
	}
	if summary.BusiestHourUsage > 60 {
		return "Warning: Peak usage is high. Monitor closely and consider scaling during peak hours."
	}
	if summary.AvgDailyPeak < 30 {
		return "Pool is underutilized during peak hours. Consider reducing pool size to save resources."
	}
	return "Pool usage is within normal range. No immediate action required."
}
