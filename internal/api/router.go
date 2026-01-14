package api

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jiin/pondy/internal/alerter"
	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/storage"
)

func NewRouter(cfgMgr *config.Manager, store storage.Storage, alertMgr *alerter.Manager, webFS embed.FS) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// Rate limiters
	// General API: 100 requests per second, burst of 200
	generalRL := NewRateLimiter(100, time.Second, 200)
	// Strict: 10 requests per second, burst of 20 (for expensive endpoints)
	strictRL := NewRateLimiter(10, time.Second, 20)
	// Test alert: 1 request per 10 seconds, burst of 3
	testAlertRL := NewRateLimiter(1, 10*time.Second, 3)

	// Connection limiter: max 50 per IP, 500 total
	connLimiter := NewConnectionLimiter(50, 500)

	// Global middlewares
	r.Use(SecurityHeadersMiddleware())
	r.Use(CORSMiddleware([]string{"*"})) // Allow all origins; configure for production
	r.Use(ConnectionLimitMiddleware(connLimiter))
	r.Use(MaxBodySizeMiddleware(10 * 1024 * 1024)) // 10MB max body size

	handler := NewHandler(cfgMgr, store, alertMgr)

	api := r.Group("/api")
	api.Use(RateLimitMiddleware(generalRL))
	{
		api.GET("/settings", handler.GetSettings)
		api.GET("/targets", handler.GetTargets)
		api.GET("/targets/:name/instances", handler.GetInstances)
		api.GET("/targets/:name/metrics", handler.GetTargetMetrics)
		api.GET("/targets/:name/history", handler.GetTargetHistory)
		api.GET("/targets/:name/recommendations", handler.GetRecommendations)
		api.GET("/targets/:name/leaks", handler.DetectLeaks)
		api.GET("/targets/:name/peaktime", handler.GetPeakTime)

		// CPU/Memory intensive endpoints - stricter rate limiting
		api.GET("/targets/:name/export", StrictRateLimitMiddleware(strictRL), handler.ExportCSV)
		api.GET("/targets/:name/anomalies", StrictRateLimitMiddleware(strictRL), handler.DetectAnomalies)
		api.GET("/targets/:name/compare", StrictRateLimitMiddleware(strictRL), handler.ComparePeriods)
		api.GET("/targets/:name/report", StrictRateLimitMiddleware(strictRL), handler.GenerateReport)
		api.GET("/report/combined", StrictRateLimitMiddleware(strictRL), handler.GenerateCombinedReport)
		api.GET("/export/all", StrictRateLimitMiddleware(strictRL), handler.ExportAllCSV)

		// Alert endpoints
		api.GET("/alerts", handler.GetAlerts)
		api.GET("/alerts/active", handler.GetActiveAlerts)
		api.GET("/alerts/stats", handler.GetAlertStats)
		api.GET("/alerts/channels", handler.GetAlertChannels)
		api.GET("/alerts/:id", handler.GetAlert)
		api.POST("/alerts/:id/resolve", handler.ResolveAlert)
		// Test alert has very strict rate limiting to prevent external service abuse
		api.POST("/alerts/test", StrictRateLimitMiddleware(testAlertRL), handler.TestAlert)

		// Alert Rule endpoints
		api.GET("/rules", handler.GetAlertRules)
		api.GET("/rules/:id", handler.GetAlertRule)
		api.POST("/rules", handler.CreateAlertRule)
		api.PUT("/rules/:id", handler.UpdateAlertRule)
		api.DELETE("/rules/:id", handler.DeleteAlertRule)
		api.PATCH("/rules/:id/toggle", handler.ToggleAlertRule)

		// Backup endpoints - stricter rate limiting
		api.POST("/backup", StrictRateLimitMiddleware(strictRL), handler.CreateBackup)
		api.GET("/backup/download", StrictRateLimitMiddleware(strictRL), handler.DownloadBackup)
		api.POST("/backup/restore", StrictRateLimitMiddleware(strictRL), handler.RestoreBackup)

		// Target config CRUD endpoints
		api.GET("/config/targets", handler.GetConfigTargets)
		api.POST("/config/targets", handler.AddConfigTarget)
		api.PUT("/config/targets/:name", handler.UpdateConfigTarget)
		api.DELETE("/config/targets/:name", handler.DeleteConfigTarget)

		// Alerting config endpoints
		api.GET("/config/alerting", handler.GetAlertingConfig)
		api.PUT("/config/alerting", handler.UpdateAlertingConfig)

		// Maintenance Window endpoints
		api.GET("/maintenance", handler.GetMaintenanceWindows)
		api.GET("/maintenance/active", handler.GetActiveMaintenanceWindows)
		api.GET("/maintenance/:id", handler.GetMaintenanceWindow)
		api.POST("/maintenance", handler.CreateMaintenanceWindow)
		api.PUT("/maintenance/:id", handler.UpdateMaintenanceWindow)
		api.DELETE("/maintenance/:id", handler.DeleteMaintenanceWindow)
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Serve static files from embedded filesystem
	distFS, err := fs.Sub(webFS, "web/dist")
	if err != nil {
		return r
	}

	staticHandler := http.FileServer(http.FS(distFS))
	r.GET("/", func(c *gin.Context) {
		staticHandler.ServeHTTP(c.Writer, c.Request)
	})
	r.GET("/assets/*filepath", func(c *gin.Context) {
		staticHandler.ServeHTTP(c.Writer, c.Request)
	})
	r.GET("/pondy.svg", func(c *gin.Context) {
		staticHandler.ServeHTTP(c.Writer, c.Request)
	})
	r.NoRoute(func(c *gin.Context) {
		// Serve index.html for SPA routes (but not for API or assets)
		if !strings.HasPrefix(c.Request.URL.Path, "/api") &&
			!strings.HasPrefix(c.Request.URL.Path, "/assets") {
			c.Request.URL.Path = "/"
			staticHandler.ServeHTTP(c.Writer, c.Request)
			return
		}
		c.JSON(404, gin.H{"error": "not found"})
	})

	return r
}
