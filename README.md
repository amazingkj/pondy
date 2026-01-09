# pondy

Lightweight connection pool monitor for JVM applications.

## Features

- Real-time HikariCP metrics collection via Spring Actuator
- Built-in web dashboard with trend charts
- SQLite storage (no external dependencies)
- Single binary deployment

## Quick Start

### Docker (Recommended)

```bash
# docker-compose로 실행
docker-compose up -d

# 또는 docker만 사용
docker run -d -p 8080:8080 \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/data:/app/data \
  jiin724/pondy:latest

# Open http://localhost:8080
```

### From Source

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

### Data Retention Policy

오래된 메트릭 데이터를 자동으로 정리하려면 `retention` 설정을 추가합니다:

```yaml
retention:
  max_age: 30d        # 보존 기간 (예: 30d, 7d, 24h)
  cleanup_interval: 1h # 정리 작업 실행 주기
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `max_age` | 데이터 보존 기간. 이 기간보다 오래된 데이터는 삭제됨 | 설정 안 함 (무제한) |
| `cleanup_interval` | 백그라운드 정리 작업 실행 간격 | `1h` |

**예시:**
- `max_age: 7d` - 7일간 데이터 보존
- `max_age: 24h` - 24시간만 보존
- `max_age: 720h` - 30일간 보존 (720시간)

> **참고:** `retention` 설정이 없으면 데이터가 무기한 보존됩니다.

### Multi-Instance Support

하나의 타겟에 여러 인스턴스(replica)를 모니터링할 수 있습니다:

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

| 옵션 | 설명 |
|------|------|
| `instances` | 인스턴스 목록 배열 |
| `instances[].id` | 인스턴스 식별자 (예: primary, replica-1) |
| `instances[].endpoint` | 해당 인스턴스의 메트릭 엔드포인트 |

**API에서 인스턴스별 조회:**
```bash
# 특정 인스턴스의 히스토리 조회
curl http://localhost:8080/api/targets/order-service/history?instance=primary

# 인스턴스 목록 조회
curl http://localhost:8080/api/targets/order-service/instances
```

> **참고:** `endpoint`만 설정하면 자동으로 `id: default` 인스턴스로 처리됩니다.

### Period Comparison

현재 기간과 이전 기간의 메트릭을 비교하여 트렌드를 분석합니다:

```bash
# 오늘 vs 어제 비교
curl http://localhost:8080/api/targets/my-service/compare?period=day

# 이번 주 vs 지난 주 비교
curl http://localhost:8080/api/targets/my-service/compare?period=week
```

**응답 예시:**
```json
{
  "target_name": "my-service",
  "period": "day",
  "current_period": {
    "avg_usage": 45.2,
    "max_usage": 78.5,
    "avg_active": 9.1,
    "timeout_sum": 0
  },
  "previous_period": {
    "avg_usage": 42.1,
    "max_usage": 71.3,
    "avg_active": 8.4,
    "timeout_sum": 2
  },
  "changes": {
    "avg_usage_change": 7.4,
    "max_usage_change": 10.1,
    "trend": "degrading"
  }
}
```

| trend 값 | 의미 |
|----------|------|
| `improving` | 사용량 감소 (개선) |
| `stable` | 변화 없음 (±5% 이내) |
| `degrading` | 사용량 증가 (악화) |

### Report Generation

HTML 형식의 종합 분석 리포트를 생성합니다:

```bash
# 브라우저에서 열기
open "http://localhost:8080/api/targets/my-service/report?range=24h"

# 파일로 저장
curl http://localhost:8080/api/targets/my-service/report?range=24h > report.html
```

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `range` | 분석 기간 (예: 1h, 24h, 7d) | `24h` |

**리포트 포함 내용:**
- 요약 통계 (평균/최대 사용량, 헬스 스코어, 리스크 레벨)
- 피크 타임 분석 (가장 바쁜/한가한 시간대)
- 추천사항 목록
- 이상 탐지 결과
- 연결 누수 분석

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/targets` | List all targets with current status |
| `GET /api/targets/:name/history?range=1h` | Get historical metrics |
| `GET /api/targets/:name/instances` | List instances for a target |
| `GET /api/targets/:name/recommendations` | Get pool sizing recommendations |
| `GET /api/targets/:name/leaks` | Detect connection leaks |
| `GET /api/targets/:name/peaktime` | Analyze peak usage hours |
| `GET /api/targets/:name/anomalies` | Detect anomalies |
| `GET /api/targets/:name/compare?period=day` | Compare with previous period |
| `GET /api/targets/:name/report?range=24h` | Generate HTML report |
| `GET /api/targets/:name/export?range=24h` | Export metrics as CSV |
| `GET /health` | Health check |

## License

MIT
