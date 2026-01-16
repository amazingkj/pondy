# v0.3.1

## What's New

### Frontend Architecture Improvements
- Split AlertPanel (1340 lines) into modular components for better maintainability
  - `AlertPanel/AlertPanel.tsx` - Main container with keyboard navigation
  - `AlertPanel/AlertHistoryTab.tsx` - Alert history view
  - `AlertPanel/AlertChannelsTab.tsx` - Channel configuration
  - `AlertPanel/MaintenanceTab.tsx` - Maintenance window management
  - `AlertPanel/AlertCard.tsx` - Reusable alert card component
- Created centralized color constants (`constants/colors.ts`)
- Extracted reusable UI components (`FormField`, `LabelledCheckbox`, `IconButton`, `FilterButton`)

### Accessibility (a11y)
- Added `aria-label`, `aria-expanded`, `aria-controls` to header buttons
- Added `aria-pressed` to filter buttons
- Added `role="tablist/tab/tabpanel"` with keyboard navigation support
- Added `aria-invalid`, `aria-describedby` to form fields
- Improved screen reader support throughout the application

### Performance
- Added `React.memo()` to Dashboard and new components
- Improved component memoization for reduced re-renders

## Dependency Updates

### Go Dependencies (Major)
| Package | Previous | Current |
|---------|----------|---------|
| gin-gonic/gin | v1.9.1 | v1.11.0 |
| spf13/viper | v1.18.2 | v1.21.0 |
| modernc.org/sqlite | v1.28.0 | v1.44.1 |
| go-playground/validator | v10.14.0 | v10.30.1 |
| bytedance/sonic | v1.9.1 | v1.14.2 |
| fsnotify | v1.7.0 | v1.9.0 |
| Go version | 1.22 | 1.24.0 |

### Go Dependencies (Indirect)
- All indirect dependencies updated to latest versions
- Removed unused dependencies via `go mod tidy`

## Bug Fixes
- Fixed TestGetSlackColor test expectation (Slack uses "good" for info severity)

## Docker

```bash
docker pull jiin724/pondy:0.3.1
```

**Note**: Dockerfile updated to use Go 1.24-alpine base image.

---

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
