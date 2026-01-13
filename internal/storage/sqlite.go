package storage

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/jiin/pondy/internal/models"
	_ "modernc.org/sqlite"
)

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

	// Limit to single connection to avoid lock contention
	db.SetMaxOpenConns(1)

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
		heap_used, heap_max, non_heap_used, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		heap_used, heap_max, non_heap_used, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
	FROM pool_metrics
	WHERE target_name = ?
	ORDER BY timestamp DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName)

	var m models.PoolMetrics
	err := row.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Status, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99,
		&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp)
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
		heap_used, heap_max, non_heap_used, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
	FROM pool_metrics
	WHERE target_name = ? AND instance_name = ?
	ORDER BY timestamp DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName, instanceName)

	var m models.PoolMetrics
	err := row.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Status, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99,
		&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp)
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
		p.heap_used, p.heap_max, p.non_heap_used, p.threads_live, p.cpu_usage, p.gc_count, p.gc_time, p.young_gc_count, p.old_gc_count, p.timestamp
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
			&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetHistory(targetName string, from, to time.Time) ([]models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, status, active, idle, pending, max, timeout, acquire_p99,
		heap_used, heap_max, non_heap_used, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
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
			&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetHistoryByInstance(targetName, instanceName string, from, to time.Time) ([]models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, status, active, idle, pending, max, timeout, acquire_p99,
		heap_used, heap_max, non_heap_used, threads_live, cpu_usage, gc_count, gc_time, young_gc_count, old_gc_count, timestamp
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
			&m.HeapUsed, &m.HeapMax, &m.NonHeapUsed, &m.ThreadsLive, &m.CpuUsage, &m.GcCount, &m.GcTime, &m.YoungGcCount, &m.OldGcCount, &m.Timestamp); err != nil {
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

	// Total and by status
	query := `SELECT COUNT(*), status FROM alerts GROUP BY status`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var count int
		var status string
		if err := rows.Scan(&count, &status); err != nil {
			rows.Close()
			return nil, err
		}
		stats.TotalAlerts += count
		if status == "fired" {
			stats.ActiveAlerts = count
		} else {
			stats.ResolvedAlerts += count
		}
	}
	rows.Close()

	// By severity (active only)
	query = `SELECT COUNT(*), severity FROM alerts WHERE status = 'fired' GROUP BY severity`
	rows, err = s.db.Query(query)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var count int
		var severity string
		if err := rows.Scan(&count, &severity); err != nil {
			rows.Close()
			return nil, err
		}
		stats.BySeverity[severity] = count
	}
	rows.Close()

	// By target (active only)
	query = `SELECT COUNT(*), target_name FROM alerts WHERE status = 'fired' GROUP BY target_name`
	rows, err = s.db.Query(query)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var count int
		var target string
		if err := rows.Scan(&count, &target); err != nil {
			rows.Close()
			return nil, err
		}
		stats.ByTarget[target] = count
	}
	rows.Close()

	// By rule (active only)
	query = `SELECT COUNT(*), rule_name FROM alerts WHERE status = 'fired' GROUP BY rule_name`
	rows, err = s.db.Query(query)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var count int
		var rule string
		if err := rows.Scan(&count, &rule); err != nil {
			rows.Close()
			return nil, err
		}
		stats.ByRule[rule] = count
	}
	rows.Close()

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
	// Ensure directory exists
	dir := filepath.Dir(destPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Use SQLite VACUUM INTO for online backup
	query := fmt.Sprintf(`VACUUM INTO '%s'`, destPath)
	_, err := s.db.Exec(query)
	return err
}

// RestoreBackup restores the database from a backup file
func (s *SQLiteStorage) RestoreBackup(srcPath string) error {
	// Validate the backup file is a valid SQLite database
	srcDB, err := sql.Open("sqlite", srcPath)
	if err != nil {
		return fmt.Errorf("invalid backup file: %w", err)
	}

	// Check if it's a valid SQLite database with expected tables
	var tableName string
	err = srcDB.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='pool_metrics' LIMIT 1").Scan(&tableName)
	srcDB.Close()
	if err != nil {
		return fmt.Errorf("backup file does not contain pondy data: %w", err)
	}

	// Delete existing data and import from backup
	tables := []string{"pool_metrics", "alerts", "alert_rules"}
	for _, table := range tables {
		// Clear existing data
		_, err := s.db.Exec(fmt.Sprintf("DELETE FROM %s", table))
		if err != nil {
			log.Printf("Warning: could not clear table %s: %v", table, err)
		}
	}

	// Attach backup database and copy data
	_, err = s.db.Exec(fmt.Sprintf("ATTACH DATABASE '%s' AS backup", srcPath))
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

	return nil
}
