package collector

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
	"github.com/jiin/pondy/internal/storage"
)

// CollectorInfo holds collector and its cancel function
type CollectorInfo struct {
	Collector *ActuatorCollector
	Cancel    context.CancelFunc
	Interval  time.Duration
	Endpoint  string
}

// Manager manages multiple collectors with hot reload support
type Manager struct {
	mu            sync.RWMutex
	collectors    map[string]*CollectorInfo // key: "targetName/instanceID"
	store         storage.Storage
	alertCallback func(*models.PoolMetrics)
}

// NewManager creates a new collector manager
func NewManager(store storage.Storage) *Manager {
	return &Manager{
		collectors: make(map[string]*CollectorInfo),
		store:      store,
	}
}

// UpdateFromConfig updates collectors based on config changes
func (m *Manager) UpdateFromConfig(cfg *config.Config) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Build desired state from config
	desired := make(map[string]config.TargetConfig)
	for _, target := range cfg.Targets {
		instances := target.GetInstances()
		for _, inst := range instances {
			key := target.Name + "/" + inst.ID
			desired[key] = target
		}
	}

	// Stop collectors that are no longer in config
	for key, info := range m.collectors {
		if _, exists := desired[key]; !exists {
			log.Printf("Stopping collector: %s", key)
			info.Cancel()
			delete(m.collectors, key)
		}
	}

	// Start new collectors or update existing ones
	for _, target := range cfg.Targets {
		instances := target.GetInstances()
		for _, inst := range instances {
			key := target.Name + "/" + inst.ID

			if existing, exists := m.collectors[key]; exists {
				// Check if interval or endpoint changed
				if existing.Interval != target.Interval || existing.Endpoint != inst.Endpoint {
					log.Printf("Restarting collector (config changed): %s -> %s (interval: %v)", key, inst.Endpoint, target.Interval)
					existing.Cancel()
					m.startCollector(target.Name, inst.ID, inst.Endpoint, target.Interval)
				}
				// Note: group changes don't require collector restart
				// as group is read from config at API response time
			} else {
				// New collector
				log.Printf("Starting collector: %s -> %s (interval: %v)", key, inst.Endpoint, target.Interval)
				m.startCollector(target.Name, inst.ID, inst.Endpoint, target.Interval)
			}
		}
	}

	log.Printf("Collector manager updated: %d active collectors", len(m.collectors))
}

// startCollector starts a new collector goroutine
func (m *Manager) startCollector(name, instanceID, endpoint string, interval time.Duration) {
	key := name + "/" + instanceID
	ctx, cancel := context.WithCancel(context.Background())

	collector := NewActuatorCollector(name, instanceID, endpoint)
	m.collectors[key] = &CollectorInfo{
		Collector: collector,
		Cancel:    cancel,
		Interval:  interval,
		Endpoint:  endpoint,
	}

	go m.runCollector(ctx, collector, interval)
}

// runCollector runs the collector loop
func (m *Manager) runCollector(ctx context.Context, c *ActuatorCollector, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Collect immediately on start
	m.collect(c)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.collect(c)
		}
	}
}

// collect performs a single collection
func (m *Manager) collect(c *ActuatorCollector) {
	metrics, err := c.Collect()
	if err != nil {
		if metrics == nil || metrics.Status != "no_pool" {
			log.Printf("Failed to collect from %s/%s: %v", c.Name(), c.InstanceName(), err)
			return
		}
	}

	if err := m.store.Save(metrics); err != nil {
		log.Printf("Failed to save metrics for %s/%s: %v", c.Name(), c.InstanceName(), err)
	}

	// Alert check hook
	m.mu.RLock()
	callback := m.alertCallback
	m.mu.RUnlock()

	if callback != nil && metrics != nil {
		callback(metrics)
	}
}

// Stop stops all collectors
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for key, info := range m.collectors {
		log.Printf("Stopping collector: %s", key)
		info.Cancel()
	}
	m.collectors = make(map[string]*CollectorInfo)
}

// Count returns the number of active collectors
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.collectors)
}

// SetAlertCallback sets the callback function for alert checking
func (m *Manager) SetAlertCallback(callback func(*models.PoolMetrics)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.alertCallback = callback
}
