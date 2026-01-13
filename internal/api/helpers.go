package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Common default durations
const (
	DefaultRangeShort = time.Hour
	DefaultRangeLong  = 24 * time.Hour
)

// TimeRange represents a time range with from and to timestamps
type TimeRange struct {
	From time.Time
	To   time.Time
}

// ParseTimeRange parses a duration string and returns a TimeRange
// If parsing fails, it uses the provided default duration
func ParseTimeRange(rangeParam string, defaultDuration time.Duration) TimeRange {
	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = defaultDuration
	}

	to := time.Now()
	from := to.Add(-duration)

	return TimeRange{From: from, To: to}
}

// ParseTimeRangeFromContext extracts and parses time range from gin context
func ParseTimeRangeFromContext(c *gin.Context, defaultDuration time.Duration) TimeRange {
	rangeParam := c.DefaultQuery("range", formatDuration(defaultDuration))
	return ParseTimeRange(rangeParam, defaultDuration)
}

// formatDuration formats a duration for use as default query value
func formatDuration(d time.Duration) string {
	if d >= 24*time.Hour {
		return "24h"
	}
	return "1h"
}

// RespondError sends a JSON error response
func RespondError(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, gin.H{"error": message})
}

// RespondInternalError sends a 500 error response
func RespondInternalError(c *gin.Context, err error) {
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

// RespondNotFound sends a 404 error response
func RespondNotFound(c *gin.Context, message string) {
	c.JSON(http.StatusNotFound, gin.H{"error": message})
}

// RespondBadRequest sends a 400 error response
func RespondBadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": message})
}

// RespondNoData sends a standard "no data available" response
func RespondNoData(c *gin.Context) {
	RespondNotFound(c, "no data available for analysis")
}
