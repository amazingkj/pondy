package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter implements a token bucket rate limiter
type RateLimiter struct {
	mu       sync.Mutex
	clients  map[string]*clientBucket
	rate     int           // requests per interval
	interval time.Duration // time interval
	burst    int           // max burst size
	cleanup  time.Duration // cleanup interval for expired entries
	stopCh   chan struct{} // channel to signal shutdown
}

type clientBucket struct {
	tokens     int
	lastRefill time.Time
}

// NewRateLimiter creates a new rate limiter
// rate: number of requests allowed per interval
// interval: time window for rate limiting
// burst: maximum burst size (allows short bursts above rate)
func NewRateLimiter(rate int, interval time.Duration, burst int) *RateLimiter {
	rl := &RateLimiter{
		clients:  make(map[string]*clientBucket),
		rate:     rate,
		interval: interval,
		burst:    burst,
		cleanup:  5 * time.Minute,
		stopCh:   make(chan struct{}),
	}

	// Start cleanup goroutine
	go rl.cleanupLoop()

	return rl
}

// Stop stops the rate limiter cleanup goroutine
func (rl *RateLimiter) Stop() {
	close(rl.stopCh)
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanup)
	defer ticker.Stop()

	for {
		select {
		case <-rl.stopCh:
			return
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for ip, bucket := range rl.clients {
				// Remove clients that haven't been seen for 10 minutes
				if now.Sub(bucket.lastRefill) > 10*time.Minute {
					delete(rl.clients, ip)
				}
			}
			rl.mu.Unlock()
		}
	}
}

func (rl *RateLimiter) Allow(clientIP string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	bucket, exists := rl.clients[clientIP]

	if !exists {
		rl.clients[clientIP] = &clientBucket{
			tokens:     rl.burst - 1, // consume one token
			lastRefill: now,
		}
		return true
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(bucket.lastRefill)
	tokensToAdd := int(elapsed / rl.interval) * rl.rate
	if tokensToAdd > 0 {
		bucket.tokens += tokensToAdd
		if bucket.tokens > rl.burst {
			bucket.tokens = rl.burst
		}
		bucket.lastRefill = now
	}

	// Check if we have tokens available
	if bucket.tokens > 0 {
		bucket.tokens--
		return true
	}

	return false
}

// RateLimitMiddleware returns a Gin middleware for rate limiting
func RateLimitMiddleware(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		if !rl.Allow(clientIP) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate limit exceeded",
				"retry_after": "1s",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// StrictRateLimitMiddleware is a stricter rate limiter for sensitive endpoints
func StrictRateLimitMiddleware(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		if !rl.Allow(clientIP) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate limit exceeded for this endpoint",
				"retry_after": "10s",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// MaxBodySizeMiddleware limits the maximum request body size
func MaxBodySizeMiddleware(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error":     "request body too large",
				"max_bytes": maxBytes,
			})
			c.Abort()
			return
		}

		// Also limit the actual body reading
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}

// ConnectionLimiter limits concurrent connections
type ConnectionLimiter struct {
	mu          sync.Mutex
	connections map[string]int
	maxPerIP    int
	maxTotal    int
	total       int
}

// NewConnectionLimiter creates a new connection limiter
func NewConnectionLimiter(maxPerIP, maxTotal int) *ConnectionLimiter {
	return &ConnectionLimiter{
		connections: make(map[string]int),
		maxPerIP:    maxPerIP,
		maxTotal:    maxTotal,
	}
}

func (cl *ConnectionLimiter) Acquire(clientIP string) bool {
	cl.mu.Lock()
	defer cl.mu.Unlock()

	// Check total connections
	if cl.total >= cl.maxTotal {
		return false
	}

	// Check per-IP connections
	if cl.connections[clientIP] >= cl.maxPerIP {
		return false
	}

	cl.connections[clientIP]++
	cl.total++
	return true
}

func (cl *ConnectionLimiter) Release(clientIP string) {
	cl.mu.Lock()
	defer cl.mu.Unlock()

	if cl.connections[clientIP] > 0 {
		cl.connections[clientIP]--
		if cl.connections[clientIP] == 0 {
			delete(cl.connections, clientIP)
		}
	}
	if cl.total > 0 {
		cl.total--
	}
}

// ConnectionLimitMiddleware limits concurrent connections per IP and total
func ConnectionLimitMiddleware(cl *ConnectionLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		if !cl.Acquire(clientIP) {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "too many concurrent connections",
			})
			c.Abort()
			return
		}

		// Ensure we release the connection when done
		defer cl.Release(clientIP)

		c.Next()
	}
}

// SecurityHeadersMiddleware adds security headers to all responses
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prevent clickjacking
		c.Header("X-Frame-Options", "SAMEORIGIN")

		// Prevent MIME type sniffing
		c.Header("X-Content-Type-Options", "nosniff")

		// XSS Protection (legacy browsers)
		c.Header("X-XSS-Protection", "1; mode=block")

		// Referrer Policy
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions Policy (disable unnecessary features)
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

		// Content Security Policy for API responses
		// Note: Frontend serves its own CSP via meta tag or separate config
		if len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api" {
			c.Header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		}

		c.Next()
	}
}

// CORSMiddleware handles Cross-Origin Resource Sharing
// allowedOrigins: list of allowed origins, or ["*"] for all (not recommended for production)
func CORSMiddleware(allowedOrigins []string) gin.HandlerFunc {
	allowAll := len(allowedOrigins) == 1 && allowedOrigins[0] == "*"

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// Check if origin is allowed
		allowed := false
		if allowAll {
			allowed = true
		} else {
			for _, o := range allowedOrigins {
				if o == origin {
					allowed = true
					break
				}
			}
		}

		if allowed && origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")
			c.Header("Access-Control-Max-Age", "86400")
			c.Header("Access-Control-Allow-Credentials", "true")
		}

		// Handle preflight requests
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
