package api

import (
	"testing"
	"time"

	"github.com/jiin/pondy/internal/models"
)

func TestDownsampleMetrics_NoDownsample(t *testing.T) {
	// When data length is less than maxPoints, return original data
	data := []models.PoolMetrics{
		{TargetName: "test", Active: 10, Timestamp: time.Now()},
		{TargetName: "test", Active: 20, Timestamp: time.Now()},
	}

	result := downsampleMetrics(data, 500)

	if len(result) != 2 {
		t.Errorf("Expected 2 data points, got %d", len(result))
	}
}

func TestDownsampleMetrics_Downsample(t *testing.T) {
	// Create 1000 data points
	data := make([]models.PoolMetrics, 1000)
	baseTime := time.Now()
	for i := 0; i < 1000; i++ {
		data[i] = models.PoolMetrics{
			TargetName:  "test",
			Active:      i % 10,
			Idle:        10 - (i % 10),
			Pending:     0,
			Max:         10,
			HeapUsed:    int64(100 * 1024 * 1024),
			HeapMax:     int64(200 * 1024 * 1024),
			CpuUsage:    0.5,
			GcCount:     int64(i),
			GcTime:      0.1,
			ThreadsLive: 100,
			Timestamp:   baseTime.Add(time.Duration(i) * time.Second),
		}
	}

	result := downsampleMetrics(data, 100)

	// Should have approximately 100 data points
	if len(result) < 90 || len(result) > 110 {
		t.Errorf("Expected ~100 data points, got %d", len(result))
	}
}

func TestDownsampleMetrics_ZeroLimit(t *testing.T) {
	// When maxPoints is 0, should return original data
	data := []models.PoolMetrics{
		{TargetName: "test", Active: 10},
		{TargetName: "test", Active: 20},
	}

	result := downsampleMetrics(data, 0)

	if len(result) != 2 {
		t.Errorf("Expected original 2 data points with limit 0, got %d", len(result))
	}
}

func TestDownsampleMetrics_Aggregation(t *testing.T) {
	// Test that values are properly averaged/summed
	data := []models.PoolMetrics{
		{TargetName: "test", Active: 10, CpuUsage: 0.2, HeapUsed: 100, Timestamp: time.Now()},
		{TargetName: "test", Active: 20, CpuUsage: 0.4, HeapUsed: 200, Timestamp: time.Now()},
		{TargetName: "test", Active: 30, CpuUsage: 0.6, HeapUsed: 300, Timestamp: time.Now()},
		{TargetName: "test", Active: 40, CpuUsage: 0.8, HeapUsed: 400, Timestamp: time.Now()},
	}

	result := downsampleMetrics(data, 2)

	if len(result) != 2 {
		t.Errorf("Expected 2 buckets, got %d", len(result))
	}

	// First bucket should average first 2 points: (10+20)/2 = 15
	if result[0].Active != 15 {
		t.Errorf("Expected Active=15 in first bucket, got %d", result[0].Active)
	}

	// Second bucket should average last 2 points: (30+40)/2 = 35
	if result[1].Active != 35 {
		t.Errorf("Expected Active=35 in second bucket, got %d", result[1].Active)
	}
}

func TestDownsampleMetrics_EmptyData(t *testing.T) {
	var data []models.PoolMetrics

	result := downsampleMetrics(data, 100)

	if len(result) != 0 {
		t.Errorf("Expected empty result for empty input, got %d", len(result))
	}
}

func TestDownsampleMetrics_PreservesTargetName(t *testing.T) {
	data := []models.PoolMetrics{
		{TargetName: "my-target", InstanceName: "instance-1", Active: 10, Timestamp: time.Now()},
		{TargetName: "my-target", InstanceName: "instance-1", Active: 20, Timestamp: time.Now()},
	}

	result := downsampleMetrics(data, 1)

	if len(result) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(result))
	}

	if result[0].TargetName != "my-target" {
		t.Errorf("Expected TargetName='my-target', got '%s'", result[0].TargetName)
	}

	if result[0].InstanceName != "instance-1" {
		t.Errorf("Expected InstanceName='instance-1', got '%s'", result[0].InstanceName)
	}
}
