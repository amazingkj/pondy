# API Reference

## Targets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/targets` | 전체 타겟 목록 및 현재 상태 |
| GET | `/api/targets/:name/metrics` | 특정 타겟의 현재 메트릭 |
| GET | `/api/targets/:name/history` | 히스토리 메트릭 |
| GET | `/api/targets/:name/instances` | 인스턴스 목록 |
| GET | `/api/targets/:name/recommendations` | 풀 사이즈 권장사항 |
| GET | `/api/targets/:name/leaks` | 연결 누수 감지 |
| GET | `/api/targets/:name/peaktime` | 피크 타임 분석 |
| GET | `/api/targets/:name/anomalies` | 이상 탐지 |
| GET | `/api/targets/:name/compare` | 기간 비교 |
| GET | `/api/targets/:name/report` | HTML 리포트 생성 |
| GET | `/api/targets/:name/export` | CSV 내보내기 |

### Query Parameters

**History / Export:**
| Parameter | Description | Default |
|-----------|-------------|---------|
| `range` | 조회 기간 (1h, 24h, 7d) | `1h` |
| `instance` | 인스턴스 필터 | 전체 |

**Compare:**
| Parameter | Description | Default |
|-----------|-------------|---------|
| `period` | 비교 기간 (day, week) | `day` |

## Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | 알림 목록 |
| GET | `/api/alerts/active` | 활성 알림만 |
| GET | `/api/alerts/stats` | 알림 통계 |
| GET | `/api/alerts/channels` | 설정된 채널 목록 |
| GET | `/api/alerts/:id` | 알림 상세 |
| POST | `/api/alerts/:id/resolve` | 알림 수동 해결 |
| POST | `/api/alerts/test` | 테스트 알림 발송 |

## Alert Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rules` | 규칙 목록 |
| GET | `/api/rules/:id` | 규칙 상세 |
| POST | `/api/rules` | 규칙 생성 |
| PUT | `/api/rules/:id` | 규칙 수정 |
| DELETE | `/api/rules/:id` | 규칙 삭제 |
| PATCH | `/api/rules/:id/toggle` | 규칙 활성화/비활성화 |

## Maintenance Windows

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/maintenance` | 윈도우 목록 |
| GET | `/api/maintenance/active` | 활성 윈도우만 |
| GET | `/api/maintenance/:id` | 윈도우 상세 |
| POST | `/api/maintenance` | 윈도우 생성 |
| PUT | `/api/maintenance/:id` | 윈도우 수정 |
| DELETE | `/api/maintenance/:id` | 윈도우 삭제 |

## Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/targets` | 타겟 설정 목록 |
| POST | `/api/config/targets` | 타겟 추가 |
| PUT | `/api/config/targets/:name` | 타겟 수정 |
| DELETE | `/api/config/targets/:name` | 타겟 삭제 |
| GET | `/api/config/alerting` | 알림 설정 조회 |
| PUT | `/api/config/alerting` | 알림 설정 수정 |
| GET | `/api/settings` | 전체 설정 조회 |

## Backup

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/backup` | 백업 생성 |
| GET | `/api/backup/download` | 백업 다운로드 |
| POST | `/api/backup/restore` | 백업 복원 |

## Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/report/combined` | 전체 타겟 통합 리포트 |
| GET | `/api/export/all` | 전체 타겟 CSV 내보내기 |

## Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | 헬스 체크 |

## Response Codes

| Code | Description |
|------|-------------|
| 200 | 성공 |
| 400 | 잘못된 요청 |
| 404 | 리소스 없음 |
| 429 | Rate limit 초과 |
| 500 | 서버 오류 |
| 503 | 서비스 불가 (연결 제한 초과) |
