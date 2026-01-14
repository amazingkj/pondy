package alerter

import (
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
	"github.com/jiin/pondy/internal/storage"
)

// Manager manages alert evaluation and notification
type Manager struct {
	mu        sync.RWMutex
	cfg       *config.AlertingConfig
	store     storage.Storage
	channels  []Channel
	dbRules   []models.AlertRule                // rules from database
	lastFired map[string]time.Time // cooldown tracking: "target/instance/rule" -> last fired time
	stop      chan struct{}
}

// NewManager creates a new alert manager
func NewManager(store storage.Storage, cfg *config.AlertingConfig) *Manager {
	m := &Manager{
		cfg:       cfg,
		store:     store,
		channels:  make([]Channel, 0),
		dbRules:   make([]models.AlertRule, 0),
		lastFired: make(map[string]time.Time),
		stop:      make(chan struct{}),
	}

	m.initChannels(cfg)
	m.loadDBRules()
	return m
}

// loadDBRules loads alert rules from database
func (m *Manager) loadDBRules() {
	rules, err := m.store.GetAlertRules()
	if err != nil {
		log.Printf("Alerter: failed to load DB rules: %v", err)
		return
	}
	m.mu.Lock()
	m.dbRules = rules
	m.mu.Unlock()
	log.Printf("Alerter: loaded %d rules from database", len(rules))
}

// ReloadRules reloads alert rules from database
func (m *Manager) ReloadRules() {
	m.loadDBRules()
}

// channelFactory defines a channel constructor
type channelFactory struct {
	name    string
	enabled bool
	create  func() Channel
}

// initChannels initializes notification channels from config
func (m *Manager) initChannels(cfg *config.AlertingConfig) {
	m.channels = make([]Channel, 0)

	// Define all available channels
	factories := []channelFactory{
		{"Slack", cfg.Channels.Slack.Enabled, func() Channel { return NewSlackChannel(cfg.Channels.Slack) }},
		{"Discord", cfg.Channels.Discord.Enabled, func() Channel { return NewDiscordChannel(cfg.Channels.Discord) }},
		{"Mattermost", cfg.Channels.Mattermost.Enabled, func() Channel { return NewMattermostChannel(cfg.Channels.Mattermost) }},
		{"Webhook", cfg.Channels.Webhook.Enabled, func() Channel { return NewWebhookChannel(cfg.Channels.Webhook) }},
		{"Email", cfg.Channels.Email.Enabled, func() Channel { return NewEmailChannel(cfg.Channels.Email) }},
		{"Notion", cfg.Channels.Notion.Enabled, func() Channel { return NewNotionChannel(cfg.Channels.Notion) }},
	}

	// Register enabled channels
	for _, f := range factories {
		if f.enabled {
			m.channels = append(m.channels, f.create())
			log.Printf("Alerter: %s channel enabled", f.name)
		}
	}

	// Register plugin channels
	for _, pluginCfg := range cfg.Channels.Plugins {
		if pluginCfg.Enabled {
			m.channels = append(m.channels, NewPluginChannel(pluginCfg))
			log.Printf("Alerter: Plugin channel '%s' enabled", pluginCfg.Name)
		}
	}
}

// UpdateConfig updates the alerter configuration
func (m *Manager) UpdateConfig(cfg *config.AlertingConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.cfg = cfg
	m.initChannels(cfg)
	log.Printf("Alerter: configuration updated, %d rules, %d channels", len(cfg.Rules), len(m.channels))
}

// Check evaluates metrics against alert rules
func (m *Manager) Check(metrics *models.PoolMetrics) {
	m.mu.RLock()
	cfg := m.cfg
	dbRules := m.dbRules
	m.mu.RUnlock()

	if cfg == nil || !cfg.Enabled {
		return
	}

	// Check if target is in a maintenance window
	inMaintenance, err := m.store.IsInMaintenanceWindow(metrics.TargetName)
	if err != nil {
		log.Printf("Alerter: error checking maintenance window: %v", err)
	}
	if inMaintenance {
		// Skip alert processing during maintenance
		log.Printf("Alerter: skipping alert check for %s (in maintenance window)", metrics.TargetName)
		return
	}

	ctx := NewRuleContext(metrics)

	// Evaluate config-based rules
	for _, rule := range cfg.Rules {
		m.evaluateRule(&rule, ctx)
	}

	// Evaluate database rules
	for _, dbRule := range dbRules {
		if dbRule.Enabled {
			configRule := &config.AlertRule{
				Name:      dbRule.Name,
				Condition: dbRule.Condition,
				Severity:  dbRule.Severity,
				Message:   dbRule.Message,
				Enabled:   &dbRule.Enabled,
			}
			m.evaluateRule(configRule, ctx)
		}
	}

	// Also check for resolved alerts
	m.checkResolutions(ctx)
}

// evaluateRule evaluates a single rule
func (m *Manager) evaluateRule(rule *config.AlertRule, ctx *RuleContext) {
	triggered, err := EvaluateRule(rule, ctx)
	if err != nil {
		log.Printf("Alerter: rule %s evaluation error: %v", rule.Name, err)
		return
	}

	alertKey := m.alertKey(ctx.TargetName, ctx.InstanceName, rule.Name)

	if triggered {
		// Atomic check-and-set for cooldown to prevent race condition
		now := time.Now()
		m.mu.Lock()
		lastFired, exists := m.lastFired[alertKey]
		cooldown := m.cfg.GetCooldown()
		if exists && now.Sub(lastFired) < cooldown {
			// Still in cooldown period
			m.mu.Unlock()
			return
		}
		// Reserve the cooldown slot immediately to prevent duplicate alerts
		m.lastFired[alertKey] = now
		m.mu.Unlock()

		// Check if there's already an active alert for this rule
		existingAlert, err := m.store.GetActiveAlertByRule(ctx.TargetName, ctx.InstanceName, rule.Name)
		if err != nil {
			log.Printf("Alerter: error checking existing alert: %v", err)
			return
		}

		if existingAlert != nil {
			// Alert already exists, skip
			return
		}

		// Create new alert (cooldown already set above)
		m.fireAlert(rule, ctx, now)
	}
}

// fireAlert creates and sends a new alert
// now parameter is the timestamp when alert was triggered (cooldown already set in evaluateRule)
func (m *Manager) fireAlert(rule *config.AlertRule, ctx *RuleContext, now time.Time) {
	message := RenderMessage(rule.Message, ctx)

	alert := &models.Alert{
		TargetName:   ctx.TargetName,
		InstanceName: ctx.InstanceName,
		RuleName:     rule.Name,
		Severity:     rule.Severity,
		Message:      message,
		Status:       models.AlertStatusFired,
		FiredAt:      now,
	}

	// Save to database
	if err := m.store.SaveAlert(alert); err != nil {
		log.Printf("Alerter: failed to save alert: %v", err)
		return
	}

	// Cooldown already set in evaluateRule atomically

	// Send notifications
	m.sendNotifications(alert)

	// Update notified timestamp
	notifiedAt := time.Now()
	alert.NotifiedAt = &notifiedAt
	alert.Channels = m.getEnabledChannelNames()
	if err := m.store.UpdateAlert(alert); err != nil {
		log.Printf("Alerter: failed to update alert after notification: %v", err)
	}

	log.Printf("Alerter: fired alert %s for %s/%s: %s",
		rule.Name, ctx.TargetName, ctx.InstanceName, message)
}

// checkResolutions checks if any active alerts should be resolved
func (m *Manager) checkResolutions(ctx *RuleContext) {
	m.mu.RLock()
	cfg := m.cfg
	dbRules := m.dbRules
	m.mu.RUnlock()

	if cfg == nil {
		return
	}

	// Check config-based rules
	for _, rule := range cfg.Rules {
		m.checkRuleResolution(&rule, ctx)
	}

	// Check database rules
	for _, dbRule := range dbRules {
		if dbRule.Enabled {
			configRule := &config.AlertRule{
				Name:      dbRule.Name,
				Condition: dbRule.Condition,
				Severity:  dbRule.Severity,
				Message:   dbRule.Message,
				Enabled:   &dbRule.Enabled,
			}
			m.checkRuleResolution(configRule, ctx)
		}
	}
}

// checkRuleResolution checks if a specific rule should be resolved
func (m *Manager) checkRuleResolution(rule *config.AlertRule, ctx *RuleContext) {
	triggered, err := EvaluateRule(rule, ctx)
	if err != nil {
		return
	}

	if !triggered {
		// Rule is not triggered, check if there's an active alert to resolve
		existingAlert, err := m.store.GetActiveAlertByRule(ctx.TargetName, ctx.InstanceName, rule.Name)
		if err != nil {
			return
		}

		if existingAlert != nil {
			m.resolveAlert(existingAlert)
		}
	}
}

// resolveAlert marks an alert as resolved
func (m *Manager) resolveAlert(alert *models.Alert) {
	now := time.Now()
	alert.Status = models.AlertStatusResolved
	alert.ResolvedAt = &now

	if err := m.store.UpdateAlert(alert); err != nil {
		log.Printf("Alerter: failed to update resolved alert: %v", err)
		return
	}

	// Send resolution notifications
	m.sendResolutionNotifications(alert)

	log.Printf("Alerter: resolved alert %s for %s/%s",
		alert.RuleName, alert.TargetName, alert.InstanceName)
}

// sendNotifications sends alert to all enabled channels
func (m *Manager) sendNotifications(alert *models.Alert) {
	m.mu.RLock()
	channels := m.channels
	m.mu.RUnlock()

	for _, ch := range channels {
		if ch.IsEnabled() {
			if err := ch.Send(alert); err != nil {
				log.Printf("Alerter: failed to send to %s: %v", ch.Name(), err)
			}
		}
	}
}

// sendResolutionNotifications sends resolution to all enabled channels
func (m *Manager) sendResolutionNotifications(alert *models.Alert) {
	m.mu.RLock()
	channels := m.channels
	m.mu.RUnlock()

	for _, ch := range channels {
		if ch.IsEnabled() {
			if err := ch.SendResolved(alert); err != nil {
				log.Printf("Alerter: failed to send resolution to %s: %v", ch.Name(), err)
			}
		}
	}
}

// alertKey generates a unique key for cooldown tracking
func (m *Manager) alertKey(target, instance, rule string) string {
	return target + "/" + instance + "/" + rule
}

// getEnabledChannelNames returns comma-separated list of enabled channel names
func (m *Manager) getEnabledChannelNames() string {
	var names []string
	for _, ch := range m.channels {
		if ch.IsEnabled() {
			names = append(names, ch.Name())
		}
	}
	return strings.Join(names, ",")
}

// TestAlertOptions contains options for test alerts
type TestAlertOptions struct {
	Severity string   `json:"severity"` // info, warning, critical
	Channels []string `json:"channels"` // specific channels to test, empty = all
	Message  string   `json:"message"`  // custom message
}

// TestAlert sends a test alert to all enabled channels (legacy)
func (m *Manager) TestAlert() error {
	return m.TestAlertWithOptions(TestAlertOptions{})
}

// TestAlertWithOptions sends a test alert with custom options
func (m *Manager) TestAlertWithOptions(opts TestAlertOptions) error {
	// Default severity
	severity := opts.Severity
	if severity == "" {
		severity = models.SeverityWarning
	}

	// Default message
	message := opts.Message
	if message == "" {
		message = "This is a test alert from Pondy"
	}

	alert := &models.Alert{
		ID:           0,
		TargetName:   "test-target",
		InstanceName: "test-instance",
		RuleName:     "test_alert",
		Severity:     severity,
		Message:      message,
		Status:       models.AlertStatusFired,
		FiredAt:      time.Now(),
	}

	// Send to specific channels or all
	if len(opts.Channels) > 0 {
		m.sendToChannels(alert, opts.Channels)
	} else {
		m.sendNotifications(alert)
	}

	return nil
}

// sendToChannels sends alert to specific channels
func (m *Manager) sendToChannels(alert *models.Alert, channelNames []string) {
	m.mu.RLock()
	channels := m.channels
	m.mu.RUnlock()

	channelSet := make(map[string]bool)
	for _, name := range channelNames {
		channelSet[strings.ToLower(name)] = true
	}

	for _, ch := range channels {
		if channelSet[strings.ToLower(ch.Name())] {
			if err := ch.Send(alert); err != nil {
				log.Printf("Alerter: failed to send to %s: %v", ch.Name(), err)
			}
		}
	}
}

// GetEnabledChannels returns list of enabled channel names
func (m *Manager) GetEnabledChannels() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var names []string
	for _, ch := range m.channels {
		if ch.IsEnabled() {
			names = append(names, ch.Name())
		}
	}
	return names
}

// GetStats returns alert statistics
func (m *Manager) GetStats() (*models.AlertStats, error) {
	return m.store.GetAlertStats()
}

// Stop stops the alert manager
func (m *Manager) Stop() {
	close(m.stop)
}
