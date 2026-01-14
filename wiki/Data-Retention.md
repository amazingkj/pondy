# Data Retention

오래된 메트릭 데이터를 자동으로 정리하는 기능입니다.

## Configuration

```yaml
retention:
  max_age: 30d        # 보존 기간 (예: 30d, 7d, 24h)
  cleanup_interval: 1h # 정리 작업 실행 주기
```

## Options

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `max_age` | 데이터 보존 기간. 이 기간보다 오래된 데이터는 삭제됨 | 설정 안 함 (무제한) |
| `cleanup_interval` | 백그라운드 정리 작업 실행 간격 | `1h` |

## Examples

```yaml
# 7일간 데이터 보존
retention:
  max_age: 7d

# 24시간만 보존
retention:
  max_age: 24h

# 30일간 보존 (720시간)
retention:
  max_age: 720h

# 30일 보존, 6시간마다 정리
retention:
  max_age: 30d
  cleanup_interval: 6h
```

## Notes

- `retention` 설정이 없으면 데이터가 무기한 보존됩니다.
- 정리 작업은 백그라운드에서 실행되며 서비스에 영향을 주지 않습니다.
- 디스크 공간이 부족할 경우 `max_age`를 줄이는 것을 권장합니다.
