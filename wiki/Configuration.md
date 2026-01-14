# Configuration

Pondy 설정 파일 가이드입니다.

## Basic Structure

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

## Server

```yaml
server:
  port: 8080        # 웹 서버 포트
  timezone: "Asia/Seoul"  # 타임존 (optional)
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `port` | HTTP 서버 포트 | `8080` |
| `timezone` | 시간대 설정 | 시스템 기본값 |

## Storage

```yaml
storage:
  path: ./data/pondy.db  # SQLite 데이터베이스 경로
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `path` | SQLite DB 파일 경로 | `./pondy.db` |

## Targets

모니터링 대상 서비스를 정의합니다.

### Single Instance

```yaml
targets:
  - name: user-service
    type: actuator
    endpoint: http://localhost:8080/actuator/metrics
    interval: 10s
```

### Multi Instance

```yaml
targets:
  - name: order-service
    type: actuator
    interval: 10s
    instances:
      - id: primary
        endpoint: http://app1:8080/actuator/metrics
      - id: replica-1
        endpoint: http://app2:8080/actuator/metrics
```

| 옵션 | 설명 | 필수 |
|------|------|------|
| `name` | 타겟 식별자 | O |
| `type` | 타입 (현재 `actuator`만 지원) | O |
| `endpoint` | 메트릭 엔드포인트 URL | O (단일) |
| `interval` | 수집 주기 | O |
| `instances` | 인스턴스 목록 | O (다중) |

### Interval Format

```yaml
interval: 10s   # 10초
interval: 1m    # 1분
interval: 30s   # 30초
```

## Retention

데이터 보존 정책을 설정합니다.

```yaml
retention:
  max_age: 30d        # 보존 기간
  cleanup_interval: 1h # 정리 주기
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `max_age` | 데이터 보존 기간 | 무제한 |
| `cleanup_interval` | 정리 작업 주기 | `1h` |

### Duration Format

```yaml
max_age: 24h   # 24시간
max_age: 7d    # 7일
max_age: 720h  # 30일
```

## Alerting

알림 시스템을 설정합니다.

```yaml
alerting:
  enabled: true
  check_interval: 30s
  cooldown: 5m

  rules:
    - name: high_usage
      condition: "usage > 80"
      severity: warning
      message: "Pool usage is high: {{ .Usage }}%"

  channels:
    slack:
      enabled: true
      webhook_url: "https://hooks.slack.com/..."
```

자세한 내용은 [Alerting](Alerting) 페이지를 참조하세요.

## Full Example

```yaml
server:
  port: 8080
  timezone: "Asia/Seoul"

storage:
  path: /app/data/pondy.db

retention:
  max_age: 30d
  cleanup_interval: 6h

targets:
  - name: gateway
    type: actuator
    endpoint: http://gateway:8080/actuator/metrics
    interval: 10s

  - name: order-service
    type: actuator
    interval: 10s
    instances:
      - id: pod-1
        endpoint: http://order-1:8080/actuator/metrics
      - id: pod-2
        endpoint: http://order-2:8080/actuator/metrics

  - name: user-service
    type: actuator
    endpoint: http://user:8080/actuator/metrics
    interval: 15s

alerting:
  enabled: true
  check_interval: 30s
  cooldown: 5m

  rules:
    - name: high_usage
      condition: "usage > 80"
      severity: warning
      message: "Pool usage high: {{ .Usage }}%"

    - name: critical_usage
      condition: "usage > 95"
      severity: critical
      message: "Pool usage critical: {{ .Usage }}%"

    - name: no_idle
      condition: "idle == 0"
      severity: critical
      message: "No idle connections"

  channels:
    slack:
      enabled: true
      webhook_url: "https://hooks.slack.com/services/xxx/yyy/zzz"
      channel: "#alerts"

    discord:
      enabled: false
      webhook_url: ""

    email:
      enabled: false
      smtp_host: ""
      smtp_port: 587
      username: ""
      password: ""
      from: ""
      to: []
```

## Environment Variables

Docker 환경에서 환경 변수를 사용할 수 있습니다:

```yaml
# docker-compose.yml
services:
  pondy:
    environment:
      - TZ=Asia/Seoul
      - MOCK_PORT=9090
```

## Hot Reload

설정 파일 변경 시 자동으로 반영됩니다 (타겟 추가/수정/삭제).

> **참고:** 일부 설정(server.port 등)은 재시작이 필요합니다.

## Config API

웹 UI 또는 API를 통해 타겟을 동적으로 관리할 수 있습니다:

```bash
# 타겟 추가
curl -X POST http://localhost:8080/api/config/targets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "new-service",
    "type": "actuator",
    "endpoint": "http://localhost:9090/actuator/metrics",
    "interval": "10s"
  }'
```

자세한 내용은 [API Reference](API-Reference) 페이지를 참조하세요.
