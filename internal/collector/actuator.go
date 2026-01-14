package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jiin/pondy/internal/models"
)

// Shared HTTP transport with connection pooling
var (
	sharedTransport *http.Transport
	transportOnce   sync.Once
)

func getSharedTransport() *http.Transport {
	transportOnce.Do(func() {
		sharedTransport = &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   5 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  true, // Actuator responses are small
		}
	})
	return sharedTransport
}

// ActuatorCollector collects metrics from Spring Boot Actuator endpoints
type ActuatorCollector struct {
	name         string
	instanceName string
	endpoint     string
	client       *http.Client
}

// ActuatorMetricResponse represents Spring Actuator metric response
type ActuatorMetricResponse struct {
	Name          string                `json:"name"`
	Measurements  []ActuatorMeasurement `json:"measurements"`
	AvailableTags []ActuatorTag         `json:"availableTags"`
}

type ActuatorMeasurement struct {
	Statistic string  `json:"statistic"`
	Value     float64 `json:"value"`
}

type ActuatorTag struct {
	Tag    string   `json:"tag"`
	Values []string `json:"values"`
}

// HealthResponse represents Spring Actuator health response
type HealthResponse struct {
	Status string `json:"status"`
}

func NewActuatorCollector(name, instanceName, endpoint string) *ActuatorCollector {
	return &ActuatorCollector{
		name:         name,
		instanceName: instanceName,
		endpoint:     endpoint,
		client: &http.Client{
			Timeout:   5 * time.Second,
			Transport: getSharedTransport(),
		},
	}
}

func (c *ActuatorCollector) Name() string {
	return c.name
}

func (c *ActuatorCollector) InstanceName() string {
	return c.instanceName
}

// Collect collects metrics without context (legacy, uses background context)
func (c *ActuatorCollector) Collect() (*models.PoolMetrics, error) {
	return c.CollectWithContext(context.Background())
}

// CollectWithContext collects metrics with context for timeout/cancellation
func (c *ActuatorCollector) CollectWithContext(ctx context.Context) (*models.PoolMetrics, error) {
	metrics := &models.PoolMetrics{
		TargetName:   c.name,
		InstanceName: c.instanceName,
		Timestamp:    time.Now(),
	}

	// Use WaitGroup for parallel metric collection
	var wg sync.WaitGroup
	var mu sync.Mutex

	// Results storage
	type metricResult struct {
		name  string
		value float64
		err   error
	}
	results := make(map[string]metricResult)

	// Define metrics to fetch in parallel
	hikariMetrics := []string{
		"hikaricp.connections.active",
		"hikaricp.connections.idle",
		"hikaricp.connections.pending",
		"hikaricp.connections.max",
		"hikaricp.connections.timeout",
		"hikaricp.connections.acquire",
	}

	// Fetch health check
	wg.Add(1)
	go func() {
		defer wg.Done()
		status := c.checkHealthWithContext(ctx)
		mu.Lock()
		results["health"] = metricResult{name: "health", value: 0, err: nil}
		if status == "UP" {
			results["health"] = metricResult{name: "health", value: 1, err: nil}
		}
		mu.Unlock()
	}()

	// Fetch HikariCP metrics in parallel
	for _, metricName := range hikariMetrics {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			val, err := c.fetchMetricWithContext(ctx, name)
			mu.Lock()
			results[name] = metricResult{name: name, value: val, err: err}
			mu.Unlock()
		}(metricName)
	}

	// Fetch JVM metrics in parallel
	jvmMetrics := []struct {
		name    string
		tag     string
		tagVal  string
		handler func(float64)
	}{
		{"jvm.memory.used", "area", "heap", func(v float64) { metrics.HeapUsed = int64(v) }},
		{"jvm.memory.max", "area", "heap", func(v float64) { metrics.HeapMax = int64(v) }},
		{"jvm.memory.used", "area", "nonheap", func(v float64) { metrics.NonHeapUsed = int64(v) }},
		{"jvm.memory.max", "area", "nonheap", func(v float64) { metrics.NonHeapMax = int64(v) }},
		{"jvm.threads.live", "", "", func(v float64) { metrics.ThreadsLive = int(v) }},
		{"process.cpu.usage", "", "", func(v float64) { metrics.CpuUsage = v }},
	}

	for _, jm := range jvmMetrics {
		wg.Add(1)
		go func(m struct {
			name    string
			tag     string
			tagVal  string
			handler func(float64)
		}) {
			defer wg.Done()
			var val float64
			var err error
			if m.tag != "" {
				val, err = c.fetchMetricWithTagAndContext(ctx, m.name, m.tag, m.tagVal)
			} else {
				val, err = c.fetchMetricWithContext(ctx, m.name)
			}
			if err == nil {
				mu.Lock()
				m.handler(val)
				mu.Unlock()
			}
		}(jm)
	}

	// Fetch GC metrics in parallel
	wg.Add(1)
	go func() {
		defer wg.Done()
		count, gcTime, youngCount, oldCount := c.fetchGcMetricsWithContext(ctx)
		mu.Lock()
		metrics.GcCount = count
		metrics.GcTime = gcTime
		metrics.YoungGcCount = youngCount
		metrics.OldGcCount = oldCount
		mu.Unlock()
	}()

	wg.Wait()

	// Process HikariCP results
	activeRes := results["hikaricp.connections.active"]
	if activeRes.err != nil {
		if strings.Contains(activeRes.err.Error(), "404") {
			healthRes := results["health"]
			if healthRes.value == 1 {
				metrics.Status = models.StatusNoPool
				return metrics, nil
			}
		}
		metrics.Status = models.StatusError
		return metrics, activeRes.err
	}
	metrics.Active = int(activeRes.value)

	// Check required metrics
	idleRes := results["hikaricp.connections.idle"]
	if idleRes.err != nil {
		metrics.Status = models.StatusError
		return metrics, fmt.Errorf("failed to fetch idle: %w", idleRes.err)
	}
	metrics.Idle = int(idleRes.value)

	pendingRes := results["hikaricp.connections.pending"]
	if pendingRes.err != nil {
		metrics.Status = models.StatusError
		return metrics, fmt.Errorf("failed to fetch pending: %w", pendingRes.err)
	}
	metrics.Pending = int(pendingRes.value)

	maxRes := results["hikaricp.connections.max"]
	if maxRes.err != nil {
		metrics.Status = models.StatusError
		return metrics, fmt.Errorf("failed to fetch max: %w", maxRes.err)
	}
	metrics.Max = int(maxRes.value)

	// Optional metrics (ignore errors)
	if timeoutRes := results["hikaricp.connections.timeout"]; timeoutRes.err == nil {
		metrics.Timeout = int64(timeoutRes.value)
	}
	if acquireRes := results["hikaricp.connections.acquire"]; acquireRes.err == nil {
		metrics.AcquireP99 = acquireRes.value
	}

	metrics.Status = models.StatusHealthy
	return metrics, nil
}

func (c *ActuatorCollector) checkHealth() string {
	return c.checkHealthWithContext(context.Background())
}

func (c *ActuatorCollector) checkHealthWithContext(ctx context.Context) string {
	// Derive health endpoint from metrics endpoint
	// e.g., http://host:port/actuator/metrics -> http://host:port/actuator/health
	healthURL := strings.Replace(c.endpoint, "/metrics", "/health", 1)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
	if err != nil {
		return "DOWN"
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return "DOWN"
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "DOWN"
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return "UNKNOWN"
	}

	return health.Status
}

func (c *ActuatorCollector) fetchMetric(metricName string) (float64, error) {
	return c.fetchMetricWithContext(context.Background(), metricName)
}

func (c *ActuatorCollector) fetchMetricWithContext(ctx context.Context, metricName string) (float64, error) {
	url := fmt.Sprintf("%s/%s", c.endpoint, metricName)
	return c.fetchMetricURLWithContext(ctx, url)
}

func (c *ActuatorCollector) fetchMetricWithTag(metricName, tagKey, tagValue string) (float64, error) {
	return c.fetchMetricWithTagAndContext(context.Background(), metricName, tagKey, tagValue)
}

func (c *ActuatorCollector) fetchMetricWithTagAndContext(ctx context.Context, metricName, tagKey, tagValue string) (float64, error) {
	url := fmt.Sprintf("%s/%s?tag=%s:%s", c.endpoint, metricName, tagKey, tagValue)
	return c.fetchMetricURLWithContext(ctx, url)
}

func (c *ActuatorCollector) fetchMetricURL(url string) (float64, error) {
	return c.fetchMetricURLWithContext(context.Background(), url)
}

func (c *ActuatorCollector) fetchMetricURLWithContext(ctx context.Context, url string) (float64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := c.client.Do(req)
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

func (c *ActuatorCollector) fetchGcMetrics() (gcCount int64, gcTime float64, youngGcCount int64, oldGcCount int64) {
	return c.fetchGcMetricsWithContext(context.Background())
}

func (c *ActuatorCollector) fetchGcMetricsWithContext(ctx context.Context) (gcCount int64, gcTime float64, youngGcCount int64, oldGcCount int64) {
	// Fetch jvm.gc.pause which contains COUNT and TOTAL_TIME statistics
	url := fmt.Sprintf("%s/jvm.gc.pause", c.endpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, 0, 0
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return 0, 0, 0, 0
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, 0, 0, 0
	}

	var result ActuatorMetricResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, 0, 0, 0
	}

	// Extract COUNT and TOTAL_TIME from measurements
	for _, m := range result.Measurements {
		switch m.Statistic {
		case "COUNT":
			gcCount = int64(m.Value)
		case "TOTAL_TIME":
			gcTime = m.Value
		}
	}

	// Try to get young/minor GC count
	youngUrl := fmt.Sprintf("%s/jvm.gc.pause?tag=action:end of minor GC", c.endpoint)
	youngReq, err := http.NewRequestWithContext(ctx, http.MethodGet, youngUrl, nil)
	if err == nil {
		if youngResp, err := c.client.Do(youngReq); err == nil {
			defer youngResp.Body.Close()
			if youngResp.StatusCode == http.StatusOK {
				var youngResult ActuatorMetricResponse
				if json.NewDecoder(youngResp.Body).Decode(&youngResult) == nil {
					for _, m := range youngResult.Measurements {
						if m.Statistic == "COUNT" {
							youngGcCount = int64(m.Value)
							break
						}
					}
				}
			}
		}
	}

	// Try to get old/major GC count
	oldUrl := fmt.Sprintf("%s/jvm.gc.pause?tag=action:end of major GC", c.endpoint)
	oldReq, err := http.NewRequestWithContext(ctx, http.MethodGet, oldUrl, nil)
	if err == nil {
		if oldResp, err := c.client.Do(oldReq); err == nil {
			defer oldResp.Body.Close()
			if oldResp.StatusCode == http.StatusOK {
				var oldResult ActuatorMetricResponse
				if json.NewDecoder(oldResp.Body).Decode(&oldResult) == nil {
					for _, m := range oldResult.Measurements {
						if m.Statistic == "COUNT" {
							oldGcCount = int64(m.Value)
							break
						}
					}
				}
			}
		}
	}

	return gcCount, gcTime, youngGcCount, oldGcCount
}