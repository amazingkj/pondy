package storage

import (
	"database/sql"
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

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	storage := &SQLiteStorage{db: db}
	if err := storage.migrate(); err != nil {
		db.Close()
		return nil, err
	}

	return storage, nil
}

func (s *SQLiteStorage) migrate() error {
	// Create table with instance_name column
	query := `
	CREATE TABLE IF NOT EXISTS pool_metrics (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		target_name TEXT NOT NULL,
		instance_name TEXT NOT NULL DEFAULT 'default',
		active INTEGER NOT NULL,
		idle INTEGER NOT NULL,
		pending INTEGER NOT NULL,
		max INTEGER NOT NULL,
		timeout INTEGER DEFAULT 0,
		acquire_p99 REAL DEFAULT 0,
		timestamp DATETIME NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_metrics_target_instance_time
	ON pool_metrics(target_name, instance_name, timestamp DESC);
	`
	if _, err := s.db.Exec(query); err != nil {
		return err
	}

	// Migration: add instance_name column if it doesn't exist
	s.runMigration()

	return nil
}

func (s *SQLiteStorage) runMigration() {
	// Check if instance_name column exists
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('pool_metrics') WHERE name='instance_name'`).Scan(&count)
	if err != nil || count > 0 {
		return // Column exists or error checking
	}

	// Add column
	_, err = s.db.Exec(`ALTER TABLE pool_metrics ADD COLUMN instance_name TEXT NOT NULL DEFAULT 'default'`)
	if err != nil {
		log.Printf("Migration warning (may already exist): %v", err)
	} else {
		log.Println("Migration: added instance_name column")
	}

	// Create new index
	_, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_metrics_target_instance_time ON pool_metrics(target_name, instance_name, timestamp DESC)`)
	if err != nil {
		log.Printf("Migration warning: %v", err)
	}
}

func (s *SQLiteStorage) Save(metrics *models.PoolMetrics) error {
	// Default instance name if empty
	instanceName := metrics.InstanceName
	if instanceName == "" {
		instanceName = "default"
	}

	query := `
	INSERT INTO pool_metrics (target_name, instance_name, active, idle, pending, max, timeout, acquire_p99, timestamp)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	result, err := s.db.Exec(query,
		metrics.TargetName,
		instanceName,
		metrics.Active,
		metrics.Idle,
		metrics.Pending,
		metrics.Max,
		metrics.Timeout,
		metrics.AcquireP99,
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
	SELECT id, target_name, instance_name, active, idle, pending, max, timeout, acquire_p99, timestamp
	FROM pool_metrics
	WHERE target_name = ?
	ORDER BY timestamp DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName)

	var m models.PoolMetrics
	err := row.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99, &m.Timestamp)
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
	SELECT id, target_name, instance_name, active, idle, pending, max, timeout, acquire_p99, timestamp
	FROM pool_metrics
	WHERE target_name = ? AND instance_name = ?
	ORDER BY timestamp DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName, instanceName)

	var m models.PoolMetrics
	err := row.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99, &m.Timestamp)
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
	SELECT p.id, p.target_name, p.instance_name, p.active, p.idle, p.pending, p.max, p.timeout, p.acquire_p99, p.timestamp
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
		if err := rows.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetHistory(targetName string, from, to time.Time) ([]models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, active, idle, pending, max, timeout, acquire_p99, timestamp
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
		if err := rows.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (s *SQLiteStorage) GetHistoryByInstance(targetName, instanceName string, from, to time.Time) ([]models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, instance_name, active, idle, pending, max, timeout, acquire_p99, timestamp
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
		if err := rows.Scan(&m.ID, &m.TargetName, &m.InstanceName, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99, &m.Timestamp); err != nil {
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
