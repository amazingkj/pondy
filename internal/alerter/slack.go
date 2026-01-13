package alerter

import (
	"net/http"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
)

// SlackChannel sends alerts to Slack
type SlackChannel struct {
	cfg    config.SlackConfig
	client *http.Client
}

// NewSlackChannel creates a new Slack channel
func NewSlackChannel(cfg config.SlackConfig) *SlackChannel {
	return &SlackChannel{
		cfg:    cfg,
		client: NewHTTPClient(),
	}
}

func (s *SlackChannel) Name() string {
	return "slack"
}

func (s *SlackChannel) IsEnabled() bool {
	return s.cfg.Enabled && s.cfg.WebhookURL != ""
}

// SlackMessage is the Slack webhook payload
type SlackMessage struct {
	Channel     string            `json:"channel,omitempty"`
	Username    string            `json:"username,omitempty"`
	IconEmoji   string            `json:"icon_emoji,omitempty"`
	Attachments []SlackAttachment `json:"attachments"`
}

// SlackAttachment is a Slack message attachment
type SlackAttachment struct {
	Color      string       `json:"color"`
	Title      string       `json:"title"`
	Text       string       `json:"text"`
	Fields     []SlackField `json:"fields,omitempty"`
	Footer     string       `json:"footer,omitempty"`
	FooterIcon string       `json:"footer_icon,omitempty"`
	Timestamp  int64        `json:"ts,omitempty"`
}

// SlackField is a field in a Slack attachment
type SlackField struct {
	Title string `json:"title"`
	Value string `json:"value"`
	Short bool   `json:"short"`
}

func (s *SlackChannel) Send(alert *models.Alert) error {
	if !s.IsEnabled() {
		return nil
	}

	msg := SlackMessage{
		Channel:   s.cfg.Channel,
		Username:  GetUsername(s.cfg.Username),
		IconEmoji: ":warning:",
		Attachments: []SlackAttachment{
			{
				Color: GetSlackColor(alert.Severity),
				Title: FormatAlertTitle(alert),
				Text:  alert.Message,
				Fields: []SlackField{
					{Title: "Target", Value: alert.TargetName, Short: true},
					{Title: "Instance", Value: alert.InstanceName, Short: true},
					{Title: "Severity", Value: alert.Severity, Short: true},
					{Title: "Status", Value: "Fired", Short: true},
				},
				Footer:    FooterText,
				Timestamp: alert.FiredAt.Unix(),
			},
		},
	}

	return PostJSON(s.client, s.cfg.WebhookURL, msg)
}

func (s *SlackChannel) SendResolved(alert *models.Alert) error {
	if !s.IsEnabled() {
		return nil
	}

	msg := SlackMessage{
		Channel:   s.cfg.Channel,
		Username:  GetUsername(s.cfg.Username),
		IconEmoji: ":white_check_mark:",
		Attachments: []SlackAttachment{
			{
				Color: "good",
				Title: FormatResolvedTitle(alert),
				Text:  alert.Message,
				Fields: []SlackField{
					{Title: "Target", Value: alert.TargetName, Short: true},
					{Title: "Instance", Value: alert.InstanceName, Short: true},
					{Title: "Status", Value: "Resolved", Short: true},
				},
				Footer:    FooterText,
				Timestamp: time.Now().Unix(),
			},
		},
	}

	return PostJSON(s.client, s.cfg.WebhookURL, msg)
}
