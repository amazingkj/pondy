package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jiin/pondy/internal/analyzer"
	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
	"github.com/jiin/pondy/internal/report"
	"github.com/jiin/pondy/internal/storage"
)

// Cache entry for targets response
type cacheEntry struct {
	data      TargetsResponse
	timestamp time.Time
}

type Handler struct {
	cfgMgr       *config.Manager
	store        storage.Storage
	cache        *cacheEntry
	cacheMu      sync.RWMutex
	cacheTTL     time.Duration
}

func NewHandler(cfgMgr *config.Manager, store storage.Storage) *Handler {
	h := &Handler{
		cfgMgr:   cfgMgr,
		store:    store,
		cacheTTL: 2 * time.Second, // 2 second cache TTL
	}

	// Invalidate cache when config reloads
	cfgMgr.OnReload(func(*config.Config) {
		h.InvalidateCache()
	})

	return h
}

// cfg returns the current config (for hot reload support)
func (h *Handler) cfg() *config.Config {
	return h.cfgMgr.Get()
}

// InvalidateCache clears the targets cache
func (h *Handler) InvalidateCache() {
	h.cacheMu.Lock()
	h.cache = nil
	h.cacheMu.Unlock()
}

type TargetsResponse struct {
	Targets []models.TargetStatus `json:"targets"`
	Groups  []string              `json:"groups,omitempty"`
}

// GetSettings returns client-side settings like timezone
func (h *Handler) GetSettings(c *gin.Context) {
	timezone := h.cfg().Timezone
	if timezone == "" {
		timezone = "Local"
	}

	c.JSON(http.StatusOK, gin.H{
		"timezone": timezone,
	})
}

func (h *Handler) GetTargets(c *gin.Context) {
	// Check cache first
	h.cacheMu.RLock()
	if h.cache != nil && time.Since(h.cache.timestamp) < h.cacheTTL {
		response := h.cache.data
		h.cacheMu.RUnlock()
		c.JSON(http.StatusOK, response)
		return
	}
	h.cacheMu.RUnlock()

	var targets []models.TargetStatus

	// Get configured targets
	for _, t := range h.cfg().Targets {
		status := models.TargetStatus{
			Name:   t.Name,
			Group:  t.Group,
			Status: "unknown",
		}

		// Calculate stale threshold (3x the collection interval, minimum 30s)
		staleThreshold := t.Interval * 3
		if staleThreshold < 30*time.Second {
			staleThreshold = 30 * time.Second
		}

		// Get all instances for this target
		instanceMetrics, err := h.store.GetLatestAllInstances(t.Name)
		if err == nil && len(instanceMetrics) > 0 {
			// Build instance statuses
			var instances []models.InstanceStatus
			var totalActive, totalIdle, totalPending, totalMax int
			worstStatus := "healthy"
			allStale := true

			for _, m := range instanceMetrics {
				// Check if metrics are stale
				isStale := time.Since(m.Timestamp) > staleThreshold
				if !isStale {
					allStale = false
				}

				instStatus := h.determineStatus(&m)
				if isStale {
					instStatus = "unknown"
				}

				// Only include non-stale metrics in current data
				var currentMetrics *models.PoolMetrics
				if !isStale {
					currentMetrics = &m
					totalActive += m.Active
					totalIdle += m.Idle
					totalPending += m.Pending
					totalMax += m.Max
				}

				instances = append(instances, models.InstanceStatus{
					InstanceName: m.InstanceName,
					Status:       instStatus,
					Current:      currentMetrics,
				})

				// Track worst status
				if !isStale {
					if instStatus == "critical" || (instStatus == "warning" && worstStatus == "healthy") {
						worstStatus = instStatus
					}
				}
			}

			status.Instances = instances

			// If all instances are stale, mark target as unknown with no current data
			if allStale {
				status.Status = "unknown"
				status.Current = nil
			} else {
				status.Status = worstStatus
				// Set aggregated current metrics (for backward compatibility)
				if len(instanceMetrics) == 1 && time.Since(instanceMetrics[0].Timestamp) <= staleThreshold {
					status.Current = &instanceMetrics[0]
				} else if totalMax > 0 {
					status.Current = &models.PoolMetrics{
						TargetName:   t.Name,
						InstanceName: "aggregated",
						Active:       totalActive,
						Idle:         totalIdle,
						Pending:      totalPending,
						Max:          totalMax,
					}
				}
			}
		} else {
			// Fallback to old behavior
			metrics, err := h.store.GetLatest(t.Name)
			if err == nil && metrics != nil {
				// Check if metrics are stale
				if time.Since(metrics.Timestamp) > staleThreshold {
					status.Status = "unknown"
					status.Current = nil
				} else {
					status.Current = metrics
					status.Status = h.determineStatus(metrics)
				}
			}
		}

		targets = append(targets, status)
	}

	// Collect unique groups
	groupSet := make(map[string]bool)
	for _, t := range h.cfg().Targets {
		if t.Group != "" {
			groupSet[t.Group] = true
		}
	}
	var groups []string
	for g := range groupSet {
		groups = append(groups, g)
	}

	response := TargetsResponse{Targets: targets, Groups: groups}

	// Update cache
	h.cacheMu.Lock()
	h.cache = &cacheEntry{
		data:      response,
		timestamp: time.Now(),
	}
	h.cacheMu.Unlock()

	c.JSON(http.StatusOK, response)
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

	result := analyzer.Analyze(datapoints, h.cfg().GetLocation())
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

	result := analyzer.DetectLeaks(datapoints, h.cfg().GetLocation())
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

	loc := h.cfg().GetLocation()
	filename := fmt.Sprintf("%s_%s.csv", name, time.Now().In(loc).Format("20060102_150405"))
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	// Write header
	writer.Write([]string{"timestamp", "status", "active", "idle", "pending", "max", "timeout", "acquire_p99", "heap_used", "heap_max", "non_heap_used", "threads_live", "cpu_usage"})

	// Write data
	for _, d := range datapoints {
		writer.Write([]string{
			d.Timestamp.In(loc).Format(time.RFC3339),
			d.Status,
			fmt.Sprintf("%d", d.Active),
			fmt.Sprintf("%d", d.Idle),
			fmt.Sprintf("%d", d.Pending),
			fmt.Sprintf("%d", d.Max),
			fmt.Sprintf("%d", d.Timeout),
			fmt.Sprintf("%.2f", d.AcquireP99),
			fmt.Sprintf("%d", d.HeapUsed),
			fmt.Sprintf("%d", d.HeapMax),
			fmt.Sprintf("%d", d.NonHeapUsed),
			fmt.Sprintf("%d", d.ThreadsLive),
			fmt.Sprintf("%.4f", d.CpuUsage),
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

	result := analyzer.AnalyzePeakTime(name, datapoints, h.cfg().GetLocation())
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

	result := analyzer.DetectAnomalies(name, datapoints, h.cfg().GetLocation())
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

	result := analyzer.ComparePeriods(name, currentMetrics, previousMetrics, period, h.cfg().GetLocation())
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
	recs := analyzer.Analyze(datapoints, h.cfg().GetLocation())
	leaks := analyzer.DetectLeaks(datapoints, h.cfg().GetLocation())
	anomalies := analyzer.DetectAnomalies(name, datapoints, h.cfg().GetLocation())
	peakTime := analyzer.AnalyzePeakTime(name, datapoints, h.cfg().GetLocation())

	// Build report data
	reportData := report.BuildReportData(name, rangeParam, datapoints, recs, leaks, anomalies, peakTime, h.cfg().GetLocation())

	// Generate HTML report
	htmlBytes, err := report.GenerateHTMLReport(&reportData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html", htmlBytes)
}

func (h *Handler) GenerateCombinedReport(c *gin.Context) {
	targetsParam := c.Query("targets")
	rangeParam := c.DefaultQuery("range", "24h")

	if targetsParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "targets parameter is required"})
		return
	}

	duration, err := time.ParseDuration(rangeParam)
	if err != nil {
		duration = 24 * time.Hour
	}

	to := time.Now()
	from := to.Add(-duration)

	// Parse target names
	var targetNames []string
	for _, name := range splitAndTrim(targetsParam, ",") {
		if name != "" {
			targetNames = append(targetNames, name)
		}
	}

	if len(targetNames) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no valid targets specified"})
		return
	}

	// Collect reports for all targets
	var allReports []report.ReportData
	for _, name := range targetNames {
		datapoints, err := h.store.GetHistory(name, from, to)
		if err != nil || len(datapoints) == 0 {
			continue
		}

		recs := analyzer.Analyze(datapoints, h.cfg().GetLocation())
		leaks := analyzer.DetectLeaks(datapoints, h.cfg().GetLocation())
		anomalies := analyzer.DetectAnomalies(name, datapoints, h.cfg().GetLocation())
		peakTime := analyzer.AnalyzePeakTime(name, datapoints, h.cfg().GetLocation())

		reportData := report.BuildReportData(name, rangeParam, datapoints, recs, leaks, anomalies, peakTime, h.cfg().GetLocation())
		allReports = append(allReports, reportData)
	}

	if len(allReports) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no data available for any target"})
		return
	}

	// Generate combined HTML report
	htmlBytes, err := report.GenerateCombinedHTMLReport(allReports, rangeParam, h.cfg().GetLocation())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html", htmlBytes)
}

func splitAndTrim(s, sep string) []string {
	var result []string
	for _, part := range splitString(s, sep) {
		trimmed := trimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func splitString(s, sep string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if i+len(sep) <= len(s) && s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}
