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

// MaintenanceWindow represents a scheduled maintenance period
// During a maintenance window, alerts are suppressed
type MaintenanceWindow struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	TargetName  string     `json:"target_name,omitempty"` // Empty means all targets
	StartTime   time.Time  `json:"start_time"`
	EndTime     time.Time  `json:"end_time"`
	Recurring   bool       `json:"recurring"`           // If true, repeats weekly
	DaysOfWeek  string     `json:"days_of_week,omitempty"` // Comma-separated days (0-6, 0=Sunday)
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// MaintenanceWindowInput is used for creating/updating maintenance windows
type MaintenanceWindowInput struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	TargetName  string `json:"target_name"`
	StartTime   string `json:"start_time" binding:"required"` // RFC3339 format
	EndTime     string `json:"end_time" binding:"required"`   // RFC3339 format
	Recurring   bool   `json:"recurring"`
	DaysOfWeek  string `json:"days_of_week"`
}

// IsActive checks if the maintenance window is currently active
func (m *MaintenanceWindow) IsActive(now time.Time) bool {
	if m.Recurring {
		// For recurring windows, check if current day matches and time is within range
		currentDay := int(now.Weekday())
		days := parseDaysOfWeek(m.DaysOfWeek)

		dayMatches := false
		for _, d := range days {
			if d == currentDay {
				dayMatches = true
				break
			}
		}
		if !dayMatches {
			return false
		}

		// Check time range (using only hour:minute)
		nowMinutes := now.Hour()*60 + now.Minute()
		startMinutes := m.StartTime.Hour()*60 + m.StartTime.Minute()
		endMinutes := m.EndTime.Hour()*60 + m.EndTime.Minute()

		return nowMinutes >= startMinutes && nowMinutes <= endMinutes
	}

	// One-time window: simple range check
	return now.After(m.StartTime) && now.Before(m.EndTime)
}

// MatchesTarget checks if this window applies to the given target
func (m *MaintenanceWindow) MatchesTarget(targetName string) bool {
	return m.TargetName == "" || m.TargetName == targetName
}

// parseDaysOfWeek parses a comma-separated string of day numbers
func parseDaysOfWeek(s string) []int {
	if s == "" {
		return nil
	}

	var days []int
	for _, part := range splitComma(s) {
		var day int
		if _, err := parseIntFromStr(part, &day); err == nil && day >= 0 && day <= 6 {
			days = append(days, day)
		}
	}
	return days
}

func splitComma(s string) []string {
	var result []string
	for _, p := range []byte(s) {
		if p == ',' {
			continue
		}
		result = append(result, string(p))
	}
	return result
}

func parseIntFromStr(s string, out *int) (bool, error) {
	if len(s) == 1 && s[0] >= '0' && s[0] <= '9' {
		*out = int(s[0] - '0')
		return true, nil
	}
	return false, nil
}
