FROM node:20-alpine AS frontend

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.22-alpine AS builder

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

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy both binaries
COPY --from=builder /app/pondy .
COPY --from=builder /app/pondy-mock .

# Copy entrypoint script
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

EXPOSE 8080 9090

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pondy"]