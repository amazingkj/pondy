# pondy

Lightweight connection pool monitor for JVM applications.

## Features

- Real-time HikariCP metrics collection via Spring Actuator
- Built-in web dashboard with trend charts
- SQLite storage (no external dependencies)
- Single binary deployment

## Quick Start

```bash
# Run mock server (for testing)
go run ./cmd/mock-actuator

# Run pondy
go run ./cmd/pondy -config config.example.yaml

# Open http://localhost:8080
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

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/targets` | List all targets with current status |
| `GET /api/targets/:name/history?range=1h` | Get historical metrics |
| `GET /health` | Health check |

## License

MIT
