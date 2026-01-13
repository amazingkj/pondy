package alerter

import (
	"github.com/jiin/pondy/internal/models"
)

// Channel defines the interface for notification channels
type Channel interface {
	// Name returns the channel name
	Name() string

	// Send sends an alert notification
	Send(alert *models.Alert) error

	// SendResolved sends a resolution notification
	SendResolved(alert *models.Alert) error

	// IsEnabled returns whether the channel is enabled
	IsEnabled() bool
}
