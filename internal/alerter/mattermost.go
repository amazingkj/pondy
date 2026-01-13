package alerter

import (
	"net/http"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
)

// MattermostChannel sends alerts to Mattermost
// Mattermost uses a Slack-compatible webhook format
type MattermostChannel struct {
	cfg    config.MattermostConfig
	client *http.Client
}

// NewMattermostChannel creates a new Mattermost channel
func NewMattermostChannel(cfg config.MattermostConfig) *MattermostChannel {
	return &MattermostChannel{
		cfg:    cfg,
		client: NewHTTPClient(),
	}
}

func (m *MattermostChannel) Name() string {
	return "mattermost"
}

func (m *MattermostChannel) IsEnabled() bool {
	return m.cfg.Enabled && m.cfg.WebhookURL != ""
}

// MattermostMessage is the Mattermost webhook payload (Slack-compatible)
type MattermostMessage struct {
	Channel     string                 `json:"channel,omitempty"`
	Username    string                 `json:"username,omitempty"`
	IconURL     string                 `json:"icon_url,omitempty"`
	IconEmoji   string                 `json:"icon_emoji,omitempty"`
	Attachments []MattermostAttachment `json:"attachments"`
}

// MattermostAttachment is a Mattermost message attachment
type MattermostAttachment struct {
	Color      string            `json:"color"`
	Title      string            `json:"title"`
	Text       string            `json:"text"`
	Fields     []MattermostField `json:"fields,omitempty"`
	Footer     string            `json:"footer,omitempty"`
	FooterIcon string            `json:"footer_icon,omitempty"`
}

// MattermostField is a field in a Mattermost attachment
type MattermostField struct {
	Title string `json:"title"`
	Value string `json:"value"`
	Short bool   `json:"short"`
}

func (m *MattermostChannel) Send(alert *models.Alert) error {
	if !m.IsEnabled() {
		return nil
	}

	msg := MattermostMessage{
		Channel:   m.cfg.Channel,
		Username:  GetUsername(m.cfg.Username),
		IconEmoji: ":warning:",
		Attachments: []MattermostAttachment{
			{
				Color: GetColorString(alert.Severity),
				Title: FormatAlertTitle(alert),
				Text:  alert.Message,
				Fields: []MattermostField{
					{Title: "Target", Value: alert.TargetName, Short: true},
					{Title: "Instance", Value: alert.InstanceName, Short: true},
					{Title: "Severity", Value: alert.Severity, Short: true},
					{Title: "Status", Value: "Fired", Short: true},
				},
				Footer: FooterText,
			},
		},
	}

	return PostJSON(m.client, m.cfg.WebhookURL, msg)
}

func (m *MattermostChannel) SendResolved(alert *models.Alert) error {
	if !m.IsEnabled() {
		return nil
	}

	msg := MattermostMessage{
		Channel:   m.cfg.Channel,
		Username:  GetUsername(m.cfg.Username),
		IconEmoji: ":white_check_mark:",
		Attachments: []MattermostAttachment{
			{
				Color: ColorResolved,
				Title: FormatResolvedTitle(alert),
				Text:  alert.Message,
				Fields: []MattermostField{
					{Title: "Target", Value: alert.TargetName, Short: true},
					{Title: "Instance", Value: alert.InstanceName, Short: true},
					{Title: "Status", Value: "Resolved", Short: true},
				},
				Footer: FooterText,
			},
		},
	}

	return PostJSON(m.client, m.cfg.WebhookURL, msg)
}
