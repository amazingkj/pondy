package logger

import (
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
)

// Config holds logger configuration
type Config struct {
	Level  string // debug, info, warn, error
	Format string // json, text
	Output string // stdout, stderr, or file path
}

var (
	defaultLogger *slog.Logger
	levelVar      = new(slog.LevelVar)
	currentFormat string
	currentOutput string
	mu            sync.RWMutex
)

func init() {
	// Initialize with default logger
	levelVar.Set(slog.LevelInfo)
	defaultLogger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: levelVar,
	}))
	currentFormat = "text"
	currentOutput = "stdout"
}

// Init initializes the global logger with the given configuration
func Init(cfg Config) error {
	return Update(cfg)
}

// Update updates the logger configuration dynamically
func Update(cfg Config) error {
	mu.Lock()
	defer mu.Unlock()

	// Parse level
	level := parseLevel(cfg.Level)
	levelVar.Set(level)

	// Check if we need to recreate the handler (format or output changed)
	format := strings.ToLower(cfg.Format)
	if format == "" {
		format = "text"
	}
	output := strings.ToLower(cfg.Output)
	if output == "" {
		output = "stdout"
	}

	// Only recreate handler if format or output changed
	if format != currentFormat || output != currentOutput {
		var writer io.Writer
		switch output {
		case "stdout":
			writer = os.Stdout
		case "stderr":
			writer = os.Stderr
		default:
			// File output
			f, err := os.OpenFile(cfg.Output, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
			if err != nil {
				return err
			}
			writer = f
		}

		opts := &slog.HandlerOptions{
			Level: levelVar,
		}

		var handler slog.Handler
		if format == "json" {
			handler = slog.NewJSONHandler(writer, opts)
		} else {
			handler = slog.NewTextHandler(writer, opts)
		}

		defaultLogger = slog.New(handler)
		currentFormat = format
		currentOutput = output
	}

	return nil
}

// SetLevel changes the log level dynamically
func SetLevel(level string) {
	levelVar.Set(parseLevel(level))
}

// GetLevel returns the current log level
func GetLevel() string {
	switch levelVar.Level() {
	case slog.LevelDebug:
		return "debug"
	case slog.LevelInfo:
		return "info"
	case slog.LevelWarn:
		return "warn"
	case slog.LevelError:
		return "error"
	default:
		return "info"
	}
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Logger returns the default logger
func Logger() *slog.Logger {
	mu.RLock()
	defer mu.RUnlock()
	return defaultLogger
}

// Debug logs at debug level
func Debug(msg string, args ...any) {
	mu.RLock()
	l := defaultLogger
	mu.RUnlock()
	l.Debug(msg, args...)
}

// Info logs at info level
func Info(msg string, args ...any) {
	mu.RLock()
	l := defaultLogger
	mu.RUnlock()
	l.Info(msg, args...)
}

// Warn logs at warn level
func Warn(msg string, args ...any) {
	mu.RLock()
	l := defaultLogger
	mu.RUnlock()
	l.Warn(msg, args...)
}

// Error logs at error level
func Error(msg string, args ...any) {
	mu.RLock()
	l := defaultLogger
	mu.RUnlock()
	l.Error(msg, args...)
}

// WithFields returns a logger with additional fields
func WithFields(args ...any) *slog.Logger {
	mu.RLock()
	defer mu.RUnlock()
	return defaultLogger.With(args...)
}

// WithTarget returns a logger with target name field
func WithTarget(name string) *slog.Logger {
	mu.RLock()
	defer mu.RUnlock()
	return defaultLogger.With("target", name)
}

// WithInstance returns a logger with target and instance fields
func WithInstance(target, instance string) *slog.Logger {
	mu.RLock()
	defer mu.RUnlock()
	return defaultLogger.With("target", target, "instance", instance)
}
