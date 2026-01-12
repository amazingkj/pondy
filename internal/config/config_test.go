package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseDurationWithDays(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected time.Duration
		useDefault bool
	}{
		{"days", "7d", 7 * 24 * time.Hour, false},
		{"hours", "24h", 24 * time.Hour, false},
		{"minutes", "30m", 30 * time.Minute, false},
		{"single day", "1d", 24 * time.Hour, false},
		{"empty string", "", 24 * time.Hour, true},
		{"invalid", "invalid", 24 * time.Hour, true},
	}

	defaultVal := 24 * time.Hour
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseDurationWithDays(tt.input, defaultVal)
			if result != tt.expected {
				t.Errorf("parseDurationWithDays(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestRetentionConfig_GetMaxAge(t *testing.T) {
	tests := []struct {
		name     string
		maxAge   string
		expected time.Duration
	}{
		{"7 days", "7d", 7 * 24 * time.Hour},
		{"30 days", "30d", 30 * 24 * time.Hour},
		{"empty uses default", "", 30 * 24 * time.Hour},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := &RetentionConfig{MaxAge: tt.maxAge}
			result := r.GetMaxAge()
			if result != tt.expected {
				t.Errorf("GetMaxAge() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestRetentionConfig_GetCleanupInterval(t *testing.T) {
	tests := []struct {
		name     string
		interval string
		expected time.Duration
	}{
		{"1 hour", "1h", time.Hour},
		{"30 minutes", "30m", 30 * time.Minute},
		{"empty uses default", "", time.Hour},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := &RetentionConfig{CleanupInterval: tt.interval}
			result := r.GetCleanupInterval()
			if result != tt.expected {
				t.Errorf("GetCleanupInterval() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestConfig_GetLocation(t *testing.T) {
	tests := []struct {
		name     string
		timezone string
		expected *time.Location
	}{
		{"UTC", "UTC", time.UTC},
		{"Local", "Local", time.Local},
		{"empty uses Local", "", time.Local},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := &Config{Timezone: tt.timezone}
			result := c.GetLocation()
			if result != tt.expected {
				t.Errorf("GetLocation() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestTargetConfig_GetInstances(t *testing.T) {
	t.Run("with instances", func(t *testing.T) {
		tc := &TargetConfig{
			Name: "test",
			Instances: []InstanceConfig{
				{ID: "inst-1", Endpoint: "http://localhost:8081"},
				{ID: "inst-2", Endpoint: "http://localhost:8082"},
			},
		}
		instances := tc.GetInstances()
		if len(instances) != 2 {
			t.Errorf("expected 2 instances, got %d", len(instances))
		}
	})

	t.Run("backward compatibility with single endpoint", func(t *testing.T) {
		tc := &TargetConfig{
			Name:     "test",
			Endpoint: "http://localhost:8080",
		}
		instances := tc.GetInstances()
		if len(instances) != 1 {
			t.Errorf("expected 1 instance, got %d", len(instances))
		}
		if instances[0].ID != "default" {
			t.Errorf("expected instance ID 'default', got %q", instances[0].ID)
		}
	})

	t.Run("no endpoint returns nil", func(t *testing.T) {
		tc := &TargetConfig{Name: "test"}
		instances := tc.GetInstances()
		if instances != nil {
			t.Errorf("expected nil, got %v", instances)
		}
	})
}

func TestLoad(t *testing.T) {
	// Create a temporary config file
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")

	configContent := `
server:
  port: 9090
storage:
  path: ./test.db
timezone: UTC
targets:
  - name: test-service
    type: actuator
    endpoint: http://localhost:8080/actuator/metrics
    interval: 10s
    group: test
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	cfg, err := Load(configPath)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Server.Port != 9090 {
		t.Errorf("expected port 9090, got %d", cfg.Server.Port)
	}

	if cfg.Timezone != "UTC" {
		t.Errorf("expected timezone UTC, got %s", cfg.Timezone)
	}

	if len(cfg.Targets) != 1 {
		t.Errorf("expected 1 target, got %d", len(cfg.Targets))
	}

	if cfg.Targets[0].Group != "test" {
		t.Errorf("expected group 'test', got %s", cfg.Targets[0].Group)
	}
}
