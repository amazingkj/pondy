package config

import (
	"crypto/md5"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server" yaml:"server"`
	Storage   StorageConfig   `mapstructure:"storage" yaml:"storage"`
	Logging   LoggingConfig   `mapstructure:"logging" yaml:"logging,omitempty"`
	Retention RetentionConfig `mapstructure:"retention" yaml:"retention,omitempty"`
	Alerting  AlertingConfig  `mapstructure:"alerting" yaml:"alerting,omitempty"`
	Targets   []TargetConfig  `mapstructure:"targets" yaml:"targets"`
	Timezone  string          `mapstructure:"timezone" yaml:"timezone,omitempty"` // e.g., "Asia/Seoul", "UTC", "Local"
}

// LoggingConfig holds logging configuration
type LoggingConfig struct {
	Level  string `mapstructure:"level" yaml:"level,omitempty"`   // debug, info, warn, error (default: info)
	Format string `mapstructure:"format" yaml:"format,omitempty"` // text, json (default: text)
}

type RetentionConfig struct {
	MaxAge          string `mapstructure:"max_age" yaml:"max_age,omitempty"`
	CleanupInterval string `mapstructure:"cleanup_interval" yaml:"cleanup_interval,omitempty"`
}

func (r *RetentionConfig) GetMaxAge() time.Duration {
	return parseDurationWithDays(r.MaxAge, 30*24*time.Hour)
}

func (r *RetentionConfig) GetCleanupInterval() time.Duration {
	return parseDurationWithDays(r.CleanupInterval, time.Hour)
}

// AlertingConfig holds alerting configuration
type AlertingConfig struct {
	Enabled       bool           `mapstructure:"enabled" yaml:"enabled"`
	CheckInterval time.Duration  `mapstructure:"check_interval" yaml:"check_interval,omitempty"`
	Cooldown      time.Duration  `mapstructure:"cooldown" yaml:"cooldown,omitempty"`
	Rules         []AlertRule    `mapstructure:"rules" yaml:"rules,omitempty"`
	Channels      ChannelsConfig `mapstructure:"channels" yaml:"channels,omitempty"`
}

// GetCheckInterval returns the check interval with default
func (a *AlertingConfig) GetCheckInterval() time.Duration {
	if a.CheckInterval <= 0 {
		return 30 * time.Second
	}
	return a.CheckInterval
}

// GetCooldown returns the cooldown with default
func (a *AlertingConfig) GetCooldown() time.Duration {
	if a.Cooldown <= 0 {
		return 5 * time.Minute
	}
	return a.Cooldown
}

// AlertRule defines an alerting rule
type AlertRule struct {
	Name      string `mapstructure:"name" yaml:"name"`
	Condition string `mapstructure:"condition" yaml:"condition"` // e.g., "usage > 80", "pending > 5"
	Severity  string `mapstructure:"severity" yaml:"severity"`   // info, warning, critical
	Message   string `mapstructure:"message" yaml:"message,omitempty"` // Template message
	Enabled   *bool  `mapstructure:"enabled" yaml:"enabled,omitempty"` // Default true if nil
}

// IsEnabled returns whether the rule is enabled
func (r *AlertRule) IsEnabled() bool {
	if r.Enabled == nil {
		return true
	}
	return *r.Enabled
}

// ChannelsConfig holds all notification channel configurations
type ChannelsConfig struct {
	Slack      SlackConfig      `mapstructure:"slack" yaml:"slack,omitempty"`
	Discord    DiscordConfig    `mapstructure:"discord" yaml:"discord,omitempty"`
	Mattermost MattermostConfig `mapstructure:"mattermost" yaml:"mattermost,omitempty"`
	Webhook    WebhookConfig    `mapstructure:"webhook" yaml:"webhook,omitempty"`
	Email      EmailConfig      `mapstructure:"email" yaml:"email,omitempty"`
	Notion     NotionConfig     `mapstructure:"notion" yaml:"notion,omitempty"`
	Plugins    []PluginConfig   `mapstructure:"plugins" yaml:"plugins,omitempty"`
}

// SlackConfig holds Slack notification settings
type SlackConfig struct {
	Enabled    bool   `mapstructure:"enabled" yaml:"enabled"`
	WebhookURL string `mapstructure:"webhook_url" yaml:"webhook_url,omitempty"`
	Channel    string `mapstructure:"channel" yaml:"channel,omitempty"`
	Username   string `mapstructure:"username" yaml:"username,omitempty"`
}

// DiscordConfig holds Discord notification settings
type DiscordConfig struct {
	Enabled    bool   `mapstructure:"enabled" yaml:"enabled"`
	WebhookURL string `mapstructure:"webhook_url" yaml:"webhook_url,omitempty"`
}

// MattermostConfig holds Mattermost notification settings
type MattermostConfig struct {
	Enabled    bool   `mapstructure:"enabled" yaml:"enabled"`
	WebhookURL string `mapstructure:"webhook_url" yaml:"webhook_url,omitempty"`
	Channel    string `mapstructure:"channel" yaml:"channel,omitempty"`
	Username   string `mapstructure:"username" yaml:"username,omitempty"`
}

// WebhookConfig holds generic webhook notification settings
type WebhookConfig struct {
	Enabled bool              `mapstructure:"enabled" yaml:"enabled"`
	URL     string            `mapstructure:"url" yaml:"url,omitempty"`
	Method  string            `mapstructure:"method" yaml:"method,omitempty"`
	Headers map[string]string `mapstructure:"headers" yaml:"headers,omitempty"`
}

// EmailConfig holds email notification settings
type EmailConfig struct {
	Enabled  bool     `mapstructure:"enabled" yaml:"enabled"`
	SMTPHost string   `mapstructure:"smtp_host" yaml:"smtp_host,omitempty"`
	SMTPPort int      `mapstructure:"smtp_port" yaml:"smtp_port,omitempty"`
	Username string   `mapstructure:"username" yaml:"username,omitempty"`
	Password string   `mapstructure:"password" yaml:"password,omitempty"`
	From     string   `mapstructure:"from" yaml:"from,omitempty"`
	To       []string `mapstructure:"to" yaml:"to,omitempty"`
	UseTLS   bool     `mapstructure:"use_tls" yaml:"use_tls,omitempty"`
}

// NotionConfig holds Notion notification settings
type NotionConfig struct {
	Enabled    bool   `mapstructure:"enabled" yaml:"enabled"`
	Token      string `mapstructure:"token" yaml:"token,omitempty"`             // Notion integration token
	DatabaseID string `mapstructure:"database_id" yaml:"database_id,omitempty"` // Notion database ID
}

// PluginConfig holds HTTP plugin settings
type PluginConfig struct {
	Name       string            `mapstructure:"name" yaml:"name"`
	Enabled    bool              `mapstructure:"enabled" yaml:"enabled"`
	URL        string            `mapstructure:"url" yaml:"url,omitempty"`               // HTTP endpoint to call
	Method     string            `mapstructure:"method" yaml:"method,omitempty"`         // HTTP method (POST, PUT, etc.)
	Headers    map[string]string `mapstructure:"headers" yaml:"headers,omitempty"`       // Custom headers
	Timeout    time.Duration     `mapstructure:"timeout" yaml:"timeout,omitempty"`       // Request timeout
	RetryCount int               `mapstructure:"retry_count" yaml:"retry_count,omitempty"` // Number of retries
	RetryDelay time.Duration     `mapstructure:"retry_delay" yaml:"retry_delay,omitempty"` // Delay between retries
}

// GetLocation returns the time.Location for the configured timezone
func (c *Config) GetLocation() *time.Location {
	if c.Timezone == "" || c.Timezone == "Local" {
		return time.Local
	}
	if c.Timezone == "UTC" {
		return time.UTC
	}
	loc, err := time.LoadLocation(c.Timezone)
	if err != nil {
		log.Printf("Invalid timezone %s, using Local: %v", c.Timezone, err)
		return time.Local
	}
	return loc
}

func parseDurationWithDays(s string, defaultVal time.Duration) time.Duration {
	if s == "" {
		return defaultVal
	}
	// Handle "d" suffix for days
	if len(s) > 1 && s[len(s)-1] == 'd' {
		var days int
		if _, err := fmt.Sscanf(s, "%dd", &days); err == nil {
			return time.Duration(days) * 24 * time.Hour
		}
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return defaultVal
	}
	return d
}

type ServerConfig struct {
	Port int `mapstructure:"port" yaml:"port"`
}

type StorageConfig struct {
	Path string `mapstructure:"path" yaml:"path"`
}

type TargetConfig struct {
	Name      string           `mapstructure:"name" yaml:"name"`
	Type      string           `mapstructure:"type" yaml:"type"`
	Endpoint  string           `mapstructure:"endpoint" yaml:"endpoint,omitempty"`
	Interval  time.Duration    `mapstructure:"interval" yaml:"interval"`
	Group     string           `mapstructure:"group" yaml:"group,omitempty"` // Environment group: dev, staging, prod, etc.
	Instances []InstanceConfig `mapstructure:"instances" yaml:"instances,omitempty"`
}

type InstanceConfig struct {
	ID       string `mapstructure:"id" yaml:"id"`
	Endpoint string `mapstructure:"endpoint" yaml:"endpoint"`
}

// GetInstances returns instances for this target (backward compatible)
func (t *TargetConfig) GetInstances() []InstanceConfig {
	if len(t.Instances) > 0 {
		return t.Instances
	}
	// Backward compatibility: single endpoint becomes "default" instance
	if t.Endpoint != "" {
		return []InstanceConfig{{ID: "default", Endpoint: t.Endpoint}}
	}
	return nil
}

// Manager handles configuration with hot reload support
type Manager struct {
	mu           sync.RWMutex
	config       *Config
	callbacks    []func(*Config)
	configPath   string
	lastHash     string
	pollInterval time.Duration
	stopPolling  chan struct{}
}

// NewManager creates a new config manager with hot reload
func NewManager(path string) (*Manager, error) {
	viper.SetConfigFile(path)
	viper.SetConfigType("yaml")

	viper.SetDefault("server.port", 8080)
	viper.SetDefault("storage.path", "./data/pondy.db")
	viper.SetDefault("logging.level", "info")
	viper.SetDefault("logging.format", "text")

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	// Calculate initial hash
	initialHash, _ := fileHash(path)

	m := &Manager{
		config:       &cfg,
		callbacks:    make([]func(*Config), 0),
		configPath:   path,
		lastHash:     initialHash,
		pollInterval: 5 * time.Second, // Poll every 5 seconds
		stopPolling:  make(chan struct{}),
	}

	// Watch for config changes (fsnotify - works on native filesystems)
	viper.OnConfigChange(func(e fsnotify.Event) {
		log.Printf("Config file changed (fsnotify): %s", e.Name)
		m.reload()
		m.updateHash()
	})
	viper.WatchConfig()

	// Start polling for Docker/mounted volume environments
	go m.pollForChanges()

	log.Printf("Config hot-reload enabled (fsnotify + polling every %v)", m.pollInterval)

	return m, nil
}

// fileHash calculates MD5 hash of a file
func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// pollForChanges polls the config file for changes (Docker-friendly)
func (m *Manager) pollForChanges() {
	ticker := time.NewTicker(m.pollInterval)
	defer ticker.Stop()

	log.Printf("Config polling started (interval: %v)", m.pollInterval)

	for {
		select {
		case <-ticker.C:
			currentHash, err := fileHash(m.configPath)
			if err != nil {
				log.Printf("Config polling: failed to hash file: %v", err)
				continue
			}

			m.mu.RLock()
			lastHash := m.lastHash
			m.mu.RUnlock()

			if currentHash != lastHash {
				log.Printf("Config file changed (polling detected): hash %s -> %s", lastHash[:8], currentHash[:8])
				m.reload()
				m.updateHash()
			}
		case <-m.stopPolling:
			log.Printf("Config polling stopped")
			return
		}
	}
}

// updateHash updates the stored file hash
func (m *Manager) updateHash() {
	hash, err := fileHash(m.configPath)
	if err != nil {
		return
	}
	m.mu.Lock()
	m.lastHash = hash
	m.mu.Unlock()
}

// Stop stops the config manager polling
func (m *Manager) Stop() {
	close(m.stopPolling)
}

// Get returns the current configuration
func (m *Manager) Get() *Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.config
}

// OnReload registers a callback for config changes
func (m *Manager) OnReload(callback func(*Config)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callbacks = append(m.callbacks, callback)
}

func (m *Manager) reload() {
	log.Printf("Config reload triggered, re-reading file: %s", m.configPath)

	// Re-read config file first (viper caches values)
	if err := viper.ReadInConfig(); err != nil {
		log.Printf("Failed to re-read config file: %v", err)
		return
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		log.Printf("Failed to unmarshal config: %v", err)
		return
	}

	// Log target details for debugging
	var targetNames []string
	for _, t := range cfg.Targets {
		targetNames = append(targetNames, t.Name)
	}
	log.Printf("Config reloaded: %d targets: %v", len(cfg.Targets), targetNames)

	m.mu.Lock()
	m.config = &cfg
	callbacks := m.callbacks
	m.mu.Unlock()

	// Notify callbacks
	log.Printf("Notifying %d config reload callbacks", len(callbacks))
	for _, cb := range callbacks {
		cb(&cfg)
	}
}

// Load is kept for backward compatibility
func Load(path string) (*Config, error) {
	viper.SetConfigFile(path)
	viper.SetConfigType("yaml")

	viper.SetDefault("server.port", 8080)
	viper.SetDefault("storage.path", "./data/pondy.db")
	viper.SetDefault("logging.level", "info")
	viper.SetDefault("logging.format", "text")

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// SaveConfig saves the current configuration to file
func (m *Manager) SaveConfig() error {
	m.mu.RLock()
	cfg := m.config
	callbacks := m.callbacks
	m.mu.RUnlock()

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(m.configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	// Update hash to prevent duplicate reload from file watcher
	m.updateHash()

	log.Printf("Config saved to %s", m.configPath)

	// Immediately notify callbacks about the config change
	// (file watcher won't trigger because hash was updated)
	log.Printf("Notifying %d config callbacks after save", len(callbacks))
	for _, cb := range callbacks {
		cb(cfg)
	}

	return nil
}

// AddTarget adds a new target to the configuration
func (m *Manager) AddTarget(target TargetConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check for duplicate name
	for _, t := range m.config.Targets {
		if t.Name == target.Name {
			return fmt.Errorf("target with name '%s' already exists", target.Name)
		}
	}

	m.config.Targets = append(m.config.Targets, target)
	return nil
}

// UpdateTarget updates an existing target
func (m *Manager) UpdateTarget(name string, target TargetConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, t := range m.config.Targets {
		if t.Name == name {
			// If name changed, check for duplicates
			if target.Name != name {
				for _, other := range m.config.Targets {
					if other.Name == target.Name {
						return fmt.Errorf("target with name '%s' already exists", target.Name)
					}
				}
			}
			m.config.Targets[i] = target
			return nil
		}
	}

	return fmt.Errorf("target '%s' not found", name)
}

// DeleteTarget removes a target from the configuration
func (m *Manager) DeleteTarget(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, t := range m.config.Targets {
		if t.Name == name {
			m.config.Targets = append(m.config.Targets[:i], m.config.Targets[i+1:]...)
			return nil
		}
	}

	return fmt.Errorf("target '%s' not found", name)
}

// GetTarget returns a target by name
func (m *Manager) GetTarget(name string) (*TargetConfig, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, t := range m.config.Targets {
		if t.Name == name {
			return &t, nil
		}
	}

	return nil, fmt.Errorf("target '%s' not found", name)
}

// GetAllTargets returns all targets
func (m *Manager) GetAllTargets() []TargetConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]TargetConfig, len(m.config.Targets))
	copy(result, m.config.Targets)
	return result
}
