# Backup & Restore

SQLite 데이터베이스 백업 및 복원 기능입니다.

## Backup

### Create Backup

서버에 백업 파일을 생성합니다.

```bash
curl -X POST http://localhost:8080/api/backup
```

**Response:**
```json
{
  "message": "Backup created successfully",
  "path": "/app/data/backup/pondy-20240115-120000.db"
}
```

### Download Backup

백업 파일을 다운로드합니다.

```bash
curl http://localhost:8080/api/backup/download > pondy-backup.db
```

## Restore

백업 파일에서 데이터베이스를 복원합니다.

```bash
curl -X POST http://localhost:8080/api/backup/restore \
  -F "file=@pondy-backup.db"
```

**Response:**
```json
{
  "message": "Database restored successfully"
}
```

## Notes

- 복원 전 현재 데이터베이스는 자동으로 백업됩니다.
- 복원 후 서비스가 자동으로 재시작됩니다.
- 백업 파일은 SQLite 형식이어야 합니다.
- 손상된 백업 파일은 복원되지 않습니다 (무결성 검사 수행).

## Docker Volume

Docker 사용 시 백업 파일 위치:

```bash
# 볼륨 내 백업 파일 확인
docker exec pondy ls -la /app/data/backup/

# 컨테이너에서 호스트로 복사
docker cp pondy:/app/data/backup/pondy-backup.db ./
```

## Automated Backup

cron을 사용한 자동 백업 예시:

```bash
# 매일 새벽 3시 백업
0 3 * * * curl -X POST http://localhost:8080/api/backup
```
