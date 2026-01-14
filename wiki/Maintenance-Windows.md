# Maintenance Windows

특정 시간대에 알림을 일시 중지하는 기능입니다. 정기 배포, 점검 시간 등에 불필요한 알림을 방지합니다.

## API

### 유지보수 윈도우 생성

```bash
curl -X POST http://localhost:8080/api/maintenance \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Deploy",
    "start_time": "2024-01-15T02:00:00Z",
    "end_time": "2024-01-15T04:00:00Z",
    "targets": ["order-service", "user-service"],
    "recurring": false
  }'
```

### 반복 유지보수 윈도우

```bash
curl -X POST http://localhost:8080/api/maintenance \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Maintenance",
    "start_time": "2024-01-15T03:00:00Z",
    "end_time": "2024-01-15T03:30:00Z",
    "targets": [],
    "recurring": true,
    "recurrence_rule": "daily"
  }'
```

## Options

| 옵션 | 설명 | 필수 |
|------|------|------|
| `name` | 유지보수 윈도우 이름 | O |
| `start_time` | 시작 시간 (ISO 8601) | O |
| `end_time` | 종료 시간 (ISO 8601) | O |
| `targets` | 대상 타겟 목록 (빈 배열 = 전체) | X |
| `recurring` | 반복 여부 | X |
| `recurrence_rule` | 반복 규칙 (daily, weekly, monthly) | X |

## Recurrence Rules

| 규칙 | 설명 |
|------|------|
| `daily` | 매일 같은 시간 |
| `weekly` | 매주 같은 요일/시간 |
| `monthly` | 매월 같은 날짜/시간 |

## API Reference

```bash
# 전체 목록 조회
curl http://localhost:8080/api/maintenance

# 활성 윈도우만 조회
curl http://localhost:8080/api/maintenance/active

# 상세 조회
curl http://localhost:8080/api/maintenance/1

# 수정
curl -X PUT http://localhost:8080/api/maintenance/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'

# 삭제
curl -X DELETE http://localhost:8080/api/maintenance/1
```

## Notes

- `targets`가 빈 배열이면 모든 타겟에 적용됩니다.
- 유지보수 윈도우 중에는 해당 타겟의 알림이 발생하지 않습니다.
- 윈도우 종료 후 조건이 여전히 충족되면 알림이 발생합니다.
