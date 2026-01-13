package alerter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
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
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}
