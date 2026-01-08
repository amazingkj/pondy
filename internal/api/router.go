package api

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/storage"
)

func NewRouter(cfg *config.Config, store storage.Storage, webFS embed.FS) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	handler := NewHandler(cfg, store)

	api := r.Group("/api")
	{
		api.GET("/targets", handler.GetTargets)
		api.GET("/targets/:name/metrics", handler.GetTargetMetrics)
		api.GET("/targets/:name/history", handler.GetTargetHistory)
		api.GET("/targets/:name/recommendations", handler.GetRecommendations)
		api.GET("/targets/:name/leaks", handler.DetectLeaks)
		api.GET("/targets/:name/export", handler.ExportCSV)
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
