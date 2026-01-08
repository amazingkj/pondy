package models

import "time"

// PoolMetrics represents connection pool metrics at a point in time
type PoolMetrics struct {
	ID           int64     `json:"id"`
	TargetName   string    `json:"target_name"`
	InstanceName string    `json:"instance_name"`
	Active       int       `json:"active"`
	Idle         int       `json:"idle"`
	Pending      int       `json:"pending"`
	Max          int       `json:"max"`
	Timeout      int64     `json:"timeout"`
	AcquireP99   float64   `json:"acquire_p99"`
	Timestamp    time.Time `json:"timestamp"`
}

// TargetStatus represents current status of a monitoring target
type TargetStatus struct {
	Name      string           `json:"name"`
	Status    string           `json:"status"` // healthy, unhealthy, unknown
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
