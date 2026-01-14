package models

import "time"

// Pool status constants
const (
	StatusHealthy = "healthy"  // HikariCP metrics available
	StatusNoPool  = "no_pool"  // Service alive but no connection pool
	StatusError   = "error"    // Service unreachable or error
)

// PoolMetrics represents connection pool and JVM metrics at a point in time
type PoolMetrics struct {
	ID           int64     `json:"id"`
	TargetName   string    `json:"target_name"`
	InstanceName string    `json:"instance_name"`
	Status       string    `json:"status"` // healthy, no_pool, error

	// HikariCP metrics
	Active     int     `json:"active"`
	Idle       int     `json:"idle"`
	Pending    int     `json:"pending"`
	Max        int     `json:"max"`
	Timeout    int64   `json:"timeout"`
	AcquireP99 float64 `json:"acquire_p99"`

	// JVM metrics
	HeapUsed    int64   `json:"heap_used"`     // bytes
	HeapMax     int64   `json:"heap_max"`      // bytes
	NonHeapUsed int64   `json:"non_heap_used"` // bytes
	NonHeapMax  int64   `json:"non_heap_max"`  // bytes
	ThreadsLive int     `json:"threads_live"`
	CpuUsage    float64 `json:"cpu_usage"` // 0.0 ~ 1.0

	// GC metrics
	GcCount     int64   `json:"gc_count"`      // total GC count
	GcTime      float64 `json:"gc_time"`       // total GC time in seconds
	YoungGcCount int64  `json:"young_gc_count"` // young gen GC count
	OldGcCount   int64  `json:"old_gc_count"`   // old gen GC count

	Timestamp time.Time `json:"timestamp"`
}

// TargetStatus represents current status of a monitoring target
type TargetStatus struct {
	Name      string           `json:"name"`
	Group     string           `json:"group,omitempty"` // Environment group: dev, staging, prod, etc.
	Status    string           `json:"status"`          // healthy, unhealthy, unknown
	Current   *PoolMetrics     `json:"current,omitempty"`
	Instances []InstanceStatus `json:"instances,omitempty"`
}

// InstanceStatus represents current status of an instance
type InstanceStatus struct {
	InstanceName string       `json:"instance_name"`
	Status       string       `json:"status"`
	Current      *PoolMetrics `json:"current,omitempty"`
}

// HistoryResponse represents historical metrics data
type HistoryResponse struct {
	TargetName string        `json:"target_name"`
	Datapoints []PoolMetrics `json:"datapoints"`
}
