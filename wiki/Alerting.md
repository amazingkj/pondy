# Alerting

임계값 기반 알림 시스템입니다. 조건 충족 시 다양한 채널로 알림을 전송하고, 조건 해소 시 자동으로 resolved 처리됩니다.

## Configuration

```yaml
alerting:
  enabled: true
  check_interval: 30s   # 알림 체크 주기
  cooldown: 5m          # 동일 알림 재발송 방지 시간

  rules:
    - name: high_usage
      condition: "usage > 80"
      severity: warning
      message: "Pool usage is high: {{ .Usage }}%"

    - name: critical_usage
      condition: "usage > 95"
      severity: critical
      message: "Pool usage critical: {{ .Usage }}%"

    - name: pending_connections
      condition: "pending > 5"
      severity: warning
      message: "{{ .Pending }} connections waiting"

    - name: no_idle
      condition: "idle == 0"
      severity: critical
      message: "No idle connections available"

  channels:
    slack:
      enabled: true
      webhook_url: "https://hooks.slack.com/services/xxx/yyy/zzz"
      channel: "#alerts"
```

## Rule Variables

조건식에서 사용 가능한 변수:

| 변수 | 설명 |
|------|------|
| `active` | 현재 활성 커넥션 수 |
| `idle` | 유휴 커넥션 수 |
| `pending` | 대기 중인 요청 수 |
| `max` | 최대 풀 크기 |
| `usage` | 풀 사용률 (%) |
| `timeout` | 타임아웃 발생 수 |
| `heap_usage` | JVM 힙 메모리 사용률 (%) |
| `cpu_usage` | CPU 사용률 (%) |

## Supported Channels

### Slack

```yaml
channels:
  slack:
    enabled: true
    webhook_url: "https://hooks.slack.com/services/xxx/yyy/zzz"
    channel: "#alerts"
    username: "Pondy"  # optional
```

### Discord

```yaml
channels:
  discord:
    enabled: true
    webhook_url: "https://discord.com/api/webhooks/xxx/yyy"
    username: "Pondy"  # optional
```

### Mattermost

```yaml
channels:
  mattermost:
    enabled: true
    webhook_url: "https://mattermost.example.com/hooks/xxx"
    channel: "alerts"
    username: "Pondy"  # optional
```

### Email (SMTP)

```yaml
channels:
  email:
    enabled: true
    smtp_host: "smtp.gmail.com"
    smtp_port: 587
    username: "your-email@gmail.com"
    password: "app-password"
    from: "pondy@example.com"
    to:
      - "admin@example.com"
      - "ops@example.com"
```

### Webhook (Generic)

```yaml
channels:
  webhook:
    enabled: true
    url: "https://your-service.com/api/alerts"
    method: POST  # optional, default: POST
    headers:      # optional
      Authorization: "Bearer token"
```

### Notion

```yaml
channels:
  notion:
    enabled: true
    token: "secret_xxx"
    database_id: "xxx-xxx-xxx"
```

Notion 데이터베이스 필수 속성:

| 속성 이름 | 타입 | 설명 |
|-----------|------|------|
| Name | Title | 알림 제목 |
| Message | Rich Text | 알림 메시지 |
| Target | Rich Text | 대상 서비스명 |
| Instance | Rich Text | 인스턴스 ID |
| Severity | Select | info / warning / critical |
| Status | Select | Fired / Resolved |
| Rule | Rich Text | 규칙명 |
| Fired At | Date | 발생 시각 |
| Resolved At | Date | 해결 시각 (옵션) |

### Custom Plugins

```yaml
channels:
  plugins:
    - name: custom-handler
      enabled: true
      url: "https://your-service.com/api/alerts"
      method: POST
      headers:
        Authorization: "Bearer your-token"
      timeout: 10s
      retry_count: 3
      retry_delay: 1s
```

플러그인이 수신하는 JSON Payload:

```json
{
  "event": "alert.fired",
  "alert": {
    "id": 1,
    "target_name": "user-service",
    "instance_name": "default",
    "rule_name": "high_usage",
    "severity": "warning",
    "message": "Pool usage is high: 85%",
    "status": "fired",
    "fired_at": "2024-01-01T12:00:00Z",
    "resolved_at": null
  },
  "metadata": {
    "timestamp": "2024-01-01T12:00:05Z",
    "plugin_name": "custom-handler",
    "version": "1.0"
  }
}
```

## API

```bash
# 알림 목록 조회
curl http://localhost:8080/api/alerts

# 활성 알림만 조회
curl http://localhost:8080/api/alerts/active

# 알림 상세 조회
curl http://localhost:8080/api/alerts/1

# 알림 수동 해결
curl -X POST http://localhost:8080/api/alerts/1/resolve

# 테스트 알림 발송
curl -X POST http://localhost:8080/api/alerts/test

# 알림 통계
curl http://localhost:8080/api/alerts/stats

# 설정된 채널 목록
curl http://localhost:8080/api/alerts/channels
```

## Alert Rules API

```bash
# 규칙 목록 조회
curl http://localhost:8080/api/rules

# 규칙 상세 조회
curl http://localhost:8080/api/rules/1

# 규칙 생성
curl -X POST http://localhost:8080/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "high_cpu",
    "condition": "cpu_usage > 80",
    "severity": "warning",
    "message": "CPU usage is high: {{ .CpuUsage }}%"
  }'

# 규칙 수정
curl -X PUT http://localhost:8080/api/rules/1 \
  -H "Content-Type: application/json" \
  -d '{"condition": "cpu_usage > 90"}'

# 규칙 활성화/비활성화
curl -X PATCH http://localhost:8080/api/rules/1/toggle

# 규칙 삭제
curl -X DELETE http://localhost:8080/api/rules/1
```
