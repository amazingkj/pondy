package storage

import (
	"time"

	"github.com/jiin/pondy/internal/models"
)

// Storage defines the interface for metrics persistence
type Storage interface {
	// Save stores a new metrics record
	Save(metrics *models.PoolMetrics) error

	// GetLatest returns the most recent metrics for a target (aggregated across instances)
	GetLatest(targetName string) (*models.PoolMetrics, error)

	// GetLatestByInstance returns the most recent metrics for a specific instance
	GetLatestByInstance(targetName, instanceName string) (*models.PoolMetrics, error)

	// GetLatestAllInstances returns the most recent metrics for each instance of a target
	GetLatestAllInstances(targetName string) ([]models.PoolMetrics, error)

	// GetHistory returns metrics within a time range
	GetHistory(targetName string, from, to time.Time) ([]models.PoolMetrics, error)

	// GetHistoryByInstance returns metrics for a specific instance within a time range
	GetHistoryByInstance(targetName, instanceName string, from, to time.Time) ([]models.PoolMetrics, error)

	// GetInstances returns all instance names for a target
	GetInstances(targetName string) ([]string, error)

	// GetTargets returns all known target names
	GetTargets() ([]string, error)

	// Cleanup deletes records older than the given time
	Cleanup(olderThan time.Time) (int64, error)

	// Close closes the storage connection
	Close() error
}
