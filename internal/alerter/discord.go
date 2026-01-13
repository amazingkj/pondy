package alerter

import (
	"net/http"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
)

// DiscordChannel sends alerts to Discord
type DiscordChannel struct {
	cfg    config.DiscordConfig
	client *http.Client
}

// NewDiscordChannel creates a new Discord channel
func NewDiscordChannel(cfg config.DiscordConfig) *DiscordChannel {
	return &DiscordChannel{
		cfg:    cfg,
		client: NewHTTPClient(),
	}
}

func (d *DiscordChannel) Name() string {
	return "discord"
}

func (d *DiscordChannel) IsEnabled() bool {
	return d.cfg.Enabled && d.cfg.WebhookURL != ""
}

// DiscordMessage is the Discord webhook payload
type DiscordMessage struct {
	Username  string         `json:"username,omitempty"`
	AvatarURL string         `json:"avatar_url,omitempty"`
	Content   string         `json:"content,omitempty"`
	Embeds    []DiscordEmbed `json:"embeds,omitempty"`
}

// DiscordEmbed is a Discord embed
type DiscordEmbed struct {
	Title       string              `json:"title,omitempty"`
	Description string              `json:"description,omitempty"`
	Color       int                 `json:"color,omitempty"`
	Fields      []DiscordEmbedField `json:"fields,omitempty"`
	Footer      *DiscordEmbedFooter `json:"footer,omitempty"`
	Timestamp   string              `json:"timestamp,omitempty"`
}

// DiscordEmbedField is a field in a Discord embed
type DiscordEmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

// DiscordEmbedFooter is a footer in a Discord embed
type DiscordEmbedFooter struct {
	Text    string `json:"text"`
	IconURL string `json:"icon_url,omitempty"`
}

func (d *DiscordChannel) Send(alert *models.Alert) error {
	if !d.IsEnabled() {
		return nil
	}

	msg := DiscordMessage{
		Username: DefaultUsername,
		Embeds: []DiscordEmbed{
			{
				Title:       FormatAlertTitle(alert),
				Description: alert.Message,
				Color:       GetColorInt(alert.Severity),
				Fields: []DiscordEmbedField{
					{Name: "Target", Value: alert.TargetName, Inline: true},
					{Name: "Instance", Value: alert.InstanceName, Inline: true},
					{Name: "Severity", Value: alert.Severity, Inline: true},
					{Name: "Status", Value: "Fired", Inline: true},
				},
				Footer:    &DiscordEmbedFooter{Text: FooterText},
				Timestamp: alert.FiredAt.Format(time.RFC3339),
			},
		},
	}

	return PostJSON(d.client, d.cfg.WebhookURL, msg)
}

func (d *DiscordChannel) SendResolved(alert *models.Alert) error {
	if !d.IsEnabled() {
		return nil
	}

	msg := DiscordMessage{
		Username: DefaultUsername,
		Embeds: []DiscordEmbed{
			{
				Title:       FormatResolvedTitle(alert),
				Description: alert.Message,
				Color:       ColorResolvedInt,
				Fields: []DiscordEmbedField{
					{Name: "Target", Value: alert.TargetName, Inline: true},
					{Name: "Instance", Value: alert.InstanceName, Inline: true},
					{Name: "Status", Value: "Resolved", Inline: true},
				},
				Footer:    &DiscordEmbedFooter{Text: FooterText},
				Timestamp: time.Now().Format(time.RFC3339),
			},
		},
	}

	return PostJSON(d.client, d.cfg.WebhookURL, msg)
}
