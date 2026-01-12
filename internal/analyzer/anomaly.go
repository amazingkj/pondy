package analyzer

import (
	"math"
	"time"

	"github.com/jiin/pondy/internal/models"
)

// AnomalyResult contains anomaly detection results
type AnomalyResult struct {
	TargetName   string          `json:"target_name"`
	AnalyzedFrom time.Time       `json:"analyzed_from"`
	AnalyzedTo   time.Time       `json:"analyzed_to"`
	DataPoints   int             `json:"data_points"`
	Anomalies    []Anomaly       `json:"anomalies"`
	Statistics   AnomalyStats    `json:"statistics"`
	RiskLevel    string          `json:"risk_level"` // normal, elevated, high
}

// Anomaly represents a detected anomaly
type Anomaly struct {
	Timestamp   time.Time `json:"timestamp"`
	Type        string    `json:"type"`
	Severity    string    `json:"severity"` // warning, critical
	Message     string    `json:"message"`
	Value       float64   `json:"value"`
	Expected    float64   `json:"expected"`
	Deviation   float64   `json:"deviation"`
}

// AnomalyStats contains statistical information
type AnomalyStats struct {
	MeanUsage      float64 `json:"mean_usage"`
	StdDeviation   float64 `json:"std_deviation"`
	Threshold      float64 `json:"threshold"`
	AnomalyCount   int     `json:"anomaly_count"`
	AnomalyPercent float64 `json:"anomaly_percent"`
}

// DetectAnomalies analyzes metrics for unusual patterns
// loc is the timezone for timestamps (if nil, uses UTC)
func DetectAnomalies(targetName string, metrics []models.PoolMetrics, loc *time.Location) *AnomalyResult {
	if loc == nil {
		loc = time.UTC
	}

	if len(metrics) < 10 {
		return &AnomalyResult{
			TargetName: targetName,
			DataPoints: len(metrics),
			RiskLevel:  "unknown",
			Anomalies:  []Anomaly{},
			Statistics: AnomalyStats{},
		}
	}

	// Calculate usage percentages
	usages := make([]float64, len(metrics))
	var minTime, maxTime time.Time
	for i, m := range metrics {
		if m.Max > 0 {
			usages[i] = float64(m.Active) / float64(m.Max) * 100
		}
		if i == 0 || m.Timestamp.Before(minTime) {
			minTime = m.Timestamp
		}
		if i == 0 || m.Timestamp.After(maxTime) {
			maxTime = m.Timestamp
		}
	}

	// Calculate mean and standard deviation
	mean := calculateMean(usages)
	stdDev := calculateStdDev(usages, mean)

	// Use 2 standard deviations as threshold for anomaly detection
	threshold := 2.0

	// Detect anomalies
	var anomalies []Anomaly

	for i, m := range metrics {
		usage := usages[i]
		deviation := (usage - mean) / stdDev

		// Check for high usage anomaly
		if math.Abs(deviation) > threshold {
			severity := "warning"
			if math.Abs(deviation) > 3 {
				severity = "critical"
			}

			anomalyType := "high_usage"
			message := "Usage significantly higher than normal"
			if deviation < 0 {
				anomalyType = "low_usage"
				message = "Usage significantly lower than normal"
			}

			anomalies = append(anomalies, Anomaly{
				Timestamp: m.Timestamp.In(loc),
				Type:      anomalyType,
				Severity:  severity,
				Message:   message,
				Value:     usage,
				Expected:  mean,
				Deviation: deviation,
			})
		}

		// Check for sudden spike (comparing with previous value)
		if i > 0 && usages[i-1] > 0 {
			change := (usage - usages[i-1]) / usages[i-1] * 100
			if change > 50 {
				anomalies = append(anomalies, Anomaly{
					Timestamp: m.Timestamp.In(loc),
					Type:      "sudden_spike",
					Severity:  "warning",
					Message:   "Sudden increase in usage detected",
					Value:     usage,
					Expected:  usages[i-1],
					Deviation: change,
				})
			}
			if change < -50 {
				anomalies = append(anomalies, Anomaly{
					Timestamp: m.Timestamp.In(loc),
					Type:      "sudden_drop",
					Severity:  "warning",
					Message:   "Sudden decrease in usage detected",
					Value:     usage,
					Expected:  usages[i-1],
					Deviation: change,
				})
			}
		}

		// Check for sustained high pending
		if m.Pending > 0 && m.Max > 0 {
			pendingRatio := float64(m.Pending) / float64(m.Max) * 100
			if pendingRatio > 10 {
				anomalies = append(anomalies, Anomaly{
					Timestamp: m.Timestamp.In(loc),
					Type:      "high_pending",
					Severity:  "critical",
					Message:   "High number of pending connections",
					Value:     pendingRatio,
					Expected:  0,
					Deviation: pendingRatio,
				})
			}
		}
	}

	// Calculate risk level
	anomalyPercent := float64(len(anomalies)) / float64(len(metrics)) * 100
	riskLevel := "normal"
	if anomalyPercent > 10 {
		riskLevel = "high"
	} else if anomalyPercent > 5 {
		riskLevel = "elevated"
	}

	return &AnomalyResult{
		TargetName:   targetName,
		AnalyzedFrom: minTime,
		AnalyzedTo:   maxTime,
		DataPoints:   len(metrics),
		Anomalies:    anomalies,
		RiskLevel:    riskLevel,
		Statistics: AnomalyStats{
			MeanUsage:      mean,
			StdDeviation:   stdDev,
			Threshold:      threshold,
			AnomalyCount:   len(anomalies),
			AnomalyPercent: anomalyPercent,
		},
	}
}

func calculateMean(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	var sum float64
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func calculateStdDev(values []float64, mean float64) float64 {
	if len(values) < 2 {
		return 0
	}
	var sumSquares float64
	for _, v := range values {
		diff := v - mean
		sumSquares += diff * diff
	}
	return math.Sqrt(sumSquares / float64(len(values)-1))
}
