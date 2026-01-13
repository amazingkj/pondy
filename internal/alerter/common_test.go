package alerter

import (
	"testing"

	"github.com/jiin/pondy/internal/models"
)

func TestGetEmoji(t *testing.T) {
	tests := []struct {
		severity string
		expected string
	}{
		{"critical", EmojiCritical},
		{"CRITICAL", EmojiCritical},
		{"warning", EmojiWarning},
		{"WARNING", EmojiWarning},
		{"info", EmojiInfo},
		{"INFO", EmojiInfo},
		{"unknown", EmojiInfo},
		{"", EmojiInfo},
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			result := GetEmoji(tt.severity)
			if result != tt.expected {
				t.Errorf("GetEmoji(%s) = %s, want %s", tt.severity, result, tt.expected)
			}
		})
	}
}

func TestGetColorString(t *testing.T) {
	tests := []struct {
		severity string
		expected string
	}{
		{"critical", ColorCritical},
		{"CRITICAL", ColorCritical},
		{"warning", ColorWarning},
		{"WARNING", ColorWarning},
		{"info", ColorInfo},
		{"INFO", ColorInfo},
		{"unknown", ColorInfo},
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			result := GetColorString(tt.severity)
			if result != tt.expected {
				t.Errorf("GetColorString(%s) = %s, want %s", tt.severity, result, tt.expected)
			}
		})
	}
}

func TestGetColorInt(t *testing.T) {
	tests := []struct {
		severity string
		expected int
	}{
		{"critical", 0xE74C3C},
		{"warning", 0xF39C12},
		{"info", 0x3498DB},
		{"unknown", 0x3498DB},
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			result := GetColorInt(tt.severity)
			if result != tt.expected {
				t.Errorf("GetColorInt(%s) = %d, want %d", tt.severity, result, tt.expected)
			}
		})
	}
}

func TestGetSlackColor(t *testing.T) {
	tests := []struct {
		severity string
		expected string
	}{
		{"critical", "danger"},
		{"warning", "warning"},
		{"info", "#3498DB"},
		{"unknown", "#3498DB"},
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			result := GetSlackColor(tt.severity)
			if result != tt.expected {
				t.Errorf("GetSlackColor(%s) = %s, want %s", tt.severity, result, tt.expected)
			}
		})
	}
}

func TestGetUsername(t *testing.T) {
	tests := []struct {
		username string
		expected string
	}{
		{"CustomBot", "CustomBot"},
		{"", DefaultUsername},
	}

	for _, tt := range tests {
		t.Run(tt.username, func(t *testing.T) {
			result := GetUsername(tt.username)
			if result != tt.expected {
				t.Errorf("GetUsername(%s) = %s, want %s", tt.username, result, tt.expected)
			}
		})
	}
}

func TestFormatAlertTitle(t *testing.T) {
	alert := &models.Alert{
		TargetName:   "test-service",
		InstanceName: "default",
		RuleName:     "high_usage",
		Severity:     "critical",
	}

	result := FormatAlertTitle(alert)

	expected := "[CRITICAL] Alert: high_usage"
	if result != expected {
		t.Errorf("FormatAlertTitle() = %s, want %s", result, expected)
	}
}

func TestFormatResolvedTitle(t *testing.T) {
	alert := &models.Alert{
		TargetName:   "test-service",
		InstanceName: "default",
		RuleName:     "high_usage",
	}

	result := FormatResolvedTitle(alert)

	expected := "[RESOLVED] Alert: high_usage"
	if result != expected {
		t.Errorf("FormatResolvedTitle() = %s, want %s", result, expected)
	}
}

func TestNewHTTPClient(t *testing.T) {
	client := NewHTTPClient()

	if client == nil {
		t.Fatal("NewHTTPClient() returned nil")
	}

	if client.Timeout != DefaultHTTPTimeout {
		t.Errorf("client.Timeout = %v, want %v", client.Timeout, DefaultHTTPTimeout)
	}
}

func TestConstants(t *testing.T) {
	// Test that constants are defined correctly
	if DefaultUsername != "Pondy" {
		t.Errorf("DefaultUsername = %s, want Pondy", DefaultUsername)
	}

	if FooterText != "Pondy Alert" {
		t.Errorf("FooterText = %s, want Pondy Alert", FooterText)
	}

	if ColorResolved != "#2ECC71" {
		t.Errorf("ColorResolved = %s, want #2ECC71", ColorResolved)
	}
}
