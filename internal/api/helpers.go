package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jiin/pondy/internal/models"
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

// ErrorResponse represents a structured error response
type ErrorResponse struct {
	Error      string `json:"error"`
	StatusCode int    `json:"status_code"`
	Status     string `json:"status"`
}

// RespondError sends a JSON error response with status code
func RespondError(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, ErrorResponse{
		Error:      message,
		StatusCode: statusCode,
		Status:     http.StatusText(statusCode),
	})
}

// RespondInternalError sends a 500 error response
func RespondInternalError(c *gin.Context, err error) {
	c.JSON(http.StatusInternalServerError, ErrorResponse{
		Error:      err.Error(),
		StatusCode: http.StatusInternalServerError,
		Status:     http.StatusText(http.StatusInternalServerError),
	})
}

// RespondNotFound sends a 404 error response
func RespondNotFound(c *gin.Context, message string) {
	c.JSON(http.StatusNotFound, ErrorResponse{
		Error:      message,
		StatusCode: http.StatusNotFound,
		Status:     http.StatusText(http.StatusNotFound),
	})
}

// RespondBadRequest sends a 400 error response
func RespondBadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, ErrorResponse{
		Error:      message,
		StatusCode: http.StatusBadRequest,
		Status:     http.StatusText(http.StatusBadRequest),
	})
}

// RespondNoData sends a standard "no data available" response
func RespondNoData(c *gin.Context) {
	RespondNotFound(c, "no data available for analysis")
}

// downsampleMetrics reduces data points to maxPoints using time-bucket averaging
func downsampleMetrics(data []models.PoolMetrics, maxPoints int) []models.PoolMetrics {
	if maxPoints <= 0 || len(data) <= maxPoints {
		return data
	}

	bucketSize := len(data) / maxPoints
	if bucketSize < 1 {
		bucketSize = 1
	}

	result := make([]models.PoolMetrics, 0, maxPoints)

	for i := 0; i < len(data); i += bucketSize {
		end := i + bucketSize
		if end > len(data) {
			end = len(data)
		}

		bucket := data[i:end]
		if len(bucket) == 0 {
			continue
		}

		// Aggregate bucket values
		var sumActive, sumIdle, sumPending, sumMax int
		var sumHeapUsed, sumHeapMax, sumNonHeapUsed int64
		var sumThreadsLive int
		var sumGcCount, sumYoungGcCount, sumOldGcCount int64
		var sumCpuUsage, sumGcTime float64

		for _, m := range bucket {
			sumActive += m.Active
			sumIdle += m.Idle
			sumPending += m.Pending
			sumMax += m.Max
			sumHeapUsed += m.HeapUsed
			sumHeapMax += m.HeapMax
			sumNonHeapUsed += m.NonHeapUsed
			sumThreadsLive += m.ThreadsLive
			sumCpuUsage += m.CpuUsage
			sumGcCount += m.GcCount
			sumGcTime += m.GcTime
			sumYoungGcCount += m.YoungGcCount
			sumOldGcCount += m.OldGcCount
		}

		n := len(bucket)
		n64 := int64(n)
		aggregated := models.PoolMetrics{
			TargetName:   bucket[0].TargetName,
			InstanceName: bucket[0].InstanceName,
			Status:       bucket[n/2].Status, // Use middle point status
			Active:       sumActive / n,
			Idle:         sumIdle / n,
			Pending:      sumPending / n,
			Max:          sumMax / n,
			HeapUsed:     sumHeapUsed / n64,
			HeapMax:      sumHeapMax / n64,
			NonHeapUsed:  sumNonHeapUsed / n64,
			ThreadsLive:  sumThreadsLive / n,
			CpuUsage:     sumCpuUsage / float64(n),
			GcCount:      sumGcCount / n64,
			GcTime:       sumGcTime / float64(n),
			YoungGcCount: sumYoungGcCount / n64,
			OldGcCount:   sumOldGcCount / n64,
			Timestamp:    bucket[n/2].Timestamp, // Use middle point timestamp
		}

		result = append(result, aggregated)
	}

	return result
}
