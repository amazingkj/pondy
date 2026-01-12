package models

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPoolMetrics_JSON(t *testing.T) {
	now := time.Now()
	metrics := PoolMetrics{
		ID:           1,
		TargetName:   "test-service",
		InstanceName: "default",
		Status:       StatusHealthy,
		Active:       5,
		Idle:         10,
		Pending:      0,
		Max:          20,
		Timeout:      0,
		AcquireP99:   1.5,
		HeapUsed:     100 * 1024 * 1024,
		HeapMax:      512 * 1024 * 1024,
		NonHeapUsed:  50 * 1024 * 1024,
		ThreadsLive:  50,
		CpuUsage:     0.25,
		GcCount:      100,
		GcTime:       1.5,
		YoungGcCount: 80,
		OldGcCount:   20,
		Timestamp:    now,
	}

	// Test JSON marshaling
	data, err := json.Marshal(metrics)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	// Test JSON unmarshaling
	var unmarshaled PoolMetrics
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if unmarshaled.TargetName != metrics.TargetName {
		t.Errorf("TargetName mismatch: got %s, want %s", unmarshaled.TargetName, metrics.TargetName)
	}

	if unmarshaled.Active != metrics.Active {
		t.Errorf("Active mismatch: got %d, want %d", unmarshaled.Active, metrics.Active)
	}

	if unmarshaled.GcCount != metrics.GcCount {
		t.Errorf("GcCount mismatch: got %d, want %d", unmarshaled.GcCount, metrics.GcCount)
	}
}

func TestTargetStatus_JSON(t *testing.T) {
	status := TargetStatus{
		Name:   "test-service",
		Group:  "prod",
		Status: StatusHealthy,
		Current: &PoolMetrics{
			Active: 5,
			Idle:   10,
			Max:    20,
		},
		Instances: []InstanceStatus{
			{
				InstanceName: "inst-1",
				Status:       StatusHealthy,
			},
			{
				InstanceName: "inst-2",
				Status:       StatusHealthy,
			},
		},
	}

	data, err := json.Marshal(status)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	var unmarshaled TargetStatus
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if unmarshaled.Name != status.Name {
		t.Errorf("Name mismatch: got %s, want %s", unmarshaled.Name, status.Name)
	}

	if unmarshaled.Group != status.Group {
		t.Errorf("Group mismatch: got %s, want %s", unmarshaled.Group, status.Group)
	}

	if len(unmarshaled.Instances) != len(status.Instances) {
		t.Errorf("Instances count mismatch: got %d, want %d", len(unmarshaled.Instances), len(status.Instances))
	}
}

func TestStatusConstants(t *testing.T) {
	if StatusHealthy != "healthy" {
		t.Errorf("StatusHealthy = %s, want 'healthy'", StatusHealthy)
	}

	if StatusNoPool != "no_pool" {
		t.Errorf("StatusNoPool = %s, want 'no_pool'", StatusNoPool)
	}

	if StatusError != "error" {
		t.Errorf("StatusError = %s, want 'error'", StatusError)
	}
}

func TestHistoryResponse_JSON(t *testing.T) {
	response := HistoryResponse{
		TargetName: "test-service",
		Datapoints: []PoolMetrics{
			{Active: 1, Idle: 9, Max: 10},
			{Active: 2, Idle: 8, Max: 10},
			{Active: 3, Idle: 7, Max: 10},
		},
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	var unmarshaled HistoryResponse
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}

	if len(unmarshaled.Datapoints) != 3 {
		t.Errorf("expected 3 datapoints, got %d", len(unmarshaled.Datapoints))
	}
}
