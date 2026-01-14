# pondy

Lightweight connection pool monitor for JVM applications.

## Features

- Real-time HikariCP metrics collection via Spring Actuator
- Built-in web dashboard with trend charts
- Multi-channel alerting (Slack, Discord, Email, Webhook, Notion)
- SQLite storage (no external dependencies)
- Single binary deployment

## Quick Start

### Docker (Recommended)

```bash
docker-compose up -d

# Open http://localhost:8080
```

### Demo Mode

```bash
# Mock 서버와 함께 실행 (테스트용)
docker-compose --profile demo up -d
```

### From Source

```bash
go run ./cmd/pondy -config config.example.yaml
```

## Configuration

```yaml
server:
  port: 8080

storage:
  path: ./data/pondy.db

targets:
  - name: my-service
    type: actuator
    endpoint: http://localhost:8080/actuator/metrics
    interval: 10s
```

## Documentation

자세한 설정 및 사용법은 [Wiki](../../wiki)를 참조하세요.

- [Multi-Instance Support](../../wiki/Multi-Instance-Support)
- [Data Retention](../../wiki/Data-Retention)
- [Alerting](../../wiki/Alerting)
- [Maintenance Windows](../../wiki/Maintenance-Windows)
- [Report & Export](../../wiki/Report-Export)
- [Backup & Restore](../../wiki/Backup-Restore)
- [API Reference](../../wiki/API-Reference)
- [Security](../../wiki/Security)

## License

MIT
