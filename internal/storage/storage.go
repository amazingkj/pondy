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

	// Alert-related methods

	// SaveAlert stores a new alert
	SaveAlert(alert *models.Alert) error

	// UpdateAlert updates an existing alert
	UpdateAlert(alert *models.Alert) error

	// GetAlert returns an alert by ID
	GetAlert(id int64) (*models.Alert, error)

	// GetAlerts returns alerts with optional filters
	GetAlerts(status string, limit int) ([]models.Alert, error)

	// GetActiveAlertByRule returns active alert for a specific target/instance/rule
	GetActiveAlertByRule(targetName, instanceName, ruleName string) (*models.Alert, error)

	// GetAlertStats returns alert statistics
	GetAlertStats() (*models.AlertStats, error)

	// CleanupAlerts deletes resolved alerts older than the given time
	CleanupAlerts(olderThan time.Time) (int64, error)

	// AlertRule-related methods

	// SaveAlertRule creates a new alert rule
	SaveAlertRule(rule *models.AlertRule) error

	// UpdateAlertRule updates an existing alert rule
	UpdateAlertRule(rule *models.AlertRule) error

	// DeleteAlertRule deletes an alert rule by ID
	DeleteAlertRule(id int64) error

	// GetAlertRule returns an alert rule by ID
	GetAlertRule(id int64) (*models.AlertRule, error)

	// GetAlertRules returns all alert rules
	GetAlertRules() ([]models.AlertRule, error)

	// GetAlertRuleByName returns an alert rule by name
	GetAlertRuleByName(name string) (*models.AlertRule, error)

	// Backup-related methods

	// CreateBackup creates a backup of the database
	CreateBackup(destPath string) error

	// RestoreBackup restores the database from a backup file
	RestoreBackup(srcPath string) error

	// MaintenanceWindow-related methods

	// SaveMaintenanceWindow creates a new maintenance window
	SaveMaintenanceWindow(window *models.MaintenanceWindow) error

	// UpdateMaintenanceWindow updates an existing maintenance window
	UpdateMaintenanceWindow(window *models.MaintenanceWindow) error

	// DeleteMaintenanceWindow deletes a maintenance window by ID
	DeleteMaintenanceWindow(id int64) error

	// GetMaintenanceWindow returns a maintenance window by ID
	GetMaintenanceWindow(id int64) (*models.MaintenanceWindow, error)

	// GetAllMaintenanceWindows returns all maintenance windows
	GetAllMaintenanceWindows() ([]models.MaintenanceWindow, error)

	// GetActiveMaintenanceWindows returns currently active maintenance windows
	GetActiveMaintenanceWindows() ([]models.MaintenanceWindow, error)

	// IsInMaintenanceWindow checks if a target is in maintenance
	IsInMaintenanceWindow(targetName string) (bool, error)

	// Close closes the storage connection
	Close() error
}
