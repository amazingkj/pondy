# Security

Pondy의 보안 관련 설정 및 기능입니다.

## Rate Limiting

API 엔드포인트에 rate limiting이 적용됩니다.

| 엔드포인트 | 제한 | 설명 |
|------------|------|------|
| 일반 API | 100 req/s, burst 200 | 대부분의 API |
| Export/Report/Anomalies | 10 req/s, burst 20 | CPU 집약적 작업 |
| Test Alert | 1 req/10s, burst 3 | 외부 서비스 호출 |
| Backup/Restore | 10 req/s, burst 20 | I/O 집약적 작업 |

Rate limit 초과 시 `429 Too Many Requests` 응답:

```json
{
  "error": "rate limit exceeded",
  "retry_after": "1s"
}
```

## Connection Limits

동시 연결 수 제한:

| 제한 | 값 |
|------|-----|
| IP당 최대 연결 | 50 |
| 전체 최대 연결 | 500 |

제한 초과 시 `503 Service Unavailable` 응답:

```json
{
  "error": "too many concurrent connections"
}
```

## Request Size Limit

요청 본문 크기 제한: **10MB**

초과 시 `413 Request Entity Too Large` 응답.

## Security Headers

모든 응답에 보안 헤더가 적용됩니다:

| Header | Value |
|--------|-------|
| X-Frame-Options | SAMEORIGIN |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | geolocation=(), microphone=(), camera=() |

API 엔드포인트 추가 헤더:

| Header | Value |
|--------|-------|
| Content-Security-Policy | default-src 'none'; frame-ancestors 'none' |

## CORS

기본적으로 모든 origin이 허용됩니다. 프로덕션 환경에서는 특정 origin만 허용하도록 설정하는 것을 권장합니다.

## Docker Security

### Non-root User

컨테이너는 non-root 사용자(`pondy:pondy`, UID 1000)로 실행됩니다.

```dockerfile
USER pondy
```

### Volume Permissions

마운트된 볼륨의 권한은 entrypoint에서 자동으로 수정됩니다:

```bash
chown -R pondy:pondy /app/data
chown -R pondy:pondy /app/config
```

### Health Check

Docker 헬스체크가 설정되어 있습니다:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
```

## Backup Validation

백업 복원 시 다음 검증이 수행됩니다:

1. SQLite 매직 넘버 확인
2. PRAGMA integrity_check 실행
3. 필수 테이블 존재 확인

손상되거나 유효하지 않은 백업 파일은 복원되지 않습니다.

## Best Practices

### Production Deployment

1. **CORS 설정**: 특정 origin만 허용
2. **Reverse Proxy**: nginx/traefik 뒤에 배치
3. **TLS**: HTTPS 사용 권장
4. **Network**: 내부 네트워크에서만 접근 허용

### Docker Compose Example

```yaml
services:
  pondy:
    image: jiin724/pondy:latest
    user: "1000:1000"
    read_only: true
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp
    volumes:
      - ./config:/app/config:ro
      - pondy-data:/app/data
```
