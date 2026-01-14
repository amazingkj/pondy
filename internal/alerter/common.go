package alerter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/jiin/pondy/internal/models"
)

// Email validation regex - basic RFC 5322 pattern
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// Common constants for alert channels
const (
	DefaultHTTPTimeout = 10 * time.Second
	DefaultUsername    = "Pondy"
	FooterText         = "Pondy Alert"
)

// Emojis for different severity levels
const (
	EmojiCritical = "🚨"
	EmojiWarning  = "⚠️"
	EmojiInfo     = "ℹ️"
	EmojiResolved = "✅"
)

// Severity colors (hex strings for Slack/Mattermost)
const (
	ColorCritical = "#E74C3C"
	ColorWarning  = "#F39C12"
	ColorInfo     = "#3498DB"
	ColorResolved = "#2ECC71"
)

// Severity colors (int for Discord)
const (
	ColorCriticalInt = 0xE74C3C
	ColorWarningInt  = 0xF39C12
	ColorInfoInt     = 0x3498DB
	ColorResolvedInt = 0x2ECC71
)

// GetEmoji returns an emoji based on severity
func GetEmoji(severity string) string {
	switch severity {
	case models.SeverityCritical:
		return EmojiCritical
	case models.SeverityWarning:
		return EmojiWarning
	default:
		return EmojiInfo
	}
}

// GetColorString returns a hex color string based on severity
func GetColorString(severity string) string {
	switch severity {
	case models.SeverityCritical:
		return ColorCritical
	case models.SeverityWarning:
		return ColorWarning
	default:
		return ColorInfo
	}
}

// GetColorInt returns an int color for Discord based on severity
func GetColorInt(severity string) int {
	switch severity {
	case models.SeverityCritical:
		return ColorCriticalInt
	case models.SeverityWarning:
		return ColorWarningInt
	default:
		return ColorInfoInt
	}
}

// GetSlackColor returns Slack-specific color names
func GetSlackColor(severity string) string {
	switch severity {
	case models.SeverityCritical:
		return "danger"
	case models.SeverityWarning:
		return "warning"
	default:
		return ColorInfo
	}
}

// NewHTTPClient creates a standard HTTP client for alert channels
func NewHTTPClient() *http.Client {
	return &http.Client{
		Timeout: DefaultHTTPTimeout,
	}
}

// PostJSON sends a JSON payload to a URL
func PostJSON(client *http.Client, url string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Drain body for connection reuse
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	return nil
}

// GetUsername returns the provided username or the default
func GetUsername(username string) string {
	if username != "" {
		return username
	}
	return DefaultUsername
}

// FormatAlertTitle formats an alert title with emoji
func FormatAlertTitle(alert *models.Alert) string {
	return fmt.Sprintf("%s Alert: %s", GetEmoji(alert.Severity), alert.RuleName)
}

// FormatResolvedTitle formats a resolved alert title
func FormatResolvedTitle(alert *models.Alert) string {
	return fmt.Sprintf("✅ Resolved: %s", alert.RuleName)
}

// ValidateEmail validates an email address format
func ValidateEmail(email string) bool {
	return emailRegex.MatchString(email)
}

// ValidateEmails validates a list of email addresses
// Returns invalid emails and true if all are valid
func ValidateEmails(emails []string) ([]string, bool) {
	var invalid []string
	for _, email := range emails {
		if !ValidateEmail(email) {
			invalid = append(invalid, email)
		}
	}
	return invalid, len(invalid) == 0
}
