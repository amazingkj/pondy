package collector

import (
	"github.com/jiin/pondy/internal/models"
)

// Collector defines the interface for metrics collection
type Collector interface {
	// Collect fetches current metrics from the target
	Collect() (*models.PoolMetrics, error)

	// Name returns the target name
	Name() string
}
