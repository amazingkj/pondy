# Multi-Instance Support

하나의 타겟에 여러 인스턴스(replica)를 모니터링할 수 있습니다.

## Configuration

```yaml
targets:
  # 다중 인스턴스 설정
  - name: order-service
    type: actuator
    interval: 10s
    instances:
      - id: primary
        endpoint: http://app1:8080/actuator/metrics
      - id: replica-1
        endpoint: http://app2:8080/actuator/metrics
      - id: replica-2
        endpoint: http://app3:8080/actuator/metrics

  # 단일 인스턴스 (기존 방식도 호환)
  - name: legacy-service
    type: actuator
    endpoint: http://legacy:8080/actuator/metrics
    interval: 10s
```

## Options

| 옵션 | 설명 |
|------|------|
| `instances` | 인스턴스 목록 배열 |
| `instances[].id` | 인스턴스 식별자 (예: primary, replica-1) |
| `instances[].endpoint` | 해당 인스턴스의 메트릭 엔드포인트 |

> **참고:** `endpoint`만 설정하면 자동으로 `id: default` 인스턴스로 처리됩니다.

## API

### 인스턴스 목록 조회

```bash
curl http://localhost:8080/api/targets/order-service/instances
```

**응답:**
```json
{
  "target_name": "order-service",
  "instances": [
    {"id": "primary", "endpoint": "http://app1:8080/actuator/metrics"},
    {"id": "replica-1", "endpoint": "http://app2:8080/actuator/metrics"},
    {"id": "replica-2", "endpoint": "http://app3:8080/actuator/metrics"}
  ]
}
```

### 특정 인스턴스 메트릭 조회

```bash
# 특정 인스턴스의 히스토리 조회
curl http://localhost:8080/api/targets/order-service/history?instance=primary

# 특정 인스턴스의 현재 메트릭
curl http://localhost:8080/api/targets/order-service/metrics?instance=replica-1
```

## Dashboard

웹 대시보드에서 인스턴스별로 필터링하여 메트릭을 확인할 수 있습니다.
