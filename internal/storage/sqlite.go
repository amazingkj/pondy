package storage

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/jiin/pondy/internal/models"
	_ "modernc.org/sqlite"
)

// sanitizeSQLitePath validates and sanitizes a file path for use in SQLite commands
// Returns error if path contains potentially dangerous characters
func sanitizeSQLitePath(path string) (string, error) {
	// Clean the path
	cleaned := filepath.Clean(path)

	// Check for SQL injection characters
	// SQLite uses single quotes for string literals
	if strings.Contains(cleaned, "'") {
		return "", fmt.Errorf("path contains invalid character: single quote")
	}

	// Check for semicolons which could terminate statements
	if strings.Contains(cleaned, ";") {
		return "", fmt.Errorf("path contains invalid character: semicolon")
	}

	// Check for double dashes (SQL comments)
	if strings.Contains(cleaned, "--") {
		return "", fmt.Errorf("path contains invalid sequence: double dash")
	}

	// Check for null bytes
	if strings.Contains(cleaned, "\x00") {
		return "", fmt.Errorf("path contains invalid character: null byte")
	}

	// Validate path characters - allow only safe characters
	// Allow alphanumeric, underscore, hyphen, dot, forward/back slash, colon (for Windows drives)
	validPath := regexp.MustCompile(`^[a-zA-Z0-9_\-./\\:]+$`)
	if !validPath.MatchString(cleaned) {
		return "", fmt.Errorf("path contains invalid characters")
	}

	return cleaned, nil
}

type SQLiteStorage struct {
	db *sql.DB
}

func NewSQLiteStorage(dbPath string) (*SQLiteStorage, error) {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Add WAL mode, busy timeout, and performance optimizations
	dsn := dbPath + "?_pragma=busy_timeout(5000)" +
		"&_pragma=journal_mode(WAL)" +
		"&_pragma=synchronous(NORMAL)" +
		"&_pragma=cache_size(-64000)" +
		"&_pragma=temp_store(MEMORY)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}

	// Connection pool settings for better concurrency
	// SQLite with WAL mode can handle multiple readers
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	storage := &SQLiteStorage{db: db}
	if err := storage.migrate(); err != nil {
		db.Close()
		return nil, err
	}

	return storage, nil
}

func (s *SQLiteStorage) migrate() error {
	// Create pool_metrics table
	metricsQuery := `
	CREATE TABLE IF NOT EXISTS pool_metrics (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		target_name TEXT NOT NULL,
		instance_name TEXT NOT NULL DEFAULT 'default',
		status TEXT NOT NULL DEFAULT 'healthy',
		active INTEGER NOT NULL DEFAULT 0,
		idle INTEGER NOT NULL DEFAULT 0,
		pending INTEGER NOT NULL DEFAULT 0,
		max INTEGER NOT NULL DEFAULT 0,
		timeout INTEGER DEFAULT 0,
		acquire_p99 REAL DEFAULT 0,
		heap_used INTEGER DEFAULT 0,
		heap_max INTEGER DEFAULT 0,
		non_heap_used INTEGER DEFAULT 0,
		non_heap_max INTEGER DEFAULT 0,
		threads_live INTEGER DEFAULT 0,
		cpu_usage REAL DEFAULT 0,
		gc_count INTEGER DEFAULT 0,
		gc_time REAL DEFAULT 0,
		young_gc_count INTEGER DEFAULT 0,
		old_gc_count INTEGER DEFAULT 0,
		timestamp DATETIME NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_metrics_target_instance_time
	ON pool_metrics(target_name, instance_name, timestamp DESC);

	CREATE INDEX IF NOT EXISTS idx_metrics_timestamp
	ON pool_metrics(timestamp DESC);

	CREATE INDEX IF NOT EXISTS idx_metrics_target_time
	ON pool_metrics(target_name, timestamp DESC);
	`
	if _, err := s.db.Exec(metricsQuery); err != nil {
		return err
	}

	// Create alerts table
	alertsQuery := `
	CREATE TABLE IF NOT EXISTS alerts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		target_name TEXT NOT NULL,
		instance_name TEXT NOT NULL,
		rule_name TEXT NOT NULL,
		severity TEXT NOT NULL,
		message TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'fired',
		fired_at DATETIME NOT NULL,
		resolved_at DATETIME,
		notified_at DATETIME,
		channels TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_alerts_target
	ON alerts(target_name, instance_name);

	CREATE INDEX IF NOT EXISTS idx_alerts_status
	ON alerts(status, fired_at DESC);

	CREATE INDEX IF NOT EXISTS idx_alerts_rule
	ON alerts(rule_name, fired_at DESC);

	CREATE INDEX IF NOT EXISTS idx_alerts_active
	ON alerts(target_name, instance_name, rule_name, status);

	-- Optimized index for GetAlertStats combined query
	CREATE INDEX IF NOT EXISTS idx_alerts_status_severity
	ON alerts(status, severity);

	CREATE INDEX IF NOT EXISTS idx_alerts_status_target
	ON alerts(status, target_name);

	CREATE INDEX IF NOT EXISTS idx_alerts_status_rule
	ON alerts(status, rule_name);
	`
	if _, err := s.db.Exec(alertsQuery); err != nil {
		return err
	}

	// Migration: add columns if they don't exist
	s.runMigration()

	return nil
}

func (s *SQLiteStorage) runMigration() {
	// List of columns to add if they don't exist
	columns := []struct {
		name string
		def  string
	}{
		{"instance_name", "TEXT NOT NULL DEFAULT 'default'"},
		{"status", "TEXT NOT NULL DEFAULT 'healthy'"},
		{"heap_used", "INTEGER DEFAULT 0"},
		{"heap_max", "INTEGER DEFAULT 0"},
		{"non_heap_used", "INTEGER DEFAULT 0"},
		{"non_heap_max", "INTEGER DEFAULT 0"},
		{"threads_live", "INTEGER DEFAULT 0"},
		{"cpu_usage", "REAL DEFAULT 0"},
		{"gc_count", "INTEGER DEFAULT 0"},
		{"gc_time", "REAL DEFAULT 0"},
		{"young_gc_count", "INTEGER DEFAULT 0"},
		{"old_gc_count", "INTEGER DEFAULT 0"},
	}

	for _, col := range columns {
		var count int
		err := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('pool_metrics') WHERE name=?`, col.name).Scan(&count)
		if err == nil && count == 0 {
			_, err = s.db.Exec(fmt.Sprintf(`ALTER TABLE pool_metrics ADD COLUMN %s %s`, col.name, col.def))
			if err != nil {
				log.Printf("Migration warning: %v", err)
			} else {
				log.Printf("Migration: added %s column", col.name)
			}
		}
	}

	// Create index
	_, err := s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_metrics_target_instance_time ON pool_metrics(target_name, instance_name, timestamp DESC)`)
	if err != nil {
		log.Printf("Migration warning: %v", err)
	}
}

func (s *SQLiteStorage) Save(metrics *models.PoolMetrics) error {
	// Default values
	instanceName := metrics.InstanceName
	if instanceName == "" {
		instanceName = "default"
	}
	status := metrics.Status
	if status == "" {
		status = models.StatusHealthy
	}

	query := `
	INSERT INTO pool_metrics (target_name, instance_name, status, active, idle, pending, max, timeout, acquire_p99,
		heap_used, heap_max, non_heap_used, non_heap_max, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	result, err := s.db.Exec(query,
		metrics.TargetName,
		instanceName,
		status,
		metrics.Active,
		metrics.Idle,
		metrics.Pending,
		metrics.Max,
		metrics.Timeout,
		metrics.AcquireP99,
		metrics.HeapUsed,
		metrics.HeapMax,
		metrics.NonHeapUsed,
		metrics.NonHeapMax,
		metrics.ThreadsLive,
		metrics.CpuUsage,
		metrics.GcCount,
		metrics.GcTime,
		metrics.YoungGcCount,
		metrics.OldGcCount,
		metrics.Timestamp,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err == nil {
		metrics.ID = id
	}
	return nil
}

func (s *SQLiteStorage) GetLatest(targetName string) (*models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, status, active, idle, pending, max, timeout, acquire_p99,
		heap_used, heap_max, non_heap_used, non_heap_max, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
	FROM pool_metrics
	WHERE target_name = ?
	ORDER BY timestamp DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName)

	var m models.PoolMetrics
	err := row.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Status, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99,
		&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.NonHeapMax, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *SQLiteStorage) GetLatestByInstance(targetName, instanceName string) (*models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, status, active, idle, pending, max, timeout, acquire_p99,
		heap_used, heap_max, non_heap_used, non_heap_max, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
	FROM pool_metrics
	WHERE target_name = ? AND instance_name = ?
	ORDER BY timestamp DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName, instanceName)

	var m models.PoolMetrics
	err := row.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Status, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99,
		&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.NonHeapMax, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *SQLiteStorage) GetLatestAllInstances(targetName string) ([]models.PoolMetrics, error) {
	query := `
	SELECT p.id, p.target_name, p.instance_name, p.status, p.active, p.idle, p.pending, p.max, p.timeout, p.acquire_p99,
		p.heap_used, p.heap_max, p.non_heap_used, p.non_heap_max, p.threads_live, p.cpu_usage, p.gc_count, p.gc_time, p.young_gc_count, p.old_gc_count, p.timestamp
	FROM pool_metrics p
	INNER JOIN (
		SELECT instance_name, MAX(timestamp) as max_ts
		FROM pool_metrics
		WHERE target_name = ?
		GROUP BY instance_name
	) latest ON p.instance_name = latest.instance_name AND p.timestamp = latest.max_ts
	WHERE p.target_name = ?
	ORDER BY p.instance_name
	`
	rows, err := s.db.Query(query, targetName, targetName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.PoolMetrics
	for rows.Next() {
		var m models.PoolMetrics
		if err := rows.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Status, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99,
			&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.NonHeapMax, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetHistory(targetName string, from, to time.Time) ([]models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, status, active, idle, pending, max, timeout, acquire_p99,
		heap_used, heap_max, non_heap_used, non_heap_max, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
	FROM pool_metrics
	WHERE target_name = ? AND timestamp BETWEEN ? AND ?
	ORDER BY timestamp ASC
	`
	rows, err := s.db.Query(query, targetName, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.PoolMetrics
	for rows.Next() {
		var m models.PoolMetrics
		if err := rows.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Status, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99,
			&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.NonHeapMax, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetHistoryByInstance(targetName, instanceName string, from, to time.Time) ([]models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, status, active, idle, pending, max, timeout, acquire_p99,
		heap_used, heap_max, non_heap_used, non_heap_max, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
	FROM pool_metrics
	WHERE target_name = ? AND instance_name = ? AND timestamp BETWEEN ? AND ?
	ORDER BY timestamp ASC
	`
	rows, err := s.db.Query(query, targetName, instanceName, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.PoolMetrics
	for rows.Next() {
		var m models.PoolMetrics
		if err := rows.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Status, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99,
			&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.NonHeapMax, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetInstances(targetName string) ([]string, error) {
	query := `SELECT DISTINCT instance_name FROM pool_metrics WHERE target_name = ? ORDER BY instance_name`
	rows, err := s.db.Query(query, targetName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var instances []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		instances = append(instances, name)
	}
	return instances, rows.Err()
}

func (s *SQLiteStorage) GetTargets() ([]string, error) {
	query := `SELECT DISTINCT target_name FROM pool_metrics`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		targets = append(targets, name)
	}
	return targets, rows.Err()
}

func (s *SQLiteStorage) Cleanup(olderThan time.Time) (int64, error) {
	query := `DELETE FROM pool_metrics WHERE timestamp < ?`
	result, err := s.db.Exec(query, olderThan)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *SQLiteStorage) Close() error {
	return s.db.Close()
}

// Alert-related methods

func (s *SQLiteStorage) SaveAlert(alert *models.Alert) error {
	query := `
	INSERT INTO alerts (target_name, instance_name, rule_name, severity, message, status, fired_at, resolved_at, notified_at, channels)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	result, err := s.db.Exec(query,
		alert.TargetName,
		alert.InstanceName,
		alert.RuleName,
		alert.Severity,
		alert.Message,
		alert.Status,
		alert.FiredAt,
		alert.ResolvedAt,
		alert.NotifiedAt,
		alert.Channels,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err == nil {
		alert.ID = id
	}
	return nil
}

func (s *SQLiteStorage) UpdateAlert(alert *models.Alert) error {
	query := `
	UPDATE alerts SET
		severity = ?,
		message = ?,
		status = ?,
		resolved_at = ?,
		notified_at = ?,
		channels = ?
	WHERE id = ?
	`
	_, err := s.db.Exec(query,
		alert.Severity,
		alert.Message,
		alert.Status,
		alert.ResolvedAt,
		alert.NotifiedAt,
		alert.Channels,
		alert.ID,
	)
	return err
}

func (s *SQLiteStorage) GetAlert(id int64) (*models.Alert, error) {
	query := `
	SELECT id, target_name, instance_name, rule_name, severity, message, status, fired_at, resolved_at, notified_at, channels
	FROM alerts
	WHERE id = ?
	`
	row := s.db.QueryRow(query, id)

	var a models.Alert
	err := row.Scan(&a.ID, &a.TargetName, &a.InstanceName, &a.RuleName, &a.Severity, &a.Message, &a.Status, &a.FiredAt, &a.ResolvedAt, &a.NotifiedAt, &a.Channels)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *SQLiteStorage) GetAlerts(status string, limit int) ([]models.Alert, error) {
	var query string
	var args []interface{}

	if status != "" {
		query = `
		SELECT id, target_name, instance_name, rule_name, severity, message, status, fired_at, resolved_at, notified_at, channels
		FROM alerts
		WHERE status = ?
		ORDER BY fired_at DESC
		LIMIT ?
		`
		args = []interface{}{status, limit}
	} else {
		query = `
		SELECT id, target_name, instance_name, rule_name, severity, message, status, fired_at, resolved_at, notified_at, channels
		FROM alerts
		ORDER BY fired_at DESC
		LIMIT ?
		`
		args = []interface{}{limit}
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.Alert
	for rows.Next() {
		var a models.Alert
		if err := rows.Scan(&a.ID, &a.TargetName, &a.InstanceName, &a.RuleName, &a.Severity, &a.Message, &a.Status, &a.FiredAt, &a.ResolvedAt, &a.NotifiedAt, &a.Channels); err != nil {
			return nil, err
		}
		results = append(results, a)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetActiveAlertByRule(targetName, instanceName, ruleName string) (*models.Alert, error) {
	query := `
	SELECT id, target_name, instance_name, rule_name, severity, message, status, fired_at, resolved_at, notified_at, channels
	FROM alerts
	WHERE target_name = ? AND instance_name = ? AND rule_name = ? AND status = 'fired'
	ORDER BY fired_at DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName, instanceName, ruleName)

	var a models.Alert
	err := row.Scan(&a.ID, &a.TargetName, &a.InstanceName, &a.RuleName, &a.Severity, &a.Message, &a.Status, &a.FiredAt, &a.ResolvedAt, &a.NotifiedAt, &a.Channels)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *SQLiteStorage) GetAlertStats() (*models.AlertStats, error) {
	stats := &models.AlertStats{
		BySeverity: make(map[string]int),
		ByTarget:   make(map[string]int),
		ByRule:     make(map[string]int),
	}

	// Combined query using UNION ALL for better performance (single table scan)
	query := `
		SELECT 'status' as type, status as key, COUNT(*) as count FROM alerts GROUP BY status
		UNION ALL
		SELECT 'severity', severity, COUNT(*) FROM alerts WHERE status = 'fired' GROUP BY severity
		UNION ALL
		SELECT 'target', target_name, COUNT(*) FROM alerts WHERE status = 'fired' GROUP BY target_name
		UNION ALL
		SELECT 'rule', rule_name, COUNT(*) FROM alerts WHERE status = 'fired' GROUP BY rule_name
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var typ, key string
		var count int
		if err := rows.Scan(&typ, &key, &count); err != nil {
			return nil, err
		}

		switch typ {
		case "status":
			stats.TotalAlerts += count
			if key == "fired" {
				stats.ActiveAlerts = count
			} else {
				stats.ResolvedAlerts += count
			}
		case "severity":
			stats.BySeverity[key] = count
		case "target":
			stats.ByTarget[key] = count
		case "rule":
			stats.ByRule[key] = count
		}
	}

	return stats, nil
}

func (s *SQLiteStorage) CleanupAlerts(olderThan time.Time) (int64, error) {
	query := `DELETE FROM alerts WHERE status = 'resolved' AND resolved_at < ?`
	result, err := s.db.Exec(query, olderThan)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// AlertRule-related methods

func (s *SQLiteStorage) migrateAlertRules() error {
	query := `
	CREATE TABLE IF NOT EXISTS alert_rules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		condition TEXT NOT NULL,
		severity TEXT NOT NULL DEFAULT 'warning',
		message TEXT,
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_alert_rules_name ON alert_rules(name);
	CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
	`
	_, err := s.db.Exec(query)
	return err
}

func (s *SQLiteStorage) SaveAlertRule(rule *models.AlertRule) error {
	// Ensure table exists
	if err := s.migrateAlertRules(); err != nil {
		return err
	}

	query := `
	INSERT INTO alert_rules (name, condition, severity, message, enabled, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	now := time.Now()
	result, err := s.db.Exec(query,
		rule.Name,
		rule.Condition,
		rule.Severity,
		rule.Message,
		rule.Enabled,
		now,
		now,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err == nil {
		rule.ID = id
		rule.CreatedAt = now
		rule.UpdatedAt = now
	}
	return nil
}

func (s *SQLiteStorage) UpdateAlertRule(rule *models.AlertRule) error {
	query := `
	UPDATE alert_rules SET
		name = ?,
		condition = ?,
		severity = ?,
		message = ?,
		enabled = ?,
		updated_at = ?
	WHERE id = ?
	`
	now := time.Now()
	_, err := s.db.Exec(query,
		rule.Name,
		rule.Condition,
		rule.Severity,
		rule.Message,
		rule.Enabled,
		now,
		rule.ID,
	)
	if err == nil {
		rule.UpdatedAt = now
	}
	return err
}

func (s *SQLiteStorage) DeleteAlertRule(id int64) error {
	query := `DELETE FROM alert_rules WHERE id = ?`
	_, err := s.db.Exec(query, id)
	return err
}

func (s *SQLiteStorage) GetAlertRule(id int64) (*models.AlertRule, error) {
	// Ensure table exists
	if err := s.migrateAlertRules(); err != nil {
		return nil, err
	}

	query := `
	SELECT id, name, condition, severity, message, enabled, created_at, updated_at
	FROM alert_rules
	WHERE id = ?
	`
	row := s.db.QueryRow(query, id)

	var r models.AlertRule
	var enabled int
	err := row.Scan(&r.ID, &r.Name, &r.Condition, &r.Severity, &r.Message, &enabled, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.Enabled = enabled == 1
	return &r, nil
}

func (s *SQLiteStorage) GetAlertRules() ([]models.AlertRule, error) {
	// Ensure table exists
	if err := s.migrateAlertRules(); err != nil {
		return nil, err
	}

	query := `
	SELECT id, name, condition, severity, message, enabled, created_at, updated_at
	FROM alert_rules
	ORDER BY created_at ASC
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.AlertRule
	for rows.Next() {
		var r models.AlertRule
		var enabled int
		if err := rows.Scan(&r.ID, &r.Name, &r.Condition, &r.Severity, &r.Message, &enabled, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.Enabled = enabled == 1
		results = append(results, r)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetAlertRuleByName(name string) (*models.AlertRule, error) {
	// Ensure table exists
	if err := s.migrateAlertRules(); err != nil {
		return nil, err
	}

	query := `
	SELECT id, name, condition, severity, message, enabled, created_at, updated_at
	FROM alert_rules
	WHERE name = ?
	`
	row := s.db.QueryRow(query, name)

	var r models.AlertRule
	var enabled int
	err := row.Scan(&r.ID, &r.Name, &r.Condition, &r.Severity, &r.Message, &enabled, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.Enabled = enabled == 1
	return &r, nil
}

// CreateBackup creates a backup of the database
func (s *SQLiteStorage) CreateBackup(destPath string) error {
	// Sanitize path to prevent SQL injection
	safePath, err := sanitizeSQLitePath(destPath)
	if err != nil {
		return fmt.Errorf("invalid backup path: %w", err)
	}

	// Ensure directory exists
	dir := filepath.Dir(safePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Use SQLite VACUUM INTO for online backup
	query := fmt.Sprintf(`VACUUM INTO '%s'`, safePath)
	_, err = s.db.Exec(query)
	return err
}

// RestoreBackup restores the database from a backup file
func (s *SQLiteStorage) RestoreBackup(srcPath string) error {
	// Sanitize path to prevent SQL injection
	safePath, err := sanitizeSQLitePath(srcPath)
	if err != nil {
		return fmt.Errorf("invalid backup path: %w", err)
	}

	// Check SQLite file magic number before opening
	file, err := os.Open(safePath)
	if err != nil {
		return fmt.Errorf("cannot open backup file: %w", err)
	}
	magic := make([]byte, 16)
	n, err := file.Read(magic)
	file.Close()
	if err != nil || n < 16 {
		return fmt.Errorf("cannot read backup file header")
	}
	// SQLite database file header: "SQLite format 3\x00"
	if string(magic) != "SQLite format 3\x00" {
		return fmt.Errorf("backup file is not a valid SQLite database")
	}

	// Validate the backup file is a valid SQLite database
	srcDB, err := sql.Open("sqlite", safePath)
	if err != nil {
		return fmt.Errorf("invalid backup file: %w", err)
	}

	// Run integrity check
	var integrityResult string
	err = srcDB.QueryRow("PRAGMA integrity_check").Scan(&integrityResult)
	if err != nil {
		srcDB.Close()
		return fmt.Errorf("backup file integrity check failed: %w", err)
	}
	if integrityResult != "ok" {
		srcDB.Close()
		return fmt.Errorf("backup file is corrupted: %s", integrityResult)
	}

	// Check if it's a valid SQLite database with expected tables
	var tableName string
	err = srcDB.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='pool_metrics' LIMIT 1").Scan(&tableName)
	if err := srcDB.Close(); err != nil {
		log.Printf("Warning: failed to close backup database: %v", err)
	}
	if err != nil {
		return fmt.Errorf("backup file does not contain pondy data: %w", err)
	}

	// Delete existing data and import from backup
	// Table names are hardcoded whitelist - safe from SQL injection
	tables := []string{"pool_metrics", "alerts", "alert_rules"}
	for _, table := range tables {
		// Clear existing data using parameterized approach (table names whitelisted)
		_, err := s.db.Exec(fmt.Sprintf("DELETE FROM %s", table))
		if err != nil {
			log.Printf("Warning: could not clear table %s: %v", table, err)
		}
	}

	// Attach backup database and copy data
	_, err = s.db.Exec(fmt.Sprintf("ATTACH DATABASE '%s' AS backup", safePath))
	if err != nil {
		return fmt.Errorf("failed to attach backup: %w", err)
	}
	defer s.db.Exec("DETACH DATABASE backup")

	// Copy pool_metrics
	_, err = s.db.Exec(`
		INSERT INTO pool_metrics
		SELECT * FROM backup.pool_metrics
	`)
	if err != nil {
		log.Printf("Warning: could not restore pool_metrics: %v", err)
	}

	// Copy alerts (if table exists in backup)
	_, err = s.db.Exec(`
		INSERT INTO alerts
		SELECT * FROM backup.alerts
	`)
	if err != nil {
		log.Printf("Warning: could not restore alerts: %v", err)
	}

	// Copy alert_rules (if table exists in backup)
	_, err = s.db.Exec(`
		INSERT INTO alert_rules
		SELECT * FROM backup.alert_rules
	`)
	if err != nil {
		log.Printf("Warning: could not restore alert_rules: %v", err)
	}

	// Copy maintenance_windows (if table exists in backup)
	_, err = s.db.Exec(`
		INSERT INTO maintenance_windows
		SELECT * FROM backup.maintenance_windows
	`)
	if err != nil {
		log.Printf("Warning: could not restore maintenance_windows: %v", err)
	}

	return nil
}

// MaintenanceWindow-related methods

func (s *SQLiteStorage) migrateMaintenanceWindows() error {
	query := `
	CREATE TABLE IF NOT EXISTS maintenance_windows (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		description TEXT,
		target_name TEXT,
		start_time DATETIME NOT NULL,
		end_time DATETIME NOT NULL,
		recurring INTEGER NOT NULL DEFAULT 0,
		days_of_week TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_maintenance_windows_target ON maintenance_windows(target_name);
	CREATE INDEX IF NOT EXISTS idx_maintenance_windows_time ON maintenance_windows(start_time, end_time);
	`
	_, err := s.db.Exec(query)
	return err
}

func (s *SQLiteStorage) SaveMaintenanceWindow(window *models.MaintenanceWindow) error {
	if err := s.migrateMaintenanceWindows(); err != nil {
		return err
	}

	query := `
	INSERT INTO maintenance_windows (name, description, target_name, start_time, end_time, recurring, days_of_week, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	now := time.Now()
	result, err := s.db.Exec(query,
		window.Name,
		window.Description,
		window.TargetName,
		window.StartTime,
		window.EndTime,
		window.Recurring,
		window.DaysOfWeek,
		now,
		now,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err == nil {
		window.ID = id
		window.CreatedAt = now
		window.UpdatedAt = now
	}
	return nil
}

func (s *SQLiteStorage) UpdateMaintenanceWindow(window *models.MaintenanceWindow) error {
	query := `
	UPDATE maintenance_windows SET
		name = ?,
		description = ?,
		target_name = ?,
		start_time = ?,
		end_time = ?,
		recurring = ?,
		days_of_week = ?,
		updated_at = ?
	WHERE id = ?
	`
	now := time.Now()
	_, err := s.db.Exec(query,
		window.Name,
		window.Description,
		window.TargetName,
		window.StartTime,
		window.EndTime,
		window.Recurring,
		window.DaysOfWeek,
		now,
		window.ID,
	)
	if err == nil {
		window.UpdatedAt = now
	}
	return err
}

func (s *SQLiteStorage) DeleteMaintenanceWindow(id int64) error {
	query := `DELETE FROM maintenance_windows WHERE id = ?`
	_, err := s.db.Exec(query, id)
	return err
}

func (s *SQLiteStorage) GetMaintenanceWindow(id int64) (*models.MaintenanceWindow, error) {
	if err := s.migrateMaintenanceWindows(); err != nil {
		return nil, err
	}

	query := `
	SELECT id, name, description, target_name, start_time, end_time, recurring, days_of_week, created_at, updated_at
	FROM maintenance_windows
	WHERE id = ?
	`
	row := s.db.QueryRow(query, id)

	var w models.MaintenanceWindow
	var description, targetName, daysOfWeek sql.NullString
	err := row.Scan(&w.ID, &w.Name, &description, &targetName, &w.StartTime, &w.EndTime, &w.Recurring, &daysOfWeek, &w.CreatedAt, &w.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	w.Description = description.String
	w.TargetName = targetName.String
	w.DaysOfWeek = daysOfWeek.String

	return &w, nil
}

func (s *SQLiteStorage) GetAllMaintenanceWindows() ([]models.MaintenanceWindow, error) {
	if err := s.migrateMaintenanceWindows(); err != nil {
		return nil, err
	}

	query := `
	SELECT id, name, description, target_name, start_time, end_time, recurring, days_of_week, created_at, updated_at
	FROM maintenance_windows
	ORDER BY created_at DESC
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var windows []models.MaintenanceWindow
	for rows.Next() {
		var w models.MaintenanceWindow
		var description, targetName, daysOfWeek sql.NullString
		if err := rows.Scan(&w.ID, &w.Name, &description, &targetName, &w.StartTime, &w.EndTime, &w.Recurring, &daysOfWeek, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		w.Description = description.String
		w.TargetName = targetName.String
		w.DaysOfWeek = daysOfWeek.String
		windows = append(windows, w)
	}

	return windows, rows.Err()
}

func (s *SQLiteStorage) GetActiveMaintenanceWindows() ([]models.MaintenanceWindow, error) {
	if err := s.migrateMaintenanceWindows(); err != nil {
		return nil, err
	}

	now := time.Now()
	nowStr := now.Format(time.RFC3339)

	// First, filter non-recurring windows at SQL level for efficiency
	// Then load recurring windows and filter in Go
	query := `
		SELECT id, name, description, target_name, start_time, end_time, recurring, days_of_week, created_at, updated_at
		FROM maintenance_windows
		WHERE (recurring = 0 AND start_time <= ? AND end_time >= ?)
		   OR recurring = 1
		ORDER BY start_time ASC
	`

	rows, err := s.db.Query(query, nowStr, nowStr)
	if err != nil {
		return nil, fmt.Errorf("failed to query maintenance windows: %w", err)
	}
	defer rows.Close()

	var active []models.MaintenanceWindow
	for rows.Next() {
		var w models.MaintenanceWindow
		var desc, targetName, daysOfWeek sql.NullString
		if err := rows.Scan(&w.ID, &w.Name, &desc, &targetName, &w.StartTime, &w.EndTime, &w.Recurring, &daysOfWeek, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan maintenance window: %w", err)
		}
		w.Description = desc.String
		w.TargetName = targetName.String
		w.DaysOfWeek = daysOfWeek.String

		// For non-recurring, already filtered by SQL; for recurring, filter in Go
		if !w.Recurring || w.IsActive(now) {
			active = append(active, w)
		}
	}

	return active, rows.Err()
}

// IsInMaintenanceWindow checks if the given target is currently in a maintenance window
func (s *SQLiteStorage) IsInMaintenanceWindow(targetName string) (bool, error) {
	activeWindows, err := s.GetActiveMaintenanceWindows()
	if err != nil {
		return false, err
	}

	for _, w := range activeWindows {
		if w.MatchesTarget(targetName) {
			return true, nil
		}
	}

	return false, nil
}
