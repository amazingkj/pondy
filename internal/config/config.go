package config

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Storage   StorageConfig   `mapstructure:"storage"`
	Retention RetentionConfig `mapstructure:"retention"`
	Targets   []TargetConfig  `mapstructure:"targets"`
	Timezone  string          `mapstructure:"timezone"` // e.g., "Asia/Seoul", "UTC", "Local"
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
	mu        sync.RWMutex
	config    *Config
	callbacks []func(*Config)
}

// NewManager creates a new config manager with hot reload
func NewManager(path string) (*Manager, error) {
	viper.SetConfigFile(path)
	viper.SetConfigType("yaml")

	viper.SetDefault("server.port", 8080)
	viper.SetDefault("storage.path", "./data/pondy.db")

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	m := &Manager{
		config:    &cfg,
		callbacks: make([]func(*Config), 0),
	}

	// Watch for config changes
	viper.OnConfigChange(func(e fsnotify.Event) {
		log.Printf("Config file changed: %s", e.Name)
		m.reload()
	})
	viper.WatchConfig()

	return m, nil
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

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
