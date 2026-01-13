package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"os"
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
	h.cacheMu.RLock()
	if h.cache != nil && time.Since(h.cache.timestamp) < h.cacheTTL {
		response := h.cache.data
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

		staleThreshold := h.calculateStaleThreshold(t.Interval)
		instanceMetrics, err := h.store.GetLatestAllInstances(t.Name)

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
			status.Current = &models.PoolMetrics{
				TargetName:   name,
				InstanceName: "aggregated",
				Active:       totalActive,
				Idle:         totalIdle,
				Pending:      totalPending,
				Max:          totalMax,
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
	tr := ParseTimeRangeFromContext(c, DefaultRangeLong)

	datapoints, err := h.store.GetHistory(name, tr.From, tr.To)
	if err != nil {
		RespondInternalError(c, err)
		return
	}

	loc := h.cfg().GetLocation()
	filename := fmt.Sprintf("%s_%s.csv", name, time.Now().In(loc).Format("20060102_150405"))
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	writer.Write([]string{"timestamp", "status", "active", "idle", "pending", "max", "timeout", "acquire_p99", "heap_used", "heap_max", "non_heap_used", "threads_live", "cpu_usage"})

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

	if targetsParam == "" {
		RespondBadRequest(c, "targets parameter is required")
		return
	}

	tr := ParseTimeRange(rangeParam, DefaultRangeLong)

	targetNames := parseTargetNames(targetsParam)
	if len(targetNames) == 0 {
		RespondBadRequest(c, "no valid targets specified")
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

	// Validate severity
	if input.Severity != models.SeverityInfo &&
		input.Severity != models.SeverityWarning &&
		input.Severity != models.SeverityCritical {
		RespondBadRequest(c, "severity must be info, warning, or critical")
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

	// Validate severity
	if input.Severity != models.SeverityInfo &&
		input.Severity != models.SeverityWarning &&
		input.Severity != models.SeverityCritical {
		RespondBadRequest(c, "severity must be info, warning, or critical")
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
