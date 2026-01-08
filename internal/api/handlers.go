package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jiin/pondy/internal/analyzer"
	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
	"github.com/jiin/pondy/internal/report"
	"github.com/jiin/pondy/internal/storage"
)

type Handler struct {
	cfg   *config.Config
	store storage.Storage
}

func NewHandler(cfg *config.Config, store storage.Storage) *Handler {
	return &Handler{
		cfg:   cfg,
		store: store,
	}
}

type TargetsResponse struct {
	Targets []models.TargetStatus `json:"targets"`
}

func (h *Handler) GetTargets(c *gin.Context) {
	var targets []models.TargetStatus

	// Get configured targets
	for _, t := range h.cfg.Targets {
		status := models.TargetStatus{
			Name:   t.Name,
			Status: "unknown",
		}

		// Get all instances for this target
		instanceMetrics, err := h.store.GetLatestAllInstances(t.Name)
		if err == nil && len(instanceMetrics) > 0 {
			// Build instance statuses
			var instances []models.InstanceStatus
			var totalActive, totalIdle, totalPending, totalMax int
			worstStatus := "healthy"

			for _, m := range instanceMetrics {
				instStatus := h.determineStatus(&m)
				instances = append(instances, models.InstanceStatus{
					InstanceName: m.InstanceName,
					Status:       instStatus,
					Current:      &m,
				})

				totalActive += m.Active
				totalIdle += m.Idle
				totalPending += m.Pending
				totalMax += m.Max

				// Track worst status
				if instStatus == "critical" || (instStatus == "warning" && worstStatus == "healthy") {
					worstStatus = instStatus
				}
			}

			status.Instances = instances
			status.Status = worstStatus

			// Set aggregated current metrics (for backward compatibility)
			if len(instanceMetrics) == 1 {
				status.Current = &instanceMetrics[0]
			} else {
				status.Current = &models.PoolMetrics{
					TargetName:   t.Name,
					InstanceName: "aggregated",
					Active:       totalActive,
					Idle:         totalIdle,
					Pending:      totalPending,
					Max:          totalMax,
				}
			}
		} else {
			// Fallback to old behavior
			metrics, err := h.store.GetLatest(t.Name)
			if err == nil && metrics != nil {
				status.Current = metrics
				status.Status = h.determineStatus(metrics)
			}
		}

		targets = append(targets, status)
	}

	c.JSON(http.StatusOK, TargetsResponse{Targets: targets})
}

func (h *Handler) GetInstances(c *gin.Context) {
	name := c.Param("name")

	instances, err := h.store.GetInstances(name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"target_name": name, "instances": instances})
}

func (h *Handler) GetTargetMetrics(c *gin.Context) {
	name := c.Param("name")

	metrics, err := h.store.GetLatest(name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if metrics == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no metrics found"})
		return
	}

	c.JSON(http.StatusOK, metrics)
}

func (h *Handler) GetTargetHistory(c *gin.Context) {
	name := c.Param("name")
	instance := c.Query("instance")
	rangeParam := c.DefaultQuery("range", "1h")

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	var datapoints []models.PoolMetrics
	if instance != "" {
		datapoints, err = h.store.GetHistoryByInstance(name, instance, from, to)
	} else {
		datapoints, err = h.store.GetHistory(name, from, to)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.HistoryResponse{
		TargetName: name,
		Datapoints: datapoints,
	})
}

func (h *Handler) GetRecommendations(c *gin.Context) {
	name := c.Param("name")
	rangeParam := c.DefaultQuery("range", "1h")

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	datapoints, err := h.store.GetHistory(name, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(datapoints) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no data available for analysis"})
		return
	}

	result := analyzer.Analyze(datapoints)
	c.JSON(http.StatusOK, result)
}

func (h *Handler) DetectLeaks(c *gin.Context) {
	name := c.Param("name")
	rangeParam := c.DefaultQuery("range", "1h")

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	datapoints, err := h.store.GetHistory(name, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(datapoints) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no data available for analysis"})
		return
	}

	result := analyzer.DetectLeaks(datapoints)
	c.JSON(http.StatusOK, result)
}

func (h *Handler) ExportCSV(c *gin.Context) {
	name := c.Param("name")
	rangeParam := c.DefaultQuery("range", "24h")

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = 24 * time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	datapoints, err := h.store.GetHistory(name, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("%s_%s.csv", name, time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	// Write header
	writer.Write([]string{"timestamp", "active", "idle", "pending", "max", "timeout", "acquire_p99"})

	// Write data
	for _, d := range datapoints {
		writer.Write([]string{
			d.Timestamp.Format(time.RFC3339),
			fmt.Sprintf("%d", d.Active),
			fmt.Sprintf("%d", d.Idle),
			fmt.Sprintf("%d", d.Pending),
			fmt.Sprintf("%d", d.Max),
			fmt.Sprintf("%d", d.Timeout),
			fmt.Sprintf("%.2f", d.AcquireP99),
		})
	}
}

func (h *Handler) GetPeakTime(c *gin.Context) {
	name := c.Param("name")
	rangeParam := c.DefaultQuery("range", "24h")

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = 24 * time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	datapoints, err := h.store.GetHistory(name, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(datapoints) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no data available for analysis"})
		return
	}

	result := analyzer.AnalyzePeakTime(name, datapoints)
	c.JSON(http.StatusOK, result)
}

func (h *Handler) DetectAnomalies(c *gin.Context) {
	name := c.Param("name")
	rangeParam := c.DefaultQuery("range", "24h")

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = 24 * time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	datapoints, err := h.store.GetHistory(name, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(datapoints) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no data available for analysis"})
		return
	}

	result := analyzer.DetectAnomalies(name, datapoints)
	c.JSON(http.StatusOK, result)
}

func (h *Handler) ComparePeriods(c *gin.Context) {
	name := c.Param("name")
	period := c.DefaultQuery("period", "day") // "day" or "week"

	var duration time.Duration
	switch period {
	case "week":
		duration = 7 * 24 * time.Hour
	default:
		duration = 24 * time.Hour
		period = "day"
	}

	now := time.Now()

	// Current period
	currentTo := now
	currentFrom := now.Add(-duration)

	// Previous period
	previousTo := currentFrom
	previousFrom := previousTo.Add(-duration)

	currentMetrics, err := h.store.GetHistory(name, currentFrom, currentTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	previousMetrics, err := h.store.GetHistory(name, previousFrom, previousTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(currentMetrics) == 0 && len(previousMetrics) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no data available for comparison"})
		return
	}

	result := analyzer.ComparePeriods(name, currentMetrics, previousMetrics, period)
	c.JSON(http.StatusOK, result)
}

func (h *Handler) determineStatus(m *models.PoolMetrics) string {
	if m.Max == 0 {
		return "unknown"
	}

	usage := float64(m.Active) / float64(m.Max)
	if usage > 0.9 {
		return "critical"
	}
	if usage > 0.7 {
		return "warning"
	}
	if m.Pending > 0 {
		return "warning"
	}
	return "healthy"
}

func (h *Handler) GenerateReport(c *gin.Context) {
	name := c.Param("name")
	rangeParam := c.DefaultQuery("range", "24h")

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = 24 * time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	// Gather all data
	datapoints, err := h.store.GetHistory(name, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(datapoints) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no data available for report"})
		return
	}

	// Run analysis
	recs := analyzer.Analyze(datapoints)
	leaks := analyzer.DetectLeaks(datapoints)
	anomalies := analyzer.DetectAnomalies(name, datapoints)
	peakTime := analyzer.AnalyzePeakTime(name, datapoints)

	// Build report data
	reportData := report.BuildReportData(name, rangeParam, datapoints, recs, leaks, anomalies, peakTime)

	// Generate HTML report
	htmlBytes, err := report.GenerateHTMLReport(reportData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html", htmlBytes)
}
