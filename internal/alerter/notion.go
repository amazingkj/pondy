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

// NotionChannel sends alerts to Notion database
type NotionChannel struct {
	cfg    config.NotionConfig
	client *http.Client
}

// NewNotionChannel creates a new Notion channel
func NewNotionChannel(cfg config.NotionConfig) *NotionChannel {
	return &NotionChannel{
		cfg: cfg,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (n *NotionChannel) Name() string {
	return "notion"
}

func (n *NotionChannel) IsEnabled() bool {
	return n.cfg.Enabled && n.cfg.Token != "" && n.cfg.DatabaseID != ""
}

func (n *NotionChannel) Send(alert *models.Alert) error {
	if !n.IsEnabled() {
		return nil
	}

	page := n.buildPage(alert, false)
	return n.createPage(page)
}

func (n *NotionChannel) SendResolved(alert *models.Alert) error {
	if !n.IsEnabled() {
		return nil
	}

	page := n.buildPage(alert, true)
	return n.createPage(page)
}

// NotionPage represents a Notion page creation request
type NotionPage struct {
	Parent     NotionParent              `json:"parent"`
	Icon       *NotionIcon               `json:"icon,omitempty"`
	Properties map[string]NotionProperty `json:"properties"`
}

type NotionParent struct {
	DatabaseID string `json:"database_id"`
}

type NotionIcon struct {
	Type  string `json:"type"`
	Emoji string `json:"emoji"`
}

type NotionProperty struct {
	Title    []NotionRichText `json:"title,omitempty"`
	RichText []NotionRichText `json:"rich_text,omitempty"`
	Select   *NotionSelect    `json:"select,omitempty"`
	Date     *NotionDate      `json:"date,omitempty"`
}

type NotionRichText struct {
	Type string          `json:"type"`
	Text NotionTextValue `json:"text"`
}

type NotionTextValue struct {
	Content string `json:"content"`
}

type NotionSelect struct {
	Name string `json:"name"`
}

type NotionDate struct {
	Start string `json:"start"`
}

func (n *NotionChannel) buildPage(alert *models.Alert, resolved bool) NotionPage {
	var emoji string
	var statusName string

	if resolved {
		emoji = "✅"
		statusName = "Resolved"
	} else {
		switch alert.Severity {
		case models.SeverityCritical:
			emoji = "🚨"
		case models.SeverityWarning:
			emoji = "⚠️"
		default:
			emoji = "ℹ️"
		}
		statusName = "Fired"
	}

	title := fmt.Sprintf("[%s] %s - %s", alert.Severity, alert.RuleName, alert.TargetName)
	if resolved {
		title = fmt.Sprintf("[RESOLVED] %s - %s", alert.RuleName, alert.TargetName)
	}

	page := NotionPage{
		Parent: NotionParent{
			DatabaseID: n.cfg.DatabaseID,
		},
		Icon: &NotionIcon{
			Type:  "emoji",
			Emoji: emoji,
		},
		Properties: map[string]NotionProperty{
			"Name": {
				Title: []NotionRichText{
					{Type: "text", Text: NotionTextValue{Content: title}},
				},
			},
			"Message": {
				RichText: []NotionRichText{
					{Type: "text", Text: NotionTextValue{Content: alert.Message}},
				},
			},
			"Target": {
				RichText: []NotionRichText{
					{Type: "text", Text: NotionTextValue{Content: alert.TargetName}},
				},
			},
			"Instance": {
				RichText: []NotionRichText{
					{Type: "text", Text: NotionTextValue{Content: alert.InstanceName}},
				},
			},
			"Severity": {
				Select: &NotionSelect{Name: alert.Severity},
			},
			"Status": {
				Select: &NotionSelect{Name: statusName},
			},
			"Rule": {
				RichText: []NotionRichText{
					{Type: "text", Text: NotionTextValue{Content: alert.RuleName}},
				},
			},
			"Fired At": {
				Date: &NotionDate{Start: alert.FiredAt.Format(time.RFC3339)},
			},
		},
	}

	if resolved && alert.ResolvedAt != nil {
		page.Properties["Resolved At"] = NotionProperty{
			Date: &NotionDate{Start: alert.ResolvedAt.Format(time.RFC3339)},
		}
	}

	return page
}

func (n *NotionChannel) createPage(page NotionPage) error {
	body, err := json.Marshal(page)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", "https://api.notion.com/v1/pages", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+n.cfg.Token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Notion-Version", "2022-06-28")

	resp, err := n.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("notion API returned status %d", resp.StatusCode)
	}

	return nil
}
