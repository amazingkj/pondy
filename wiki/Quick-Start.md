# Quick Start

Pondy를 빠르게 시작하는 방법입니다.

## Docker (Recommended)

### 기본 실행

```bash
# 1. 설정 파일 준비
mkdir -p config
cat > config/config.yaml << 'EOF'
server:
  port: 8080

storage:
  path: /app/data/pondy.db

targets:
  - name: my-service
    type: actuator
    endpoint: http://host.docker.internal:8080/actuator/metrics
    interval: 10s
EOF

# 2. 실행
docker run -d \
  --name pondy \
  -p 8080:8080 \
  -v $(pwd)/config:/app/config \
  -v pondy-data:/app/data \
  jiin724/pondy:latest

# 3. 브라우저에서 열기
open http://localhost:8080
```

### Docker Compose

```bash
# 1. docker-compose.yml 다운로드
curl -O https://raw.githubusercontent.com/jiin724/pondy/main/docker-compose.yml

# 2. 설정 파일 준비
mkdir -p config
curl -o config/config.yaml https://raw.githubusercontent.com/jiin724/pondy/main/config.example.yaml

# 3. 실행
docker-compose up -d
```

## Demo Mode

실제 Spring Boot 앱 없이 테스트할 수 있는 Mock 서버와 함께 실행합니다.

```bash
docker-compose --profile demo up -d
```

Mock 서버가 `localhost:9090`에서 실행되며, 가상의 HikariCP 메트릭을 생성합니다.

## From Source

### Prerequisites

- Go 1.22+
- Node.js 20+ (프론트엔드 빌드용)

### Build & Run

```bash
# 1. 저장소 클론
git clone https://github.com/jiin724/pondy.git
cd pondy

# 2. 프론트엔드 빌드
cd web && npm ci && npm run build && cd ..

# 3. 실행
go run ./cmd/pondy -config config.example.yaml
```

### Development Mode

```bash
# 터미널 1: Mock 서버 실행
go run ./cmd/mock -port 9090 -max 20

# 터미널 2: Pondy 실행
go run ./cmd/pondy -config config.example.yaml

# 터미널 3: 프론트엔드 개발 서버 (선택)
cd web && npm run dev
```

## Verify Installation

```bash
# 헬스 체크
curl http://localhost:8080/health

# 타겟 목록 확인
curl http://localhost:8080/api/targets
```

## Spring Boot Configuration

모니터링 대상 Spring Boot 앱에서 Actuator를 활성화해야 합니다.

### build.gradle

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
}
```

### application.yml

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,metrics
  endpoint:
    health:
      show-details: always
```

### 확인

```bash
# 메트릭 엔드포인트 테스트
curl http://localhost:8080/actuator/metrics/hikaricp.connections.active
```

## Next Steps

- [Configuration](Configuration) - 상세 설정 방법
- [Multi-Instance Support](Multi-Instance-Support) - 다중 인스턴스 모니터링
- [Alerting](Alerting) - 알림 설정
