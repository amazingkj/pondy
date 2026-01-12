package logger

import (
	"io"
	"log/slog"
	"os"
	"strings"
)

// Config holds logger configuration
type Config struct {
	Level  string // debug, info, warn, error
	Format string // json, text
	Output string // stdout, stderr, or file path
}

var defaultLogger *slog.Logger

func init() {
	// Initialize with default logger
	defaultLogger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}

// Init initializes the global logger with the given configuration
func Init(cfg Config) error {
	var level slog.Level
	switch strings.ToLower(cfg.Level) {
	case "debug":
		level = slog.LevelDebug
	case "info":
		level = slog.LevelInfo
	case "warn", "warning":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	var output io.Writer
	switch strings.ToLower(cfg.Output) {
	case "", "stdout":
		output = os.Stdout
	case "stderr":
		output = os.Stderr
	default:
		// File output
		f, err := os.OpenFile(cfg.Output, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return err
		}
		output = f
	}

	opts := &slog.HandlerOptions{
		Level: level,
	}

	var handler slog.Handler
	switch strings.ToLower(cfg.Format) {
	case "json":
		handler = slog.NewJSONHandler(output, opts)
	default:
		handler = slog.NewTextHandler(output, opts)
	}

	defaultLogger = slog.New(handler)
	return nil
}

// Logger returns the default logger
func Logger() *slog.Logger {
	return defaultLogger
}

// Debug logs at debug level
func Debug(msg string, args ...any) {
	defaultLogger.Debug(msg, args...)
}

// Info logs at info level
func Info(msg string, args ...any) {
	defaultLogger.Info(msg, args...)
}

// Warn logs at warn level
func Warn(msg string, args ...any) {
	defaultLogger.Warn(msg, args...)
}

// Error logs at error level
func Error(msg string, args ...any) {
	defaultLogger.Error(msg, args...)
}

// WithFields returns a logger with additional fields
func WithFields(args ...any) *slog.Logger {
	return defaultLogger.With(args...)
}

// WithTarget returns a logger with target name field
func WithTarget(name string) *slog.Logger {
	return defaultLogger.With("target", name)
}

// WithInstance returns a logger with target and instance fields
func WithInstance(target, instance string) *slog.Logger {
	return defaultLogger.With("target", target, "instance", instance)
}
