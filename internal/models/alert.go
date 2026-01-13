package models

import "time"

// Alert represents an alert event
type Alert struct {
	ID           int64      `json:"id"`
	TargetName   string     `json:"target_name"`
	InstanceName string     `json:"instance_name"`
	RuleName     string     `json:"rule_name"`
	Severity     string     `json:"severity"` // info, warning, critical
	Message      string     `json:"message"`
	Status       string     `json:"status"` // fired, resolved
	FiredAt      time.Time  `json:"fired_at"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
	NotifiedAt   *time.Time `json:"notified_at,omitempty"`
	Channels     string     `json:"channels"` // comma-separated channel names
}

// AlertStats contains alert statistics
type AlertStats struct {
	TotalAlerts    int            `json:"total_alerts"`
	ActiveAlerts   int            `json:"active_alerts"`
	ResolvedAlerts int            `json:"resolved_alerts"`
	BySeverity     map[string]int `json:"by_severity"`
	ByTarget       map[string]int `json:"by_target"`
	ByRule         map[string]int `json:"by_rule"`
}

// Severity levels
const (
	SeverityInfo     = "info"
	SeverityWarning  = "warning"
	SeverityCritical = "critical"
)

// Alert status
const (
	AlertStatusFired    = "fired"
	AlertStatusResolved = "resolved"
)

// AlertRule represents an alerting rule stored in DB
type AlertRule struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Condition string    `json:"condition"` // e.g., "usage > 80", "pending > 5"
	Severity  string    `json:"severity"`  // info, warning, critical
	Message   string    `json:"message"`   // Template message
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// AlertRuleInput is used for creating/updating rules
type AlertRuleInput struct {
	Name      string `json:"name" binding:"required"`
	Condition string `json:"condition" binding:"required"`
	Severity  string `json:"severity" binding:"required"`
	Message   string `json:"message"`
	Enabled   *bool  `json:"enabled"`
}

// IsEnabled returns whether the rule is enabled (defaults to true)
func (r *AlertRule) IsEnabled() bool {
	return r.Enabled
}

// ToConfigRule converts to config.AlertRule for compatibility
func (r *AlertRule) ToConfigRule() interface{} {
	enabled := r.Enabled
	return struct {
		Name      string
		Condition string
		Severity  string
		Message   string
		Enabled   *bool
	}{
		Name:      r.Name,
		Condition: r.Condition,
		Severity:  r.Severity,
		Message:   r.Message,
		Enabled:   &enabled,
	}
}
