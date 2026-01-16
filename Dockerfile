FROM node:20-alpine AS frontend

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Copy frontend build to embed location
COPY --from=frontend /app/web/dist ./cmd/pondy/web/dist

# Build the main application
RUN CGO_ENABLED=0 GOOS=linux go build -o pondy ./cmd/pondy

# Build the mock server
RUN CGO_ENABLED=0 GOOS=linux go build -o pondy-mock ./cmd/mock

FROM alpine:3.19

RUN apk --no-cache add ca-certificates su-exec

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1000 pondy && \
    adduser -u 1000 -G pondy -s /bin/sh -D pondy

# Copy both binaries
COPY --from=builder /app/pondy .
COPY --from=builder /app/pondy-mock .

# Copy entrypoint script
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# Create data directory
RUN mkdir -p /app/data && chown -R pondy:pondy /app

EXPOSE 8080 9090

# Healthcheck for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pondy"]