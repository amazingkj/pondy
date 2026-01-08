package retention

import (
	"context"
	"log"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/storage"
)

// Manager handles automatic cleanup of old data
type Manager struct {
	store  storage.Storage
	maxAge time.Duration
	cancel context.CancelFunc
}

// NewManager creates a new retention manager
func NewManager(store storage.Storage, cfg *config.RetentionConfig) *Manager {
	return &Manager{
		store:  store,
		maxAge: cfg.GetMaxAge(),
	}
}

// Start begins the background cleanup routine
func (m *Manager) Start(interval time.Duration) {
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Run cleanup immediately on start
		m.runCleanup()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.runCleanup()
			}
		}
	}()

	log.Printf("Retention manager started: max_age=%v, interval=%v", m.maxAge, interval)
}

func (m *Manager) runCleanup() {
	olderThan := time.Now().Add(-m.maxAge)
	deleted, err := m.store.Cleanup(olderThan)
	if err != nil {
		log.Printf("Retention cleanup failed: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("Retention cleanup: deleted %d records older than %v", deleted, olderThan.Format(time.RFC3339))
	}
}

// Stop stops the background cleanup routine
func (m *Manager) Stop() {
	if m.cancel != nil {
		m.cancel()
	}
}
