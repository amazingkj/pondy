package alerter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
)

const (
	webhookMaxRetries   = 3
	webhookRetryDelay   = 2 * time.Second
	webhookRetryBackoff = 2 // exponential backoff multiplier
)

// WebhookChannel sends alerts via generic HTTP webhook
type WebhookChannel struct {
	cfg    config.WebhookConfig
	client *http.Client
}

// NewWebhookChannel creates a new webhook channel
func NewWebhookChannel(cfg config.WebhookConfig) *WebhookChannel {
	return &WebhookChannel{
		cfg: cfg,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (w *WebhookChannel) Name() string {
	return "webhook"
}

func (w *WebhookChannel) IsEnabled() bool {
	return w.cfg.Enabled && w.cfg.URL != ""
}

// WebhookPayload is the JSON payload sent to webhooks
type WebhookPayload struct {
	Event        string    `json:"event"` // "alert_fired" or "alert_resolved"
	Alert        AlertData `json:"alert"`
	Timestamp    time.Time `json:"timestamp"`
	PondyVersion string    `json:"pondy_version"`
}

// AlertData is the alert data in the payload
type AlertData struct {
	ID           int64      `json:"id"`
	TargetName   string     `json:"target_name"`
	InstanceName string     `json:"instance_name"`
	RuleName     string     `json:"rule_name"`
	Severity     string     `json:"severity"`
	Message      string     `json:"message"`
	Status       string     `json:"status"`
	FiredAt      time.Time  `json:"fired_at"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
}

func (w *WebhookChannel) Send(alert *models.Alert) error {
	return w.sendPayload("alert_fired", alert)
}

func (w *WebhookChannel) SendResolved(alert *models.Alert) error {
	return w.sendPayload("alert_resolved", alert)
}

func (w *WebhookChannel) sendPayload(event string, alert *models.Alert) error {
	if !w.IsEnabled() {
		return nil
	}

	payload := WebhookPayload{
		Event: event,
		Alert: AlertData{
			ID:           alert.ID,
			TargetName:   alert.TargetName,
			InstanceName: alert.InstanceName,
			RuleName:     alert.RuleName,
			Severity:     alert.Severity,
			Message:      alert.Message,
			Status:       alert.Status,
			FiredAt:      alert.FiredAt,
			ResolvedAt:   alert.ResolvedAt,
		},
		Timestamp:    time.Now(),
		PondyVersion: "0.3.0",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	method := w.cfg.Method
	if method == "" {
		method = "POST"
	}

	// Retry with exponential backoff
	var lastErr error
	delay := webhookRetryDelay

	for attempt := 1; attempt <= webhookMaxRetries; attempt++ {
		req, err := http.NewRequest(method, w.cfg.URL, bytes.NewReader(body))
		if err != nil {
			return err
		}

		// Set default content type
		req.Header.Set("Content-Type", "application/json")

		// Set custom headers
		for key, value := range w.cfg.Headers {
			req.Header.Set(key, value)
		}

		resp, err := w.client.Do(req)
		if err != nil {
			lastErr = err
			if attempt < webhookMaxRetries {
				log.Printf("Webhook: attempt %d/%d failed: %v, retrying in %v", attempt, webhookMaxRetries, err, delay)
				time.Sleep(delay)
				delay *= webhookRetryBackoff
			}
			continue
		}

		// Helper to drain and close response body for connection reuse
		drainAndClose := func() {
			if _, err := io.Copy(io.Discard, resp.Body); err != nil {
				log.Printf("Warning: failed to drain response body: %v", err)
			}
			resp.Body.Close()
		}

		if resp.StatusCode >= 500 {
			// Server error - drain body before retry
			drainAndClose()
			lastErr = fmt.Errorf("webhook returned status %d", resp.StatusCode)
			if attempt < webhookMaxRetries {
				log.Printf("Webhook: attempt %d/%d failed with status %d, retrying in %v", attempt, webhookMaxRetries, resp.StatusCode, delay)
				time.Sleep(delay)
				delay *= webhookRetryBackoff
			}
			continue
		}

		if resp.StatusCode >= 400 {
			// Client error - don't retry
			drainAndClose()
			return fmt.Errorf("webhook returned status %d", resp.StatusCode)
		}

		// Success - drain body for connection reuse
		drainAndClose()
		return nil
	}

	return fmt.Errorf("webhook failed after %d attempts: %w", webhookMaxRetries, lastErr)
}
