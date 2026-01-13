package analyzer

import (
	"testing"
	"time"

	"github.com/jiin/pondy/internal/models"
)

func TestAnalyze_EmptyMetrics(t *testing.T) {
	result := Analyze(nil, nil)
	if result != nil {
		t.Error("Analyze(nil) should return nil")
	}

	result = Analyze([]models.PoolMetrics{}, nil)
	if result != nil {
		t.Error("Analyze(empty) should return nil")
	}
}

func TestAnalyze_Basic(t *testing.T) {
	metrics := []models.PoolMetrics{
		{
			TargetName: "test-service",
			Active:     5,
			Idle:       5,
			Pending:    0,
			Max:        10,
			Timeout:    0,
		},
	}

	result := Analyze(metrics, nil)

	if result == nil {
		t.Fatal("Analyze() returned nil")
	}

	if result.TargetName != "test-service" {
		t.Errorf("TargetName = %s, want test-service", result.TargetName)
	}

	if result.DataPoints != 1 {
		t.Errorf("DataPoints = %d, want 1", result.DataPoints)
	}

	if result.Stats.CurrentMax != 10 {
		t.Errorf("Stats.CurrentMax = %d, want 10", result.Stats.CurrentMax)
	}
}

func TestAnalyze_WithTimezone(t *testing.T) {
	metrics := []models.PoolMetrics{
		{TargetName: "test", Active: 5, Idle: 5, Max: 10},
	}

	loc, _ := time.LoadLocation("Asia/Seoul")
	result := Analyze(metrics, loc)

	if result == nil {
		t.Fatal("Analyze() returned nil")
	}

	if result.AnalyzedAt.Location().String() != "Asia/Seoul" {
		t.Errorf("AnalyzedAt location = %s, want Asia/Seoul", result.AnalyzedAt.Location())
	}
}

func TestCalculateStats(t *testing.T) {
	metrics := []models.PoolMetrics{
		{Active: 4, Idle: 6, Pending: 0, Max: 10, Timeout: 0},
		{Active: 6, Idle: 4, Pending: 1, Max: 10, Timeout: 0},
		{Active: 8, Idle: 2, Pending: 2, Max: 10, Timeout: 1},
	}

	stats := calculateStats(metrics)

	// AvgActive = (4 + 6 + 8) / 3 = 6
	if stats.AvgActive != 6 {
		t.Errorf("AvgActive = %f, want 6", stats.AvgActive)
	}

	// MaxActive = 8
	if stats.MaxActive != 8 {
		t.Errorf("MaxActive = %d, want 8", stats.MaxActive)
	}

	// MaxPending = 2
	if stats.MaxPending != 2 {
		t.Errorf("MaxPending = %d, want 2", stats.MaxPending)
	}

	// PeakUsage = 80% (8/10)
	if stats.PeakUsage != 80 {
		t.Errorf("PeakUsage = %f, want 80", stats.PeakUsage)
	}

	// TimeoutCount = 1 (last value)
	if stats.TimeoutCount != 1 {
		t.Errorf("TimeoutCount = %d, want 1", stats.TimeoutCount)
	}
}

func TestGenerateRecommendations_Critical(t *testing.T) {
	// Peak usage > 90%
	stats := PoolStats{
		PeakUsage:  95,
		CurrentMax: 10,
	}

	recs := generateRecommendations(stats)

	if len(recs) == 0 {
		t.Fatal("Expected at least one recommendation")
	}

	found := false
	for _, rec := range recs {
		if rec.Type == "maximumPoolSize" && rec.Severity == "critical" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected critical maximumPoolSize recommendation")
	}
}

func TestGenerateRecommendations_Warning(t *testing.T) {
	// Peak usage > 70% but < 90%
	stats := PoolStats{
		PeakUsage:  75,
		CurrentMax: 10,
	}

	recs := generateRecommendations(stats)

	found := false
	for _, rec := range recs {
		if rec.Type == "maximumPoolSize" && rec.Severity == "warning" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected warning maximumPoolSize recommendation")
	}
}

func TestGenerateRecommendations_Oversized(t *testing.T) {
	// Peak usage < 30% with large pool
	stats := PoolStats{
		PeakUsage:  20,
		CurrentMax: 100,
		MaxActive:  10,
	}

	recs := generateRecommendations(stats)

	found := false
	for _, rec := range recs {
		if rec.Type == "maximumPoolSize" && rec.Severity == "info" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected info recommendation for oversized pool")
	}
}

func TestGenerateRecommendations_PendingConnections(t *testing.T) {
	stats := PoolStats{
		MaxPending: 5,
		CurrentMax: 10,
	}

	recs := generateRecommendations(stats)

	found := false
	for _, rec := range recs {
		if rec.Type == "maximumPoolSize" && rec.Severity == "warning" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected warning for pending connections")
	}
}

func TestGenerateRecommendations_Timeout(t *testing.T) {
	stats := PoolStats{
		TimeoutCount: 5,
		CurrentMax:   10,
	}

	recs := generateRecommendations(stats)

	found := false
	for _, rec := range recs {
		if rec.Type == "connectionTimeout" && rec.Severity == "critical" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected critical connectionTimeout recommendation")
	}
}

func TestGenerateRecommendations_HighIdle(t *testing.T) {
	stats := PoolStats{
		AvgIdle:    9,
		CurrentMax: 10,
		AvgActive:  1,
	}

	recs := generateRecommendations(stats)

	found := false
	for _, rec := range recs {
		if rec.Type == "minimumIdle" && rec.Severity == "info" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected info minimumIdle recommendation")
	}
}

func TestGenerateRecommendations_Healthy(t *testing.T) {
	// Healthy pool - no issues
	stats := PoolStats{
		PeakUsage:    50,
		CurrentMax:   10,
		MaxPending:   0,
		TimeoutCount: 0,
		AvgIdle:      2,
	}

	recs := generateRecommendations(stats)

	if len(recs) != 1 {
		t.Fatalf("Expected 1 recommendation for healthy pool, got %d", len(recs))
	}

	if recs[0].Type != "status" {
		t.Errorf("Expected status recommendation, got %s", recs[0].Type)
	}

	if recs[0].Current != "OK" {
		t.Errorf("Expected Current='OK', got %s", recs[0].Current)
	}
}
