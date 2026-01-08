package storage

import (
	"time"

	"github.com/jiin/pondy/internal/models"
)

// Storage defines the interface for metrics persistence
type Storage interface {
	// Save stores a new metrics record
	Save(metrics *models.PoolMetrics) error

	// GetLatest returns the most recent metrics for a target
	GetLatest(targetName string) (*models.PoolMetrics, error)

	// GetHistory returns metrics within a time range
	GetHistory(targetName string, from, to time.Time) ([]models.PoolMetrics, error)

	// GetTargets returns all known target names
	GetTargets() ([]string, error)

	// Close closes the storage connection
	Close() error
}
