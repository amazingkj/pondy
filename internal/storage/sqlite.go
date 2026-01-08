package storage

import (
	"database/sql"
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
	query := `
	CREATE TABLE IF NOT EXISTS pool_metrics (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		target_name TEXT NOT NULL,
		active INTEGER NOT NULL,
		idle INTEGER NOT NULL,
		pending INTEGER NOT NULL,
		max INTEGER NOT NULL,
		timeout INTEGER DEFAULT 0,
		acquire_p99 REAL DEFAULT 0,
		timestamp DATETIME NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_metrics_target_time
	ON pool_metrics(target_name, timestamp DESC);
	`
	_, err := s.db.Exec(query)
	return err
}

func (s *SQLiteStorage) Save(metrics *models.PoolMetrics) error {
	query := `
	INSERT INTO pool_metrics (target_name, active, idle, pending, max, timeout, acquire_p99, timestamp)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	result, err := s.db.Exec(query,
		metrics.TargetName,
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
	SELECT id, target_name, active, idle, pending, max, timeout, acquire_p99, timestamp
	FROM pool_metrics
	WHERE target_name = ?
	ORDER BY timestamp DESC
	LIMIT 1
	`
	row := s.db.QueryRow(query, targetName)

	var m models.PoolMetrics
	err := row.Scan(&m.ID, &m.TargetName, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99, &m.Timestamp)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *SQLiteStorage) GetHistory(targetName string, from, to time.Time) ([]models.PoolMetrics, error) {
	query := `
	SELECT id, target_name, active, idle, pending, max, timeout, acquire_p99, timestamp
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
		if err := rows.Scan(&m.ID, &m.TargetName, &m.Active, &m.Idle, &m.Pending, &m.Max, &m.Timeout, &m.AcquireP99, &m.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
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

func (s *SQLiteStorage) Close() error {
	return s.db.Close()
}
