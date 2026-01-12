package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/amazingkj/pondy/internal/models"
)

func setupTestDB(t *testing.T) (*SQLiteStorage, func()) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	storage, err := NewSQLiteStorage(dbPath)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}

	cleanup := func() {
		storage.Close()
		os.Remove(dbPath)
	}

	return storage, cleanup
}

func TestNewSQLiteStorage(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	if storage == nil {
		t.Fatal("storage should not be nil")
	}
}

func TestSQLiteStorage_Save(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	metrics := &models.PoolMetrics{
		TargetName:   "test-target",
		InstanceName: "default",
		Status:       models.StatusHealthy,
		Active:       5,
		Idle:         10,
		Pending:      0,
		Max:          20,
		Timeout:      0,
		AcquireP99:   1.5,
		HeapUsed:     1024 * 1024 * 100, // 100MB
		HeapMax:      1024 * 1024 * 512, // 512MB
		NonHeapUsed:  1024 * 1024 * 50,
		ThreadsLive:  50,
		CpuUsage:     0.25,
		GcCount:      100,
		GcTime:       1.5,
		Timestamp:    time.Now(),
	}

	err := storage.Save(metrics)
	if err != nil {
		t.Fatalf("Save() error = %v", err)
	}
}

func TestSQLiteStorage_GetLatest(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	// Save some metrics
	now := time.Now()
	for i := 0; i < 3; i++ {
		metrics := &models.PoolMetrics{
			TargetName:   "test-target",
			InstanceName: "default",
			Status:       models.StatusHealthy,
			Active:       i + 1,
			Idle:         10 - i,
			Max:          20,
			Timestamp:    now.Add(time.Duration(i) * time.Minute),
		}
		if err := storage.Save(metrics); err != nil {
			t.Fatalf("Save() error = %v", err)
		}
	}

	// Get latest
	latest, err := storage.GetLatest("test-target")
	if err != nil {
		t.Fatalf("GetLatest() error = %v", err)
	}

	if latest == nil {
		t.Fatal("expected non-nil result")
	}

	// Should get the most recent one (Active = 3)
	if latest.Active != 3 {
		t.Errorf("expected Active = 3, got %d", latest.Active)
	}
}

func TestSQLiteStorage_GetLatest_NotFound(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	latest, err := storage.GetLatest("non-existent")
	if err != nil {
		t.Fatalf("GetLatest() error = %v", err)
	}

	if latest != nil {
		t.Errorf("expected nil for non-existent target, got %v", latest)
	}
}

func TestSQLiteStorage_GetHistory(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	// Save metrics over 2 hours
	for i := 0; i < 24; i++ {
		metrics := &models.PoolMetrics{
			TargetName:   "test-target",
			InstanceName: "default",
			Status:       models.StatusHealthy,
			Active:       i % 10,
			Max:          20,
			Timestamp:    now.Add(time.Duration(-i*5) * time.Minute),
		}
		if err := storage.Save(metrics); err != nil {
			t.Fatalf("Save() error = %v", err)
		}
	}

	// Get 1 hour of history
	history, err := storage.GetHistory("test-target", time.Hour)
	if err != nil {
		t.Fatalf("GetHistory() error = %v", err)
	}

	// Should have ~12 data points (5 min intervals over 1 hour)
	if len(history) < 10 || len(history) > 15 {
		t.Errorf("expected ~12 history points, got %d", len(history))
	}
}

func TestSQLiteStorage_DeleteOld(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	// Save old and new metrics
	oldMetrics := &models.PoolMetrics{
		TargetName:   "test-target",
		InstanceName: "default",
		Status:       models.StatusHealthy,
		Active:       1,
		Max:          20,
		Timestamp:    now.Add(-48 * time.Hour), // 2 days ago
	}
	newMetrics := &models.PoolMetrics{
		TargetName:   "test-target",
		InstanceName: "default",
		Status:       models.StatusHealthy,
		Active:       2,
		Max:          20,
		Timestamp:    now,
	}

	storage.Save(oldMetrics)
	storage.Save(newMetrics)

	// Delete data older than 24 hours
	deleted, err := storage.DeleteOld(24 * time.Hour)
	if err != nil {
		t.Fatalf("DeleteOld() error = %v", err)
	}

	if deleted != 1 {
		t.Errorf("expected 1 deleted, got %d", deleted)
	}

	// Verify only new metrics remain
	history, _ := storage.GetHistory("test-target", 72*time.Hour)
	if len(history) != 1 {
		t.Errorf("expected 1 remaining record, got %d", len(history))
	}
}

func TestSQLiteStorage_GetLatestByInstance(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	// Save metrics for different instances
	instances := []string{"inst-1", "inst-2", "inst-3"}
	for i, inst := range instances {
		metrics := &models.PoolMetrics{
			TargetName:   "test-target",
			InstanceName: inst,
			Status:       models.StatusHealthy,
			Active:       i + 1,
			Max:          20,
			Timestamp:    now,
		}
		if err := storage.Save(metrics); err != nil {
			t.Fatalf("Save() error = %v", err)
		}
	}

	// Get latest for inst-2
	latest, err := storage.GetLatestByInstance("test-target", "inst-2")
	if err != nil {
		t.Fatalf("GetLatestByInstance() error = %v", err)
	}

	if latest == nil {
		t.Fatal("expected non-nil result")
	}

	if latest.InstanceName != "inst-2" {
		t.Errorf("expected instance 'inst-2', got %s", latest.InstanceName)
	}

	if latest.Active != 2 {
		t.Errorf("expected Active = 2, got %d", latest.Active)
	}
}

func TestSQLiteStorage_GetLatestAllInstances(t *testing.T) {
	storage, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	instances := []string{"inst-1", "inst-2"}
	for i, inst := range instances {
		metrics := &models.PoolMetrics{
			TargetName:   "test-target",
			InstanceName: inst,
			Status:       models.StatusHealthy,
			Active:       i + 1,
			Max:          20,
			Timestamp:    now,
		}
		storage.Save(metrics)
	}

	// Get all instances
	all, err := storage.GetLatestAllInstances("test-target")
	if err != nil {
		t.Fatalf("GetLatestAllInstances() error = %v", err)
	}

	if len(all) != 2 {
		t.Errorf("expected 2 instances, got %d", len(all))
	}
}
