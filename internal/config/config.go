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

	for {
		select {
		case <-ticker.C:
			currentHash, err := fileHash(m.configPath)
			if err != nil {
				continue
			}

			m.mu.RLock()
			lastHash := m.lastHash
			m.mu.RUnlock()

			if currentHash != lastHash {
				log.Printf("Config file changed (polling detected)")
				m.reload()
				m.updateHash()
			}
		case <-m.stopPolling:
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
	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		log.Printf("Failed to reload config: %v", err)
		return
	}

	m.mu.Lock()
	m.config = &cfg
	callbacks := m.callbacks
	m.mu.Unlock()

	log.Printf("Config reloaded: %d targets", len(cfg.Targets))

	// Notify callbacks
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
