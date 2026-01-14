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

// PluginChannel sends alerts to custom HTTP endpoints
type PluginChannel struct {
	cfg    config.PluginConfig
	client *http.Client
}

// NewPluginChannel creates a new plugin channel
func NewPluginChannel(cfg config.PluginConfig) *PluginChannel {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	return &PluginChannel{
		cfg: cfg,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (p *PluginChannel) Name() string {
	return "plugin:" + p.cfg.Name
}

func (p *PluginChannel) IsEnabled() bool {
	return p.cfg.Enabled && p.cfg.URL != ""
}

// PluginPayload is the standard payload sent to plugin endpoints
type PluginPayload struct {
	Event       string             `json:"event"`        // "alert.fired" or "alert.resolved"
	Alert       PluginAlertData    `json:"alert"`
	Metadata    PluginMetadata     `json:"metadata"`
}

// PluginAlertData contains alert information for plugins
type PluginAlertData struct {
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

// PluginMetadata contains additional context
type PluginMetadata struct {
	Timestamp  time.Time `json:"timestamp"`
	PluginName string    `json:"plugin_name"`
	Version    string    `json:"version"`
}

func (p *PluginChannel) Send(alert *models.Alert) error {
	if !p.IsEnabled() {
		return nil
	}

	payload := p.buildPayload(alert, "alert.fired")
	return p.sendWithRetry(payload)
}

func (p *PluginChannel) SendResolved(alert *models.Alert) error {
	if !p.IsEnabled() {
		return nil
	}

	payload := p.buildPayload(alert, "alert.resolved")
	return p.sendWithRetry(payload)
}

func (p *PluginChannel) buildPayload(alert *models.Alert, event string) PluginPayload {
	return PluginPayload{
		Event: event,
		Alert: PluginAlertData{
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
		Metadata: PluginMetadata{
			Timestamp:  time.Now(),
			PluginName: p.cfg.Name,
			Version:    "1.0",
		},
	}
}

func (p *PluginChannel) sendWithRetry(payload PluginPayload) error {
	retryCount := p.cfg.RetryCount
	if retryCount <= 0 {
		retryCount = 1 // At least one attempt
	}

	retryDelay := p.cfg.RetryDelay
	if retryDelay <= 0 {
		retryDelay = time.Second
	}

	var lastErr error
	for i := 0; i < retryCount; i++ {
		if i > 0 {
			log.Printf("Plugin %s: retry %d/%d after %v", p.cfg.Name, i, retryCount-1, retryDelay)
			time.Sleep(retryDelay)
		}

		err := p.send(payload)
		if err == nil {
			return nil
		}
		lastErr = err
	}

	return lastErr
}

func (p *PluginChannel) send(payload PluginPayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	method := p.cfg.Method
	if method == "" {
		method = "POST"
	}

	req, err := http.NewRequest(method, p.cfg.URL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set default headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Pondy-Alerter/1.0")
	req.Header.Set("X-Pondy-Plugin", p.cfg.Name)

	// Set custom headers
	for key, value := range p.cfg.Headers {
		req.Header.Set(key, value)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Drain body for connection reuse
	if _, err := io.Copy(io.Discard, resp.Body); err != nil {
		log.Printf("Plugin: warning - failed to drain response body: %v", err)
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("plugin endpoint returned status %d", resp.StatusCode)
	}

	return nil
}
