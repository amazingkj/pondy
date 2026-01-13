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
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Storage   StorageConfig   `mapstructure:"storage"`
	Logging   LoggingConfig   `mapstructure:"logging"`
	Retention RetentionConfig `mapstructure:"retention"`
	Alerting  AlertingConfig  `mapstructure:"alerting"`
	Targets   []TargetConfig  `mapstructure:"targets"`
	Timezone  string          `mapstructure:"timezone"` // e.g., "Asia/Seoul", "UTC", "Local"
}

// LoggingConfig holds logging configuration
type LoggingConfig struct {
	Level  string `mapstructure:"level"`  // debug, info, warn, error (default: info)
	Format string `mapstructure:"format"` // text, json (default: text)
}

type RetentionConfig struct {
	MaxAge          string `mapstructure:"max_age"`
	CleanupInterval string `mapstructure:"cleanup_interval"`
}

func (r *RetentionConfig) GetMaxAge() time.Duration {
	return parseDurationWithDays(r.MaxAge, 30*24*time.Hour)
}

func (r *RetentionConfig) GetCleanupInterval() time.Duration {
	return parseDurationWithDays(r.CleanupInterval, time.Hour)
}

// AlertingConfig holds alerting configuration
type AlertingConfig struct {
	Enabled       bool            `mapstructure:"enabled"`
	CheckInterval time.Duration   `mapstructure:"check_interval"`
	Cooldown      time.Duration   `mapstructure:"cooldown"`
	Rules         []AlertRule     `mapstructure:"rules"`
	Channels      ChannelsConfig  `mapstructure:"channels"`
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
	Name      string `mapstructure:"name"`
	Condition string `mapstructure:"condition"` // e.g., "usage > 80", "pending > 5"
	Severity  string `mapstructure:"severity"`  // info, warning, critical
	Message   string `mapstructure:"message"`   // Template message
	Enabled   *bool  `mapstructure:"enabled"`   // Default true if nil
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
	Slack      SlackConfig      `mapstructure:"slack"`
	Discord    DiscordConfig    `mapstructure:"discord"`
	Mattermost MattermostConfig `mapstructure:"mattermost"`
	Webhook    WebhookConfig    `mapstructure:"webhook"`
	Email      EmailConfig      `mapstructure:"email"`
	Notion     NotionConfig     `mapstructure:"notion"`
	Plugins    []PluginConfig   `mapstructure:"plugins"`
}

// SlackConfig holds Slack notification settings
type SlackConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	WebhookURL string `mapstructure:"webhook_url"`
	Channel    string `mapstructure:"channel"`
	Username   string `mapstructure:"username"`
}

// DiscordConfig holds Discord notification settings
type DiscordConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	WebhookURL string `mapstructure:"webhook_url"`
}

// MattermostConfig holds Mattermost notification settings
type MattermostConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	WebhookURL string `mapstructure:"webhook_url"`
	Channel    string `mapstructure:"channel"`
	Username   string `mapstructure:"username"`
}

// WebhookConfig holds generic webhook notification settings
type WebhookConfig struct {
	Enabled bool              `mapstructure:"enabled"`
	URL     string            `mapstructure:"url"`
	Method  string            `mapstructure:"method"`
	Headers map[string]string `mapstructure:"headers"`
}

// EmailConfig holds email notification settings
type EmailConfig struct {
	Enabled  bool     `mapstructure:"enabled"`
	SMTPHost string   `mapstructure:"smtp_host"`
	SMTPPort int      `mapstructure:"smtp_port"`
	Username string   `mapstructure:"username"`
	Password string   `mapstructure:"password"`
	From     string   `mapstructure:"from"`
	To       []string `mapstructure:"to"`
	UseTLS   bool     `mapstructure:"use_tls"`
}

// NotionConfig holds Notion notification settings
type NotionConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	Token      string `mapstructure:"token"`       // Notion integration token
	DatabaseID string `mapstructure:"database_id"` // Notion database ID
}

// PluginConfig holds HTTP plugin settings
type PluginConfig struct {
	Name        string            `mapstructure:"name"`
	Enabled     bool              `mapstructure:"enabled"`
	URL         string            `mapstructure:"url"`          // HTTP endpoint to call
	Method      string            `mapstructure:"method"`       // HTTP method (POST, PUT, etc.)
	Headers     map[string]string `mapstructure:"headers"`      // Custom headers
	Timeout     time.Duration     `mapstructure:"timeout"`      // Request timeout
	RetryCount  int               `mapstructure:"retry_count"`  // Number of retries
	RetryDelay  time.Duration     `mapstructure:"retry_delay"`  // Delay between retries
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
	Port int `mapstructure:"port"`
}

type StorageConfig struct {
	Path string `mapstructure:"path"`
}

type TargetConfig struct {
	Name      string           `mapstructure:"name"`
	Type      string           `mapstructure:"type"`
	Endpoint  string           `mapstructure:"endpoint"`
	Interval  time.Duration    `mapstructure:"interval"`
	Group     string           `mapstructure:"group"` // Environment group: dev, staging, prod, etc.
	Instances []InstanceConfig `mapstructure:"instances"`
}

type InstanceConfig struct {
	ID       string `mapstructure:"id"`
	Endpoint string `mapstructure:"endpoint"`
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
