package alerter

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"html/template"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
)

const (
	// Email sending timeout
	emailDialTimeout = 10 * time.Second
	emailSendTimeout = 30 * time.Second
)

// EmailChannel sends alerts via SMTP email
type EmailChannel struct {
	cfg config.EmailConfig
}

// NewEmailChannel creates a new email channel
func NewEmailChannel(cfg config.EmailConfig) *EmailChannel {
	return &EmailChannel{cfg: cfg}
}

func (e *EmailChannel) Name() string {
	return "email"
}

func (e *EmailChannel) IsEnabled() bool {
	return e.cfg.Enabled && e.cfg.SMTPHost != "" && len(e.cfg.To) > 0
}

func (e *EmailChannel) Send(alert *models.Alert) error {
	if !e.IsEnabled() {
		return nil
	}

	subject := fmt.Sprintf("[Pondy %s] %s: %s", strings.ToUpper(alert.Severity), alert.RuleName, alert.TargetName)
	body, err := e.renderAlertBody(alert, false)
	if err != nil {
		return err
	}

	return e.sendEmail(subject, body)
}

func (e *EmailChannel) SendResolved(alert *models.Alert) error {
	if !e.IsEnabled() {
		return nil
	}

	subject := fmt.Sprintf("[Pondy RESOLVED] %s: %s", alert.RuleName, alert.TargetName)
	body, err := e.renderAlertBody(alert, true)
	if err != nil {
		return err
	}

	return e.sendEmail(subject, body)
}

func (e *EmailChannel) sendEmail(subject, body string) error {
	addr := fmt.Sprintf("%s:%d", e.cfg.SMTPHost, e.cfg.SMTPPort)

	// Build message
	var msg bytes.Buffer
	msg.WriteString(fmt.Sprintf("From: %s\r\n", e.cfg.From))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(e.cfg.To, ",")))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(body)

	// Authentication
	var auth smtp.Auth
	if e.cfg.Username != "" {
		auth = smtp.PlainAuth("", e.cfg.Username, e.cfg.Password, e.cfg.SMTPHost)
	}

	// Send with TLS if configured
	if e.cfg.UseTLS {
		return e.sendWithTLS(addr, auth, msg.Bytes())
	}

	return e.sendWithTimeout(addr, auth, msg.Bytes())
}

// sendWithTimeout sends email without TLS but with connection timeout
func (e *EmailChannel) sendWithTimeout(addr string, auth smtp.Auth, msg []byte) error {
	// Dial with timeout
	conn, err := net.DialTimeout("tcp", addr, emailDialTimeout)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer conn.Close()

	// Set deadline for entire send operation
	if err := conn.SetDeadline(time.Now().Add(emailSendTimeout)); err != nil {
		return fmt.Errorf("failed to set connection deadline: %w", err)
	}

	client, err := smtp.NewClient(conn, e.cfg.SMTPHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP authentication failed: %w", err)
		}
	}

	if err := client.Mail(e.cfg.From); err != nil {
		return fmt.Errorf("SMTP MAIL command failed: %w", err)
	}

	for _, to := range e.cfg.To {
		if err := client.Rcpt(to); err != nil {
			return fmt.Errorf("SMTP RCPT command failed for %s: %w", to, err)
		}
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA command failed: %w", err)
	}

	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("failed to write email body: %w", err)
	}

	if err := w.Close(); err != nil {
		return fmt.Errorf("failed to close email body: %w", err)
	}

	return client.Quit()
}

func (e *EmailChannel) sendWithTLS(addr string, auth smtp.Auth, msg []byte) error {
	tlsConfig := &tls.Config{
		ServerName: e.cfg.SMTPHost,
	}

	// Use dial with timeout to prevent hanging
	dialer := &net.Dialer{Timeout: emailDialTimeout}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer conn.Close()

	// Set deadline for entire send operation
	if err := conn.SetDeadline(time.Now().Add(emailSendTimeout)); err != nil {
		return fmt.Errorf("failed to set connection deadline: %w", err)
	}

	client, err := smtp.NewClient(conn, e.cfg.SMTPHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP authentication failed: %w", err)
		}
	}

	if err := client.Mail(e.cfg.From); err != nil {
		return fmt.Errorf("SMTP MAIL command failed: %w", err)
	}

	for _, to := range e.cfg.To {
		if err := client.Rcpt(to); err != nil {
			return fmt.Errorf("SMTP RCPT command failed for %s: %w", to, err)
		}
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA command failed: %w", err)
	}

	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("failed to write email body: %w", err)
	}

	if err := w.Close(); err != nil {
		return fmt.Errorf("failed to close email body: %w", err)
	}

	return client.Quit()
}

func (e *EmailChannel) renderAlertBody(alert *models.Alert, resolved bool) (string, error) {
	tmpl, err := template.New("email").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	data := struct {
		Alert    *models.Alert
		Resolved bool
		Time     time.Time
	}{
		Alert:    alert,
		Resolved: resolved,
		Time:     time.Now(),
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}

	return buf.String(), nil
}

const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { padding-bottom: 16px; border-bottom: 2px solid {{if .Resolved}}#2ECC71{{else if eq .Alert.Severity "critical"}}#E74C3C{{else if eq .Alert.Severity "warning"}}#F39C12{{else}}#3498DB{{end}}; }
        .title { font-size: 20px; font-weight: 600; margin: 0; color: {{if .Resolved}}#2ECC71{{else if eq .Alert.Severity "critical"}}#E74C3C{{else if eq .Alert.Severity "warning"}}#F39C12{{else}}#3498DB{{end}}; }
        .message { font-size: 16px; color: #333; margin: 16px 0; }
        .details { background: #f9f9f9; border-radius: 4px; padding: 16px; margin: 16px 0; }
        .detail-row { display: flex; margin-bottom: 8px; }
        .detail-label { font-weight: 600; width: 120px; color: #666; }
        .detail-value { color: #333; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">{{if .Resolved}}✅ Alert Resolved{{else}}{{if eq .Alert.Severity "critical"}}🚨{{else if eq .Alert.Severity "warning"}}⚠️{{else}}ℹ️{{end}} {{.Alert.RuleName}}{{end}}</h1>
        </div>
        <div class="message">{{.Alert.Message}}</div>
        <div class="details">
            <div class="detail-row">
                <span class="detail-label">Target:</span>
                <span class="detail-value">{{.Alert.TargetName}}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Instance:</span>
                <span class="detail-value">{{.Alert.InstanceName}}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Severity:</span>
                <span class="detail-value">{{.Alert.Severity}}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">{{if .Resolved}}Resolved{{else}}Fired{{end}}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Fired At:</span>
                <span class="detail-value">{{.Alert.FiredAt.Format "2006-01-02 15:04:05"}}</span>
            </div>
            {{if .Resolved}}
            <div class="detail-row">
                <span class="detail-label">Resolved At:</span>
                <span class="detail-value">{{.Time.Format "2006-01-02 15:04:05"}}</span>
            </div>
            {{end}}
        </div>
        <div class="footer">
            This alert was sent by Pondy - JVM Connection Pool Monitor
        </div>
    </div>
</body>
</html>`
