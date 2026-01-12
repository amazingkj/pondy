package logger

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

func TestInit(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{
			name: "default config",
			cfg:  Config{},
		},
		{
			name: "json format",
			cfg:  Config{Format: "json", Level: "debug"},
		},
		{
			name: "text format with warn level",
			cfg:  Config{Format: "text", Level: "warn"},
		},
		{
			name: "stderr output",
			cfg:  Config{Output: "stderr"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Init(tt.cfg)
			if (err != nil) != tt.wantErr {
				t.Errorf("Init() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestLogLevels(t *testing.T) {
	// Reset to a buffer for testing
	var buf bytes.Buffer
	defaultLogger = slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	// Test each level
	Debug("debug message", "key", "value")
	if !strings.Contains(buf.String(), "debug message") {
		t.Error("Debug message not logged")
	}
	buf.Reset()

	Info("info message", "key", "value")
	if !strings.Contains(buf.String(), "info message") {
		t.Error("Info message not logged")
	}
	buf.Reset()

	Warn("warn message", "key", "value")
	if !strings.Contains(buf.String(), "warn message") {
		t.Error("Warn message not logged")
	}
	buf.Reset()

	Error("error message", "key", "value")
	if !strings.Contains(buf.String(), "error message") {
		t.Error("Error message not logged")
	}
}

func TestWithTarget(t *testing.T) {
	var buf bytes.Buffer
	defaultLogger = slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	logger := WithTarget("test-service")
	logger.Info("test message")

	output := buf.String()
	if !strings.Contains(output, "target=test-service") {
		t.Errorf("expected target field in output, got: %s", output)
	}
}

func TestWithInstance(t *testing.T) {
	var buf bytes.Buffer
	defaultLogger = slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	logger := WithInstance("test-service", "inst-1")
	logger.Info("test message")

	output := buf.String()
	if !strings.Contains(output, "target=test-service") {
		t.Errorf("expected target field in output, got: %s", output)
	}
	if !strings.Contains(output, "instance=inst-1") {
		t.Errorf("expected instance field in output, got: %s", output)
	}
}

func TestWithFields(t *testing.T) {
	var buf bytes.Buffer
	defaultLogger = slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	logger := WithFields("request_id", "abc123", "user", "john")
	logger.Info("custom fields test")

	output := buf.String()
	if !strings.Contains(output, "request_id=abc123") {
		t.Errorf("expected request_id field in output, got: %s", output)
	}
}
