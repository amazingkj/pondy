package collector

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jiin/pondy/internal/models"
)

// ActuatorCollector collects metrics from Spring Boot Actuator endpoints
type ActuatorCollector struct {
	name     string
	endpoint string
	client   *http.Client
}

// ActuatorMetricResponse represents Spring Actuator metric response
type ActuatorMetricResponse struct {
	Name         string                   `json:"name"`
	Measurements []ActuatorMeasurement    `json:"measurements"`
	AvailableTags []ActuatorTag           `json:"availableTags"`
}

type ActuatorMeasurement struct {
	Statistic string  `json:"statistic"`
	Value     float64 `json:"value"`
}

type ActuatorTag struct {
	Tag    string   `json:"tag"`
	Values []string `json:"values"`
}

func NewActuatorCollector(name, endpoint string) *ActuatorCollector {
	return &ActuatorCollector{
		name:     name,
		endpoint: endpoint,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *ActuatorCollector) Name() string {
	return c.name
}

func (c *ActuatorCollector) Collect() (*models.PoolMetrics, error) {
	metrics := &models.PoolMetrics{
		TargetName: c.name,
		Timestamp:  time.Now(),
	}

	// Collect active connections
	active, err := c.fetchMetric("hikaricp.connections.active")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch active: %w", err)
	}
	metrics.Active = int(active)

	// Collect idle connections
	idle, err := c.fetchMetric("hikaricp.connections.idle")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch idle: %w", err)
	}
	metrics.Idle = int(idle)

	// Collect pending connections
	pending, err := c.fetchMetric("hikaricp.connections.pending")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch pending: %w", err)
	}
	metrics.Pending = int(pending)

	// Collect max connections
	max, err := c.fetchMetric("hikaricp.connections.max")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch max: %w", err)
	}
	metrics.Max = int(max)

	// Optionally collect timeout count
	timeout, _ := c.fetchMetric("hikaricp.connections.timeout")
	metrics.Timeout = int64(timeout)

	// Optionally collect acquire time p99
	acquireP99, _ := c.fetchMetric("hikaricp.connections.acquire")
	metrics.AcquireP99 = acquireP99

	return metrics, nil
}

func (c *ActuatorCollector) fetchMetric(metricName string) (float64, error) {
	url := fmt.Sprintf("%s/%s", c.endpoint, metricName)
	resp, err := c.client.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var result ActuatorMetricResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	// Find VALUE measurement
	for _, m := range result.Measurements {
		if m.Statistic == "VALUE" || m.Statistic == "COUNT" {
			return m.Value, nil
		}
	}

	// If no VALUE found, return first measurement
	if len(result.Measurements) > 0 {
		return result.Measurements[0].Value, nil
	}

	return 0, fmt.Errorf("no measurements found")
}
