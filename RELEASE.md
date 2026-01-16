# v0.3.0

## What's New

### Alerting System
- Multi-channel alert notifications (Slack, Discord, Mattermost, Email, Webhook, Notion)
- Customizable alert rules with condition expressions
- Auto-resolve when conditions clear
- Custom plugin system for HTTP-based integrations
- Alert cooldown to prevent notification spam

### Maintenance Windows
- Schedule maintenance periods to suppress alerts
- Support for recurring windows (daily, weekly, monthly)
- Target-specific or global maintenance

### Alert Rules Management
- Create, update, delete rules via API
- Toggle rules on/off without deletion
- Web UI for rule management

## Improvements

### Security
- Rate limiting (100 req/s general, 10 req/s for heavy endpoints)
- Connection limits (50 per IP, 500 total)
- Security headers (X-Frame-Options, CSP, etc.)
- CORS support
- Request body size limit (10MB)
- Non-root Docker user with automatic permission handling

### Docker
- Healthcheck support for container orchestration
- Automatic volume permission fixes on startup
- Smaller image with su-exec for privilege dropping

### API
- Alert management endpoints
- Alert rules CRUD endpoints
- Maintenance window endpoints
- Alerting config endpoints
- Test alert endpoint with strict rate limiting

### Reliability
- Webhook retry with exponential backoff
- Proper HTTP response body draining for connection reuse
- Improved error handling throughout

## Bug Fixes
- Fixed SQL injection vulnerability in backup/restore
- Fixed potential panic on short URL paths
- Fixed connection leak in HTTP clients
- Fixed NaN/Infinity handling in metrics

## Docker

```bash
docker pull jiin724/pondy:0.3.0
```

## Documentation

See [Wiki](https://github.com/jiin724/pondy/wiki) for detailed documentation.
