package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jiin/pondy/internal/alerter"
	"github.com/jiin/pondy/internal/analyzer"
	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
	"github.com/jiin/pondy/internal/report"
	"github.com/jiin/pondy/internal/storage"
)

// Status thresholds
const (
	CriticalUsageThreshold = 0.9
	WarningUsageThreshold  = 0.7
	StaleMultiplier        = 3
	MinStaleThreshold      = 30 * time.Second
)

// Cache entry for targets response
type cacheEntry struct {
	data      TargetsResponse
	timestamp time.Time
}

type Handler struct {
	cfgMgr   *config.Manager
	store    storage.Storage
	alertMgr *alerter.Manager
	cache    *cacheEntry
	cacheMu  sync.RWMutex
	cacheTTL time.Duration
}

func NewHandler(cfgMgr *config.Manager, store storage.Storage, alertMgr *alerter.Manager) *Handler {
	h := &Handler{
		cfgMgr:   cfgMgr,
		store:    store,
		alertMgr: alertMgr,
		cacheTTL: 2 * time.Second,
	}

	cfgMgr.OnReload(func(*config.Config) {
		h.InvalidateCache()
	})

	return h
}

func (h *Handler) cfg() *config.Config {
	return h.cfgMgr.Get()
}

func (h *Handler) InvalidateCache() {
	h.cacheMu.Lock()
	h.cache = nil
	h.cacheMu.Unlock()
}

type TargetsResponse struct {
	Targets []models.TargetStatus `json:"targets"`
	Groups  []string              `json:"groups,omitempty"`
}

func (h *Handler) GetSettings(c *gin.Context) {
	timezone := h.cfg().Timezone
	if timezone == "" {
		timezone = "Local"
	}
	c.JSON(http.StatusOK, gin.H{"timezone": timezone})
}

func (h *Handler) GetTargets(c *gin.Context) {
	// Check cache with proper locking - copy data while holding lock to avoid race
	h.cacheMu.RLock()
	if h.cache != nil && time.Since(h.cache.timestamp) < h.cacheTTL {
		// Deep copy the response while holding the lock
		response := TargetsResponse{
			Targets: make([]models.TargetStatus, len(h.cache.data.Targets)),
			Groups:  make([]string, len(h.cache.data.Groups)),
		}
		copy(response.Targets, h.cache.data.Targets)
		copy(response.Groups, h.cache.data.Groups)
		h.cacheMu.RUnlock()
		c.JSON(http.StatusOK, response)
		return
	}
	h.cacheMu.RUnlock()

	var targets []models.TargetStatus

	for _, t := range h.cfg().Targets {
		status := models.TargetStatus{
			Name:   t.Name,
			Group:  t.Group,
			Status: "unknown",
		}

		// Build set of valid instance IDs from config
		validInstances := make(map[string]bool)
		for _, inst := range t.GetInstances() {
			validInstances[inst.ID] = true
		}

		staleThreshold := h.calculateStaleThreshold(t.Interval)
		instanceMetrics, err := h.store.GetLatestAllInstances(t.Name)

		// Filter to only include instances that are in current config
		if err == nil && len(instanceMetrics) > 0 {
			var filteredMetrics []models.PoolMetrics
			for _, m := range instanceMetrics {
				if validInstances[m.InstanceName] {
					filteredMetrics = append(filteredMetrics, m)
				}
			}
			instanceMetrics = filteredMetrics
		}

		if err == nil && len(instanceMetrics) > 0 {
			status = h.buildTargetStatus(t.Name, instanceMetrics, staleThreshold)
			status.Group = t.Group
		} else {
			metrics, err := h.store.GetLatest(t.Name)
			if err == nil && metrics != nil {
				if time.Since(metrics.Timestamp) > staleThreshold {
					status.Status = "unknown"
				} else {
					status.Current = metrics
					status.Status = h.determineStatus(metrics)
				}
			}
		}

		targets = append(targets, status)
	}

	groups := h.collectGroups()
	response := TargetsResponse{Targets: targets, Groups: groups}

	h.cacheMu.Lock()
	h.cache = &cacheEntry{data: response, timestamp: time.Now()}
	h.cacheMu.Unlock()

	c.JSON(http.StatusOK, response)
}

func (h *Handler) calculateStaleThreshold(interval time.Duration) time.Duration {
	threshold := interval * StaleMultiplier
	if threshold < MinStaleThreshold {
		return MinStaleThreshold
	}
	return threshold
}

func (h *Handler) buildTargetStatus(name string, instanceMetrics []models.PoolMetrics, staleThreshold time.Duration) models.TargetStatus {
	status := models.TargetStatus{Name: name, Status: "unknown"}
	var instances []models.InstanceStatus
	var totalActive, totalIdle, totalPending, totalMax int
	var totalHeapUsed, totalHeapMax, totalNonHeapUsed int64
	var totalThreadsLive int
	var totalCpuUsage float64
	var totalGcCount, totalYoungGcCount, totalOldGcCount int64
	var totalGcTime float64
	var activeInstanceCount int
	worstStatus := "healthy"
	allStale := true

	for _, m := range instanceMetrics {
		isStale := time.Since(m.Timestamp) > staleThreshold
		if !isStale {
			allStale = false
		}

		instStatus := h.determineStatus(&m)
		if isStale {
			instStatus = "unknown"
		}

		var currentMetrics *models.PoolMetrics
		if !isStale {
			currentMetrics = &m
			activeInstanceCount++
			// Pool metrics
			totalActive += m.Active
			totalIdle += m.Idle
			totalPending += m.Pending
			totalMax += m.Max
			// JVM metrics
			totalHeapUsed += m.HeapUsed
			totalHeapMax += m.HeapMax
			totalNonHeapUsed += m.NonHeapUsed
			totalThreadsLive += m.ThreadsLive
			totalCpuUsage += m.CpuUsage
			// GC metrics
			totalGcCount += m.GcCount
			totalGcTime += m.GcTime
			totalYoungGcCount += m.YoungGcCount
			totalOldGcCount += m.OldGcCount
		}

		instances = append(instances, models.InstanceStatus{
			InstanceName: m.InstanceName,
			Status:       instStatus,
			Current:      currentMetrics,
		})

		if !isStale {
			if instStatus == "critical" || (instStatus == "warning" && worstStatus == "healthy") {
				worstStatus = instStatus
			}
		}
	}

	status.Instances = instances

	if allStale {
		status.Status = "unknown"
		status.Current = nil
	} else {
		status.Status = worstStatus
		if len(instanceMetrics) == 1 && time.Since(instanceMetrics[0].Timestamp) <= staleThreshold {
			status.Current = &instanceMetrics[0]
		} else if totalMax > 0 {
			// Calculate average CPU usage
			avgCpuUsage := 0.0
			if activeInstanceCount > 0 {
				avgCpuUsage = totalCpuUsage / float64(activeInstanceCount)
			}
			status.Current = &models.PoolMetrics{
				TargetName:   name,
				InstanceName: "aggregated",
				// Pool metrics (sum)
				Active:  totalActive,
				Idle:    totalIdle,
				Pending: totalPending,
				Max:     totalMax,
				// JVM metrics (sum for memory/threads, avg for CPU)
				HeapUsed:    totalHeapUsed,
				HeapMax:     totalHeapMax,
				NonHeapUsed: totalNonHeapUsed,
				ThreadsLive: totalThreadsLive,
				CpuUsage:    avgCpuUsage,
				// GC metrics (sum)
				GcCount:      totalGcCount,
				GcTime:       totalGcTime,
				YoungGcCount: totalYoungGcCount,
				OldGcCount:   totalOldGcCount,
			}
		}
	}

	return status
}

func (h *Handler) collectGroups() []string {
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
	return groups
}

func (h *Handler) GetInstances(c *gin.Context) {
	name := c.Param("name")
	instances, err := h.store.GetInstances(name)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"target_name": name, "instances": instances})
}

func (h *Handler) GetTargetMetrics(c *gin.Context) {
	name := c.Param("name")
	metrics, err := h.store.GetLatest(name)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if metrics == nil {
		RespondNotFound(c, "no metrics found")
		return
	}
	c.JSON(http.StatusOK, metrics)
}

func (h *Handler) GetTargetHistory(c *gin.Context) {
	name := c.Param("name")
	instance := c.Query("instance")
	tr := ParseTimeRangeFromContext(c, DefaultRangeShort)

	// Parse limit parameter (default: 500, max: 10000, 0 = no limit)
	limitStr := c.DefaultQuery("limit", "500")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 0 {
		limit = 500
	}
	if limit > 10000 {
		limit = 10000
	}

	var datapoints []models.PoolMetrics
	if instance != "" {
		datapoints, err = h.store.GetHistoryByInstance(name, instance, tr.From, tr.To)
	} else {
		datapoints, err = h.store.GetHistory(name, tr.From, tr.To)
	}

	if err != nil {
		RespondInternalError(c, err)
		return
	}

	// Downsample if limit > 0
	if limit > 0 {
		datapoints = downsampleMetrics(datapoints, limit)
	}

	c.JSON(http.StatusOK, models.HistoryResponse{
		TargetName: name,
		Datapoints: datapoints,
	})
}

func (h *Handler) GetRecommendations(c *gin.Context) {
	name := c.Param("name")
	tr := ParseTimeRangeFromContext(c, DefaultRangeShort)

	datapoints, err := h.store.GetHistory(name, tr.From, tr.To)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if len(datapoints) == 0 {
		RespondNoData(c)
		return
	}

	result := analyzer.Analyze(datapoints, h.cfg().GetLocation())
	c.JSON(http.StatusOK, result)
}

func (h *Handler) DetectLeaks(c *gin.Context) {
	name := c.Param("name")
	tr := ParseTimeRangeFromContext(c, DefaultRangeShort)

	datapoints, err := h.store.GetHistory(name, tr.From, tr.To)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if len(datapoints) == 0 {
		RespondNoData(c)
		return
	}

	result := analyzer.DetectLeaks(datapoints, h.cfg().GetLocation())
	c.JSON(http.StatusOK, result)
}

func (h *Handler) ExportCSV(c *gin.Context) {
	name := c.Param("name")
	instance := c.Query("instance")
	tr := ParseTimeRangeFromContext(c, DefaultRangeLong)

	var datapoints []models.PoolMetrics
	var err error
	if instance != "" {
		datapoints, err = h.store.GetHistoryByInstance(name, instance, tr.From, tr.To)
	} else {
		datapoints, err = h.store.GetHistory(name, tr.From, tr.To)
	}
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	loc := h.cfg().GetLocation()
	filename := fmt.Sprintf("%s_%s.csv", name, time.Now().In(loc).Format("20060102_150405"))
	if instance != "" {
		filename = fmt.Sprintf("%s_%s_%s.csv", name, instance, time.Now().In(loc).Format("20060102_150405"))
	}
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	// Header with all fields including GC metrics
	writer.Write([]string{
		"timestamp", "instance_name", "status",
		"active", "idle", "pending", "max", "timeout", "acquire_p99",
		"heap_used", "heap_max", "non_heap_used", "threads_live", "cpu_usage",
		"gc_count", "gc_time", "young_gc_count", "old_gc_count",
	})

	for _, d := range datapoints {
		writer.Write([]string{
			d.Timestamp.In(loc).Format(time.RFC3339),
			d.InstanceName,
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
			fmt.Sprintf("%d", d.GcCount),
			fmt.Sprintf("%.4f", d.GcTime),
			fmt.Sprintf("%d", d.YoungGcCount),
			fmt.Sprintf("%d", d.OldGcCount),
		})
	}
}

func (h *Handler) ExportAllCSV(c *gin.Context) {
	tr := ParseTimeRangeFromContext(c, DefaultRangeLong)
	loc := h.cfg().GetLocation()

	filename := fmt.Sprintf("all_targets_%s.csv", time.Now().In(loc).Format("20060102_150405"))
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	// Header with all fields including target_name
	writer.Write([]string{
		"target_name", "timestamp", "instance_name", "status",
		"active", "idle", "pending", "max", "timeout", "acquire_p99",
		"heap_used", "heap_max", "non_heap_used", "threads_live", "cpu_usage",
		"gc_count", "gc_time", "young_gc_count", "old_gc_count",
	})

	// Export data for all configured targets
	for _, target := range h.cfg().Targets {
		datapoints, err := h.store.GetHistory(target.Name, tr.From, tr.To)
		if err != nil {
			continue
		}

		for _, d := range datapoints {
			writer.Write([]string{
				d.TargetName,
				d.Timestamp.In(loc).Format(time.RFC3339),
				d.InstanceName,
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
				fmt.Sprintf("%d", d.GcCount),
				fmt.Sprintf("%.4f", d.GcTime),
				fmt.Sprintf("%d", d.YoungGcCount),
				fmt.Sprintf("%d", d.OldGcCount),
			})
		}
	}
}

func (h *Handler) GetPeakTime(c *gin.Context) {
	name := c.Param("name")
	tr := ParseTimeRangeFromContext(c, DefaultRangeLong)

	datapoints, err := h.store.GetHistory(name, tr.From, tr.To)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if len(datapoints) == 0 {
		RespondNoData(c)
		return
	}

	result := analyzer.AnalyzePeakTime(name, datapoints, h.cfg().GetLocation())
	c.JSON(http.StatusOK, result)
}

func (h *Handler) DetectAnomalies(c *gin.Context) {
	name := c.Param("name")
	tr := ParseTimeRangeFromContext(c, DefaultRangeLong)
	sensitivity := c.DefaultQuery("sensitivity", "medium")

	datapoints, err := h.store.GetHistory(name, tr.From, tr.To)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if len(datapoints) == 0 {
		RespondNoData(c)
		return
	}

	opts := &analyzer.AnomalyOptions{Sensitivity: sensitivity}
	result := analyzer.DetectAnomaliesWithOptions(name, datapoints, h.cfg().GetLocation(), opts)
	c.JSON(http.StatusOK, result)
}

func (h *Handler) ComparePeriods(c *gin.Context) {
	name := c.Param("name")
	period := c.DefaultQuery("period", "day")

	var duration time.Duration
	switch period {
	case "week":
		duration = 7 * 24 * time.Hour
	default:
		duration = 24 * time.Hour
		period = "day"
	}

	now := time.Now()
	currentTo := now
	currentFrom := now.Add(-duration)
	previousTo := currentFrom
	previousFrom := previousTo.Add(-duration)

	currentMetrics, err := h.store.GetHistory(name, currentFrom, currentTo)
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	previousMetrics, err := h.store.GetHistory(name, previousFrom, previousTo)
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	if len(currentMetrics) == 0 && len(previousMetrics) == 0 {
		RespondNotFound(c, "no data available for comparison")
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
	if usage > CriticalUsageThreshold {
		return "critical"
	}
	if usage > WarningUsageThreshold {
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
	tr := ParseTimeRange(rangeParam, DefaultRangeLong)

	datapoints, err := h.store.GetHistory(name, tr.From, tr.To)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if len(datapoints) == 0 {
		RespondNotFound(c, "no data available for report")
		return
	}

	loc := h.cfg().GetLocation()
	recs := analyzer.Analyze(datapoints, loc)
	leaks := analyzer.DetectLeaks(datapoints, loc)
	anomalies := analyzer.DetectAnomalies(name, datapoints, loc)
	peakTime := analyzer.AnalyzePeakTime(name, datapoints, loc)

	reportData := report.BuildReportData(name, rangeParam, datapoints, recs, leaks, anomalies, peakTime, loc)

	htmlBytes, err := report.GenerateHTMLReport(&reportData)
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html", htmlBytes)
}

func (h *Handler) GenerateCombinedReport(c *gin.Context) {
	targetsParam := c.Query("targets")
	rangeParam := c.DefaultQuery("range", "24h")

	tr := ParseTimeRange(rangeParam, DefaultRangeLong)

	var targetNames []string
	if targetsParam == "" {
		// Default to all configured targets
		for _, t := range h.cfg().Targets {
			targetNames = append(targetNames, t.Name)
		}
	} else {
		targetNames = parseTargetNames(targetsParam)
	}

	if len(targetNames) == 0 {
		RespondBadRequest(c, "no targets configured")
		return
	}

	loc := h.cfg().GetLocation()
	var allReports []report.ReportData

	for _, name := range targetNames {
		datapoints, err := h.store.GetHistory(name, tr.From, tr.To)
		if err != nil || len(datapoints) == 0 {
			continue
		}

		recs := analyzer.Analyze(datapoints, loc)
		leaks := analyzer.DetectLeaks(datapoints, loc)
		anomalies := analyzer.DetectAnomalies(name, datapoints, loc)
		peakTime := analyzer.AnalyzePeakTime(name, datapoints, loc)

		reportData := report.BuildReportData(name, rangeParam, datapoints, recs, leaks, anomalies, peakTime, loc)
		allReports = append(allReports, reportData)
	}

	if len(allReports) == 0 {
		RespondNotFound(c, "no data available for any target")
		return
	}

	htmlBytes, err := report.GenerateCombinedHTMLReport(allReports, rangeParam, loc)
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Data(http.StatusOK, "text/html", htmlBytes)
}

func parseTargetNames(param string) []string {
	var result []string
	for _, name := range strings.Split(param, ",") {
		trimmed := strings.TrimSpace(name)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

// Alert handlers

func (h *Handler) GetAlerts(c *gin.Context) {
	status := c.Query("status")
	limitStr := c.DefaultQuery("limit", "100")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 100
	}
	if limit > 10000 {
		limit = 10000
	}

	alerts, err := h.store.GetAlerts(status, limit)
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"alerts": alerts})
}

func (h *Handler) GetActiveAlerts(c *gin.Context) {
	alerts, err := h.store.GetAlerts(models.AlertStatusFired, 100)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"alerts": alerts})
}

func (h *Handler) GetAlert(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid alert ID")
		return
	}

	alert, err := h.store.GetAlert(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if alert == nil {
		RespondNotFound(c, "alert not found")
		return
	}

	c.JSON(http.StatusOK, alert)
}

func (h *Handler) ResolveAlert(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid alert ID")
		return
	}

	alert, err := h.store.GetAlert(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if alert == nil {
		RespondNotFound(c, "alert not found")
		return
	}
	if alert.Status == models.AlertStatusResolved {
		RespondBadRequest(c, "alert already resolved")
		return
	}

	now := time.Now()
	alert.Status = models.AlertStatusResolved
	alert.ResolvedAt = &now

	if err := h.store.UpdateAlert(alert); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, alert)
}

func (h *Handler) GetAlertStats(c *gin.Context) {
	stats, err := h.store.GetAlertStats()
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *Handler) TestAlert(c *gin.Context) {
	if h.alertMgr == nil {
		RespondError(c, http.StatusServiceUnavailable, "alert manager not initialized")
		return
	}

	var opts alerter.TestAlertOptions
	if err := c.ShouldBindJSON(&opts); err != nil {
		// If no body, use defaults
		opts = alerter.TestAlertOptions{}
	}

	// Validate severity - reset to default if invalid
	if opts.Severity != "" &&
		opts.Severity != models.SeverityInfo &&
		opts.Severity != models.SeverityWarning &&
		opts.Severity != models.SeverityCritical {
		opts.Severity = models.SeverityWarning
	}

	if err := h.alertMgr.TestAlertWithOptions(opts); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "test alert sent",
		"severity": opts.Severity,
		"channels": opts.Channels,
	})
}

func (h *Handler) GetAlertChannels(c *gin.Context) {
	if h.alertMgr == nil {
		RespondError(c, http.StatusServiceUnavailable, "alert manager not initialized")
		return
	}

	channels := h.alertMgr.GetEnabledChannels()
	c.JSON(http.StatusOK, gin.H{
		"channels": channels,
	})
}

// Alert Rule handlers

func (h *Handler) GetAlertRules(c *gin.Context) {
	rules, err := h.store.GetAlertRules()
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	// Also include config-based rules for reference
	configRules := h.cfg().Alerting.Rules

	c.JSON(http.StatusOK, gin.H{
		"rules":        rules,
		"config_rules": configRules,
	})
}

func (h *Handler) GetAlertRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid rule ID")
		return
	}

	rule, err := h.store.GetAlertRule(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if rule == nil {
		RespondNotFound(c, "rule not found")
		return
	}

	c.JSON(http.StatusOK, rule)
}

func (h *Handler) CreateAlertRule(c *gin.Context) {
	var input models.AlertRuleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondBadRequest(c, "invalid request body: "+err.Error())
		return
	}

	// Validate field lengths
	if len(input.Name) > 255 {
		RespondBadRequest(c, "rule name must be less than 255 characters")
		return
	}
	if len(input.Message) > 5000 {
		RespondBadRequest(c, "message must be less than 5000 characters")
		return
	}

	// Validate severity
	if input.Severity != models.SeverityInfo &&
		input.Severity != models.SeverityWarning &&
		input.Severity != models.SeverityCritical {
		RespondBadRequest(c, "severity must be info, warning, or critical")
		return
	}

	// Validate condition syntax
	if err := alerter.ValidateCondition(input.Condition); err != nil {
		RespondBadRequest(c, "invalid condition: "+err.Error())
		return
	}

	// Check if rule with same name exists
	existing, err := h.store.GetAlertRuleByName(input.Name)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if existing != nil {
		RespondBadRequest(c, "rule with this name already exists")
		return
	}

	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	rule := &models.AlertRule{
		Name:      input.Name,
		Condition: input.Condition,
		Severity:  input.Severity,
		Message:   input.Message,
		Enabled:   enabled,
	}

	if err := h.store.SaveAlertRule(rule); err != nil {
		RespondInternalError(c, err)
		return
	}

	// Notify alert manager to reload rules
	if h.alertMgr != nil {
		h.alertMgr.ReloadRules()
	}

	c.JSON(http.StatusCreated, rule)
}

func (h *Handler) UpdateAlertRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid rule ID")
		return
	}

	var input models.AlertRuleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondBadRequest(c, "invalid request body: "+err.Error())
		return
	}

	// Validate field lengths
	if len(input.Name) > 255 {
		RespondBadRequest(c, "rule name must be less than 255 characters")
		return
	}
	if len(input.Message) > 5000 {
		RespondBadRequest(c, "message must be less than 5000 characters")
		return
	}

	// Validate severity
	if input.Severity != models.SeverityInfo &&
		input.Severity != models.SeverityWarning &&
		input.Severity != models.SeverityCritical {
		RespondBadRequest(c, "severity must be info, warning, or critical")
		return
	}

	// Validate condition syntax
	if err := alerter.ValidateCondition(input.Condition); err != nil {
		RespondBadRequest(c, "invalid condition: "+err.Error())
		return
	}

	rule, err := h.store.GetAlertRule(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if rule == nil {
		RespondNotFound(c, "rule not found")
		return
	}

	// Check if name is being changed to an existing name
	if input.Name != rule.Name {
		existing, err := h.store.GetAlertRuleByName(input.Name)
		if err != nil {
			RespondInternalError(c, err)
			return
		}
		if existing != nil {
			RespondBadRequest(c, "rule with this name already exists")
			return
		}
	}

	rule.Name = input.Name
	rule.Condition = input.Condition
	rule.Severity = input.Severity
	rule.Message = input.Message
	if input.Enabled != nil {
		rule.Enabled = *input.Enabled
	}

	if err := h.store.UpdateAlertRule(rule); err != nil {
		RespondInternalError(c, err)
		return
	}

	// Notify alert manager to reload rules
	if h.alertMgr != nil {
		h.alertMgr.ReloadRules()
	}

	c.JSON(http.StatusOK, rule)
}

func (h *Handler) DeleteAlertRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid rule ID")
		return
	}

	rule, err := h.store.GetAlertRule(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if rule == nil {
		RespondNotFound(c, "rule not found")
		return
	}

	if err := h.store.DeleteAlertRule(id); err != nil {
		RespondInternalError(c, err)
		return
	}

	// Notify alert manager to reload rules
	if h.alertMgr != nil {
		h.alertMgr.ReloadRules()
	}

	c.JSON(http.StatusOK, gin.H{"message": "rule deleted"})
}

func (h *Handler) ToggleAlertRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid rule ID")
		return
	}

	rule, err := h.store.GetAlertRule(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if rule == nil {
		RespondNotFound(c, "rule not found")
		return
	}

	rule.Enabled = !rule.Enabled

	if err := h.store.UpdateAlertRule(rule); err != nil {
		RespondInternalError(c, err)
		return
	}

	// Notify alert manager to reload rules
	if h.alertMgr != nil {
		h.alertMgr.ReloadRules()
	}

	c.JSON(http.StatusOK, rule)
}

// Backup handlers

func (h *Handler) CreateBackup(c *gin.Context) {
	// Generate backup filename with timestamp
	timestamp := time.Now().Format("20060102_150405")
	backupPath := fmt.Sprintf("./data/backups/pondy_backup_%s.db", timestamp)

	if err := h.store.CreateBackup(backupPath); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "backup created",
		"path":    backupPath,
	})
}

func (h *Handler) DownloadBackup(c *gin.Context) {
	// Generate backup filename with timestamp
	timestamp := time.Now().Format("20060102_150405")
	backupPath := fmt.Sprintf("./data/backups/pondy_backup_%s.db", timestamp)

	if err := h.store.CreateBackup(backupPath); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=pondy_backup_%s.db", timestamp))
	c.Header("Content-Type", "application/octet-stream")
	c.File(backupPath)
}

func (h *Handler) RestoreBackup(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		RespondBadRequest(c, "no file uploaded")
		return
	}

	// Validate file extension
	if !strings.HasSuffix(file.Filename, ".db") {
		RespondBadRequest(c, "invalid file type, expected .db file")
		return
	}

	// Save uploaded file temporarily
	tempPath := fmt.Sprintf("./data/backups/restore_temp_%d.db", time.Now().UnixNano())
	if err := c.SaveUploadedFile(file, tempPath); err != nil {
		RespondInternalError(c, err)
		return
	}

	// Restore from the uploaded file
	if err := h.store.RestoreBackup(tempPath); err != nil {
		os.Remove(tempPath) // Clean up temp file
		RespondError(c, http.StatusBadRequest, "invalid backup file: "+err.Error())
		return
	}

	// Clean up temp file
	os.Remove(tempPath)

	c.JSON(http.StatusOK, gin.H{
		"message": "backup restored successfully",
	})
}

// URL validation regex - only allow http:// or https://
var validEndpointURLRegex = regexp.MustCompile(`^https?://`)

// validateEndpointURL validates that the endpoint URL is valid and uses http or https
func validateEndpointURL(endpoint string) error {
	if endpoint == "" {
		return nil // Empty is allowed (will be caught by other validation)
	}

	// Check if URL starts with http:// or https://
	if !validEndpointURLRegex.MatchString(endpoint) {
		return fmt.Errorf("endpoint must start with http:// or https://")
	}

	// Parse URL to validate structure
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return fmt.Errorf("invalid URL: %v", err)
	}

	if parsed.Host == "" {
		return fmt.Errorf("endpoint URL must have a valid host")
	}

	return nil
}

// checkEndpointConnectivity tests if the endpoint is reachable
// Returns nil if endpoint responds with any HTTP status (server is reachable)
func checkEndpointConnectivity(endpoint string) error {
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(endpoint)
	if err != nil {
		return fmt.Errorf("failed to connect to endpoint: %v", err)
	}
	defer resp.Body.Close()

	// We just check if the server responds, any status code is OK
	// as long as the server is reachable
	return nil
}

// TargetConfigRequest represents a target configuration for API requests
type TargetConfigRequest struct {
	Name      string                   `json:"name"`
	Type      string                   `json:"type"`
	Endpoint  string                   `json:"endpoint,omitempty"`
	Interval  string                   `json:"interval"` // e.g., "10s", "1m"
	Group     string                   `json:"group,omitempty"`
	Instances []InstanceConfigRequest  `json:"instances,omitempty"`
}

type InstanceConfigRequest struct {
	ID       string `json:"id"`
	Endpoint string `json:"endpoint"`
}

func (r *TargetConfigRequest) ToConfig() (config.TargetConfig, error) {
	interval, err := time.ParseDuration(r.Interval)
	if err != nil {
		interval = 10 * time.Second
	}

	var instances []config.InstanceConfig
	for _, inst := range r.Instances {
		instances = append(instances, config.InstanceConfig{
			ID:       inst.ID,
			Endpoint: inst.Endpoint,
		})
	}

	return config.TargetConfig{
		Name:      r.Name,
		Type:      r.Type,
		Endpoint:  r.Endpoint,
		Interval:  interval,
		Group:     r.Group,
		Instances: instances,
	}, nil
}

func targetConfigToResponse(t config.TargetConfig) map[string]interface{} {
	instances := make([]map[string]string, 0)
	for _, inst := range t.Instances {
		instances = append(instances, map[string]string{
			"id":       inst.ID,
			"endpoint": inst.Endpoint,
		})
	}

	return map[string]interface{}{
		"name":      t.Name,
		"type":      t.Type,
		"endpoint":  t.Endpoint,
		"interval":  t.Interval.String(),
		"group":     t.Group,
		"instances": instances,
	}
}

// GetConfigTargets returns all configured targets
func (h *Handler) GetConfigTargets(c *gin.Context) {
	targets := h.cfgMgr.GetAllTargets()

	result := make([]map[string]interface{}, 0, len(targets))
	for _, t := range targets {
		result = append(result, targetConfigToResponse(t))
	}

	c.JSON(http.StatusOK, gin.H{"targets": result})
}

// AddConfigTarget adds a new target to the configuration
func (h *Handler) AddConfigTarget(c *gin.Context) {
	var req TargetConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondBadRequest(c, "invalid request body: "+err.Error())
		return
	}

	if req.Name == "" {
		RespondBadRequest(c, "name is required")
		return
	}
	if req.Type == "" {
		req.Type = "actuator"
	}
	if req.Endpoint == "" && len(req.Instances) == 0 {
		RespondBadRequest(c, "endpoint or instances is required")
		return
	}

	// Validate endpoint URL format (http:// or https://)
	if req.Endpoint != "" {
		if err := validateEndpointURL(req.Endpoint); err != nil {
			RespondBadRequest(c, err.Error())
			return
		}
	}

	// Validate instance endpoints
	for _, inst := range req.Instances {
		if err := validateEndpointURL(inst.Endpoint); err != nil {
			RespondBadRequest(c, fmt.Sprintf("instance %s: %v", inst.ID, err))
			return
		}
	}

	// Check endpoint connectivity before registering
	if req.Endpoint != "" {
		if err := checkEndpointConnectivity(req.Endpoint); err != nil {
			RespondBadRequest(c, fmt.Sprintf("endpoint unreachable: %v", err))
			return
		}
	}

	// Check all instance endpoints connectivity
	for _, inst := range req.Instances {
		if err := checkEndpointConnectivity(inst.Endpoint); err != nil {
			RespondBadRequest(c, fmt.Sprintf("instance %s endpoint unreachable: %v", inst.ID, err))
			return
		}
	}

	targetCfg, err := req.ToConfig()
	if err != nil {
		RespondBadRequest(c, "invalid configuration: "+err.Error())
		return
	}

	if err := h.cfgMgr.AddTarget(targetCfg); err != nil {
		RespondBadRequest(c, err.Error())
		return
	}

	if err := h.cfgMgr.SaveConfig(); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "target added successfully",
		"target":  targetConfigToResponse(targetCfg),
	})
}

// UpdateConfigTarget updates an existing target
func (h *Handler) UpdateConfigTarget(c *gin.Context) {
	name := c.Param("name")

	var req TargetConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondBadRequest(c, "invalid request body: "+err.Error())
		return
	}

	if req.Name == "" {
		req.Name = name
	}
	if req.Type == "" {
		req.Type = "actuator"
	}
	if req.Endpoint == "" && len(req.Instances) == 0 {
		RespondBadRequest(c, "endpoint or instances is required")
		return
	}

	// Validate endpoint URL format (http:// or https://)
	if req.Endpoint != "" {
		if err := validateEndpointURL(req.Endpoint); err != nil {
			RespondBadRequest(c, err.Error())
			return
		}
	}

	// Validate instance endpoints
	for _, inst := range req.Instances {
		if err := validateEndpointURL(inst.Endpoint); err != nil {
			RespondBadRequest(c, fmt.Sprintf("instance %s: %v", inst.ID, err))
			return
		}
	}

	targetCfg, err := req.ToConfig()
	if err != nil {
		RespondBadRequest(c, "invalid configuration: "+err.Error())
		return
	}

	if err := h.cfgMgr.UpdateTarget(name, targetCfg); err != nil {
		RespondBadRequest(c, err.Error())
		return
	}

	if err := h.cfgMgr.SaveConfig(); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "target updated successfully",
		"target":  targetConfigToResponse(targetCfg),
	})
}

// DeleteConfigTarget removes a target from the configuration
func (h *Handler) DeleteConfigTarget(c *gin.Context) {
	name := c.Param("name")

	if err := h.cfgMgr.DeleteTarget(name); err != nil {
		RespondNotFound(c, err.Error())
		return
	}

	if err := h.cfgMgr.SaveConfig(); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "target deleted successfully",
	})
}

// GetAlertingConfig returns the current alerting configuration
func (h *Handler) GetAlertingConfig(c *gin.Context) {
	cfg := h.cfg()
	alerting := cfg.Alerting

	channels := gin.H{
		"slack": gin.H{
			"enabled":     alerting.Channels.Slack.Enabled,
			"webhook_url": alerting.Channels.Slack.WebhookURL,
			"channel":     alerting.Channels.Slack.Channel,
			"username":    alerting.Channels.Slack.Username,
		},
		"discord": gin.H{
			"enabled":     alerting.Channels.Discord.Enabled,
			"webhook_url": alerting.Channels.Discord.WebhookURL,
		},
		"mattermost": gin.H{
			"enabled":     alerting.Channels.Mattermost.Enabled,
			"webhook_url": alerting.Channels.Mattermost.WebhookURL,
			"channel":     alerting.Channels.Mattermost.Channel,
			"username":    alerting.Channels.Mattermost.Username,
		},
		"webhook": gin.H{
			"enabled": alerting.Channels.Webhook.Enabled,
			"url":     alerting.Channels.Webhook.URL,
			"method":  alerting.Channels.Webhook.Method,
			"headers": alerting.Channels.Webhook.Headers,
		},
		"email": gin.H{
			"enabled":   alerting.Channels.Email.Enabled,
			"smtp_host": alerting.Channels.Email.SMTPHost,
			"smtp_port": alerting.Channels.Email.SMTPPort,
			"username":  alerting.Channels.Email.Username,
			"from":      alerting.Channels.Email.From,
			"to":        alerting.Channels.Email.To,
			"use_tls":   alerting.Channels.Email.UseTLS,
		},
		"notion": gin.H{
			"enabled":     alerting.Channels.Notion.Enabled,
			"database_id": alerting.Channels.Notion.DatabaseID,
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"enabled":        alerting.Enabled,
		"check_interval": alerting.CheckInterval.String(),
		"cooldown":       alerting.Cooldown.String(),
		"channels":       channels,
	})
}

// UpdateAlertingConfig updates the alerting configuration
func (h *Handler) UpdateAlertingConfig(c *gin.Context) {
	var req struct {
		Enabled       *bool  `json:"enabled"`
		CheckInterval string `json:"check_interval"`
		Cooldown      string `json:"cooldown"`
		Channels      struct {
			Slack struct {
				Enabled    *bool  `json:"enabled"`
				WebhookURL string `json:"webhook_url"`
				Channel    string `json:"channel"`
				Username   string `json:"username"`
			} `json:"slack"`
			Discord struct {
				Enabled    *bool  `json:"enabled"`
				WebhookURL string `json:"webhook_url"`
			} `json:"discord"`
			Mattermost struct {
				Enabled    *bool  `json:"enabled"`
				WebhookURL string `json:"webhook_url"`
				Channel    string `json:"channel"`
				Username   string `json:"username"`
			} `json:"mattermost"`
			Webhook struct {
				Enabled *bool             `json:"enabled"`
				URL     string            `json:"url"`
				Method  string            `json:"method"`
				Headers map[string]string `json:"headers"`
			} `json:"webhook"`
			Email struct {
				Enabled  *bool    `json:"enabled"`
				SMTPHost string   `json:"smtp_host"`
				SMTPPort int      `json:"smtp_port"`
				Username string   `json:"username"`
				Password string   `json:"password"`
				From     string   `json:"from"`
				To       []string `json:"to"`
				UseTLS   *bool    `json:"use_tls"`
			} `json:"email"`
			Notion struct {
				Enabled    *bool  `json:"enabled"`
				Token      string `json:"token"`
				DatabaseID string `json:"database_id"`
			} `json:"notion"`
		} `json:"channels"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondBadRequest(c, "invalid request body: "+err.Error())
		return
	}

	// Update config in memory
	cfg := h.cfg()

	if req.Enabled != nil {
		cfg.Alerting.Enabled = *req.Enabled
	}
	if req.CheckInterval != "" {
		if d, err := time.ParseDuration(req.CheckInterval); err == nil {
			cfg.Alerting.CheckInterval = d
		}
	}
	if req.Cooldown != "" {
		if d, err := time.ParseDuration(req.Cooldown); err == nil {
			cfg.Alerting.Cooldown = d
		}
	}

	// Update channels
	if req.Channels.Slack.Enabled != nil {
		cfg.Alerting.Channels.Slack.Enabled = *req.Channels.Slack.Enabled
	}
	if req.Channels.Slack.WebhookURL != "" {
		cfg.Alerting.Channels.Slack.WebhookURL = req.Channels.Slack.WebhookURL
	}
	if req.Channels.Slack.Channel != "" {
		cfg.Alerting.Channels.Slack.Channel = req.Channels.Slack.Channel
	}
	if req.Channels.Slack.Username != "" {
		cfg.Alerting.Channels.Slack.Username = req.Channels.Slack.Username
	}

	if req.Channels.Discord.Enabled != nil {
		cfg.Alerting.Channels.Discord.Enabled = *req.Channels.Discord.Enabled
	}
	if req.Channels.Discord.WebhookURL != "" {
		cfg.Alerting.Channels.Discord.WebhookURL = req.Channels.Discord.WebhookURL
	}

	if req.Channels.Mattermost.Enabled != nil {
		cfg.Alerting.Channels.Mattermost.Enabled = *req.Channels.Mattermost.Enabled
	}
	if req.Channels.Mattermost.WebhookURL != "" {
		cfg.Alerting.Channels.Mattermost.WebhookURL = req.Channels.Mattermost.WebhookURL
	}
	if req.Channels.Mattermost.Channel != "" {
		cfg.Alerting.Channels.Mattermost.Channel = req.Channels.Mattermost.Channel
	}
	if req.Channels.Mattermost.Username != "" {
		cfg.Alerting.Channels.Mattermost.Username = req.Channels.Mattermost.Username
	}

	if req.Channels.Webhook.Enabled != nil {
		cfg.Alerting.Channels.Webhook.Enabled = *req.Channels.Webhook.Enabled
	}
	if req.Channels.Webhook.URL != "" {
		cfg.Alerting.Channels.Webhook.URL = req.Channels.Webhook.URL
	}
	if req.Channels.Webhook.Method != "" {
		cfg.Alerting.Channels.Webhook.Method = req.Channels.Webhook.Method
	}
	if req.Channels.Webhook.Headers != nil {
		cfg.Alerting.Channels.Webhook.Headers = req.Channels.Webhook.Headers
	}

	if req.Channels.Email.Enabled != nil {
		cfg.Alerting.Channels.Email.Enabled = *req.Channels.Email.Enabled
	}
	if req.Channels.Email.SMTPHost != "" {
		cfg.Alerting.Channels.Email.SMTPHost = req.Channels.Email.SMTPHost
	}
	if req.Channels.Email.SMTPPort > 0 {
		cfg.Alerting.Channels.Email.SMTPPort = req.Channels.Email.SMTPPort
	}
	if req.Channels.Email.Username != "" {
		cfg.Alerting.Channels.Email.Username = req.Channels.Email.Username
	}
	if req.Channels.Email.Password != "" {
		cfg.Alerting.Channels.Email.Password = req.Channels.Email.Password
	}
	if req.Channels.Email.From != "" {
		cfg.Alerting.Channels.Email.From = req.Channels.Email.From
	}
	if req.Channels.Email.To != nil {
		cfg.Alerting.Channels.Email.To = req.Channels.Email.To
	}
	if req.Channels.Email.UseTLS != nil {
		cfg.Alerting.Channels.Email.UseTLS = *req.Channels.Email.UseTLS
	}

	if req.Channels.Notion.Enabled != nil {
		cfg.Alerting.Channels.Notion.Enabled = *req.Channels.Notion.Enabled
	}
	if req.Channels.Notion.Token != "" {
		cfg.Alerting.Channels.Notion.Token = req.Channels.Notion.Token
	}
	if req.Channels.Notion.DatabaseID != "" {
		cfg.Alerting.Channels.Notion.DatabaseID = req.Channels.Notion.DatabaseID
	}

	// Save to file
	if err := h.cfgMgr.SaveConfig(); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "alerting configuration updated successfully",
	})
}

// Maintenance Window handlers

type MaintenanceWindowsResponse struct {
	Windows []models.MaintenanceWindow `json:"windows"`
	Total   int                        `json:"total"`
}

func (h *Handler) GetMaintenanceWindows(c *gin.Context) {
	windows, err := h.store.GetAllMaintenanceWindows()
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	if windows == nil {
		windows = []models.MaintenanceWindow{}
	}

	c.JSON(http.StatusOK, MaintenanceWindowsResponse{
		Windows: windows,
		Total:   len(windows),
	})
}

func (h *Handler) GetActiveMaintenanceWindows(c *gin.Context) {
	windows, err := h.store.GetActiveMaintenanceWindows()
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	if windows == nil {
		windows = []models.MaintenanceWindow{}
	}

	c.JSON(http.StatusOK, MaintenanceWindowsResponse{
		Windows: windows,
		Total:   len(windows),
	})
}

func (h *Handler) GetMaintenanceWindow(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid window ID")
		return
	}

	window, err := h.store.GetMaintenanceWindow(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if window == nil {
		RespondNotFound(c, "maintenance window not found")
		return
	}

	c.JSON(http.StatusOK, window)
}

func (h *Handler) CreateMaintenanceWindow(c *gin.Context) {
	var input models.MaintenanceWindowInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondBadRequest(c, "invalid input: "+err.Error())
		return
	}

	// Parse times
	startTime, err := time.Parse(time.RFC3339, input.StartTime)
	if err != nil {
		RespondBadRequest(c, "invalid start_time format, use RFC3339 (e.g., 2024-01-15T10:00:00Z)")
		return
	}

	endTime, err := time.Parse(time.RFC3339, input.EndTime)
	if err != nil {
		RespondBadRequest(c, "invalid end_time format, use RFC3339 (e.g., 2024-01-15T12:00:00Z)")
		return
	}

	// Validate time range
	if !input.Recurring && endTime.Before(startTime) {
		RespondBadRequest(c, "end_time must be after start_time")
		return
	}

	window := &models.MaintenanceWindow{
		Name:        input.Name,
		Description: input.Description,
		TargetName:  input.TargetName,
		StartTime:   startTime,
		EndTime:     endTime,
		Recurring:   input.Recurring,
		DaysOfWeek:  input.DaysOfWeek,
	}

	if err := h.store.SaveMaintenanceWindow(window); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusCreated, window)
}

func (h *Handler) UpdateMaintenanceWindow(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid window ID")
		return
	}

	existing, err := h.store.GetMaintenanceWindow(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if existing == nil {
		RespondNotFound(c, "maintenance window not found")
		return
	}

	var input models.MaintenanceWindowInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondBadRequest(c, "invalid input: "+err.Error())
		return
	}

	// Parse times
	startTime, err := time.Parse(time.RFC3339, input.StartTime)
	if err != nil {
		RespondBadRequest(c, "invalid start_time format, use RFC3339")
		return
	}

	endTime, err := time.Parse(time.RFC3339, input.EndTime)
	if err != nil {
		RespondBadRequest(c, "invalid end_time format, use RFC3339")
		return
	}

	// Validate time range
	if !input.Recurring && endTime.Before(startTime) {
		RespondBadRequest(c, "end_time must be after start_time")
		return
	}

	existing.Name = input.Name
	existing.Description = input.Description
	existing.TargetName = input.TargetName
	existing.StartTime = startTime
	existing.EndTime = endTime
	existing.Recurring = input.Recurring
	existing.DaysOfWeek = input.DaysOfWeek

	if err := h.store.UpdateMaintenanceWindow(existing); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, existing)
}

func (h *Handler) DeleteMaintenanceWindow(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		RespondBadRequest(c, "invalid window ID")
		return
	}

	existing, err := h.store.GetMaintenanceWindow(id)
	if err != nil {
		RespondInternalError(c, err)
		return
	}
	if existing == nil {
		RespondNotFound(c, "maintenance window not found")
		return
	}

	if err := h.store.DeleteMaintenanceWindow(id); err != nil {
		RespondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "maintenance window deleted"})
}
