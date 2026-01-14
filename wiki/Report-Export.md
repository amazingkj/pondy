# Report & Export

메트릭 데이터를 리포트로 생성하거나 CSV로 내보내는 기능입니다.

## HTML Report

HTML 형식의 종합 분석 리포트를 생성합니다.

### Usage

```bash
# 브라우저에서 열기
open "http://localhost:8080/api/targets/my-service/report?range=24h"

# 파일로 저장
curl http://localhost:8080/api/targets/my-service/report?range=24h > report.html
```

### Parameters

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `range` | 분석 기간 (예: 1h, 24h, 7d) | `24h` |
| `instance` | 특정 인스턴스만 분석 | 전체 |

### Report Contents

- **요약 통계**: 평균/최대 사용량, 헬스 스코어, 리스크 레벨
- **피크 타임 분석**: 가장 바쁜/한가한 시간대
- **추천사항**: 풀 사이즈 조정 권고
- **이상 탐지**: 비정상 패턴 감지 결과
- **연결 누수 분석**: 잠재적 누수 감지

### Combined Report

여러 타겟의 통합 리포트:

```bash
curl "http://localhost:8080/api/report/combined?range=24h"
```

## CSV Export

메트릭 데이터를 CSV 형식으로 내보냅니다.

### Single Target

```bash
curl http://localhost:8080/api/targets/my-service/export?range=24h > metrics.csv
```

### All Targets

```bash
curl http://localhost:8080/api/export/all?range=24h > all-metrics.csv
```

### Parameters

| 파라미터 | 설명 | 기본값 |
|----------|------|--------|
| `range` | 내보내기 기간 | `24h` |
| `instance` | 특정 인스턴스만 | 전체 |

### CSV Columns

```
timestamp,target_name,instance_name,active,idle,pending,max,usage,timeout,heap_used,heap_max,cpu_usage
```

## Period Comparison

현재 기간과 이전 기간을 비교합니다.

### Usage

```bash
# 오늘 vs 어제
curl http://localhost:8080/api/targets/my-service/compare?period=day

# 이번 주 vs 지난 주
curl http://localhost:8080/api/targets/my-service/compare?period=week
```

### Response

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

### Trend Values

| 값 | 의미 |
|----------|------|
| `improving` | 사용량 감소 (개선) |
| `stable` | 변화 없음 (±5% 이내) |
| `degrading` | 사용량 증가 (악화) |
