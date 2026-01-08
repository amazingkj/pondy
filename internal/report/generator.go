package report

import (
	"bytes"
	"html/template"
	"time"

	"github.com/jiin/pondy/internal/analyzer"
	"github.com/jiin/pondy/internal/models"
)

// ReportData contains all data for report generation
type ReportData struct {
	TargetName      string
	GeneratedAt     time.Time
	Range           string
	DataPoints      int
	Summary         ReportSummary
	Recommendations []analyzer.Recommendation
	Anomalies       []analyzer.Anomaly
	PeakTime        *analyzer.PeakTimeResult
	LeakAnalysis    *analyzer.LeakAnalysisResult
}

// ReportSummary contains summary statistics
type ReportSummary struct {
	AvgUsage      float64
	MaxUsage      float64
	MinUsage      float64
	AvgActive     float64
	AvgIdle       float64
	AvgPending    float64
	TotalTimeouts int64
	HealthScore   int
	RiskLevel     string
}

// BuildReportData builds report data from metrics and analysis results
func BuildReportData(targetName string, rangeStr string, metrics []models.PoolMetrics,
	recs *analyzer.AnalysisResult, leaks *analyzer.LeakAnalysisResult,
	anomalies *analyzer.AnomalyResult, peakTime *analyzer.PeakTimeResult) *ReportData {

	data := &ReportData{
		TargetName:  targetName,
		GeneratedAt: time.Now(),
		Range:       rangeStr,
		DataPoints:  len(metrics),
	}

	// Calculate summary from metrics
	if len(metrics) > 0 {
		var totalUsage, totalActive, totalIdle, totalPending float64
		var maxUsage, minUsage float64 = 0, 100

		for _, m := range metrics {
			var usage float64
			if m.Max > 0 {
				usage = float64(m.Active) / float64(m.Max) * 100
			}
			totalUsage += usage
			totalActive += float64(m.Active)
			totalIdle += float64(m.Idle)
			totalPending += float64(m.Pending)

			if usage > maxUsage {
				maxUsage = usage
			}
			if usage < minUsage {
				minUsage = usage
			}
			data.Summary.TotalTimeouts += m.Timeout
		}

		n := float64(len(metrics))
		data.Summary.AvgUsage = totalUsage / n
		data.Summary.MaxUsage = maxUsage
		data.Summary.MinUsage = minUsage
		data.Summary.AvgActive = totalActive / n
		data.Summary.AvgIdle = totalIdle / n
		data.Summary.AvgPending = totalPending / n
	}

	// Add recommendations
	if recs != nil {
		data.Recommendations = recs.Recommendations
	}

	// Add leak analysis
	if leaks != nil {
		data.LeakAnalysis = leaks
		data.Summary.HealthScore = leaks.HealthScore
		data.Summary.RiskLevel = leaks.LeakRisk
	}

	// Add anomalies
	if anomalies != nil {
		data.Anomalies = anomalies.Anomalies
	}

	// Add peak time
	if peakTime != nil {
		data.PeakTime = peakTime
	}

	return data
}

// GenerateHTMLReport generates an HTML report
func GenerateHTMLReport(data *ReportData) ([]byte, error) {
	tmpl, err := template.New("report").Parse(reportTemplate)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

const reportTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Pondy Report - {{.TargetName}}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f3f4f6;
            color: #111827;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            padding: 40px;
        }
        h1 {
            color: #111827;
            margin: 0 0 8px 0;
            font-size: 28px;
        }
        h2 {
            color: #374151;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 8px;
            margin-top: 32px;
            font-size: 18px;
        }
        .subtitle {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 24px;
        }
        .stat-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f9fafb;
            border-radius: 8px;
            padding: 16px;
            text-align: center;
        }
        .stat-value {
            font-size: 28px;
            font-weight: bold;
            color: #111827;
        }
        .stat-label {
            font-size: 12px;
            color: #6b7280;
            margin-top: 4px;
        }
        .recommendation {
            padding: 14px;
            margin: 10px 0;
            border-radius: 8px;
            border-left: 4px solid;
        }
        .rec-critical {
            background: #fee2e2;
            border-color: #ef4444;
        }
        .rec-warning {
            background: #fef3c7;
            border-color: #f59e0b;
        }
        .rec-info {
            background: #dbeafe;
            border-color: #3b82f6;
        }
        .rec-type {
            font-weight: 600;
            color: #374151;
            font-size: 14px;
        }
        .rec-reason {
            font-size: 13px;
            color: #4b5563;
            margin-top: 6px;
        }
        .rec-values {
            font-size: 12px;
            color: #6b7280;
            margin-top: 6px;
        }
        .anomaly {
            padding: 10px 14px;
            margin: 8px 0;
            border-radius: 6px;
            font-size: 13px;
        }
        .anomaly-critical { background: #fee2e2; }
        .anomaly-warning { background: #fef3c7; }
        .anomaly-type { font-weight: 600; }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #9ca3af;
            font-size: 12px;
            text-align: center;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 500;
        }
        .badge-healthy { background: #dcfce7; color: #166534; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-critical { background: #fee2e2; color: #991b1b; }
        .badge-info { background: #dbeafe; color: #1e40af; }
        .no-data {
            padding: 20px;
            background: #f9fafb;
            border-radius: 8px;
            color: #6b7280;
            text-align: center;
        }
        @media print {
            body { background: white; padding: 0; }
            .container { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Connection Pool Report</h1>
        <div class="subtitle">
            <strong>Target:</strong> {{.TargetName}} |
            <strong>Generated:</strong> {{.GeneratedAt.Format "2006-01-02 15:04:05"}} |
            <strong>Range:</strong> {{.Range}} |
            <strong>Data Points:</strong> {{.DataPoints}}
        </div>

        <h2>Summary</h2>
        <div class="stat-grid">
            <div class="stat-card">
                <div class="stat-value">{{printf "%.1f" .Summary.AvgUsage}}%</div>
                <div class="stat-label">Avg Usage</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{printf "%.1f" .Summary.MaxUsage}}%</div>
                <div class="stat-label">Peak Usage</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{.Summary.HealthScore}}</div>
                <div class="stat-label">Health Score</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">
                    <span class="badge {{if eq .Summary.RiskLevel "high"}}badge-critical{{else if eq .Summary.RiskLevel "medium"}}badge-warning{{else if eq .Summary.RiskLevel "low"}}badge-info{{else}}badge-healthy{{end}}">
                        {{if .Summary.RiskLevel}}{{.Summary.RiskLevel}}{{else}}none{{end}}
                    </span>
                </div>
                <div class="stat-label">Risk Level</div>
            </div>
        </div>
        <div class="stat-grid">
            <div class="stat-card">
                <div class="stat-value">{{printf "%.1f" .Summary.AvgActive}}</div>
                <div class="stat-label">Avg Active</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{printf "%.1f" .Summary.AvgIdle}}</div>
                <div class="stat-label">Avg Idle</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{printf "%.1f" .Summary.AvgPending}}</div>
                <div class="stat-label">Avg Pending</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{.Summary.TotalTimeouts}}</div>
                <div class="stat-label">Total Timeouts</div>
            </div>
        </div>

        {{if .PeakTime}}
        {{if .PeakTime.Summary}}
        <h2>Peak Time Analysis</h2>
        <div class="stat-grid">
            <div class="stat-card">
                <div class="stat-value">{{.PeakTime.Summary.BusiestHour}}:00</div>
                <div class="stat-label">Busiest Hour</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{printf "%.1f" .PeakTime.Summary.BusiestHourUsage}}%</div>
                <div class="stat-label">Peak Hour Usage</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{.PeakTime.Summary.QuietestHour}}:00</div>
                <div class="stat-label">Quietest Hour</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{printf "%.1f" .PeakTime.Summary.QuietestUsage}}%</div>
                <div class="stat-label">Quiet Hour Usage</div>
            </div>
        </div>
        {{if .PeakTime.Summary.Recommendation}}
        <div class="recommendation rec-info">
            <div class="rec-type">Recommendation</div>
            <div class="rec-reason">{{.PeakTime.Summary.Recommendation}}</div>
        </div>
        {{end}}
        {{end}}
        {{end}}

        <h2>Recommendations</h2>
        {{if .Recommendations}}
        {{range .Recommendations}}
        <div class="recommendation rec-{{.Severity}}">
            <div class="rec-type">{{.Type}}</div>
            <div class="rec-reason">{{.Reason}}</div>
            {{if ne .Current .Recommended}}
            <div class="rec-values">{{.Current}} → <strong>{{.Recommended}}</strong></div>
            {{end}}
        </div>
        {{end}}
        {{else}}
        <div class="no-data">No recommendations at this time</div>
        {{end}}

        {{if .Anomalies}}
        <h2>Anomalies ({{len .Anomalies}})</h2>
        {{range .Anomalies}}
        <div class="anomaly anomaly-{{.Severity}}">
            <span class="anomaly-type">{{.Type}}</span>: {{.Message}}
            <span style="color: #6b7280;">({{.Timestamp.Format "15:04"}})</span>
        </div>
        {{end}}
        {{end}}

        {{if .LeakAnalysis}}
        {{if .LeakAnalysis.Alerts}}
        <h2>Leak Detection Alerts</h2>
        {{range .LeakAnalysis.Alerts}}
        <div class="recommendation rec-{{.Severity}}">
            <div class="rec-type">{{.Type}}</div>
            <div class="rec-reason">{{.Message}}</div>
            {{if .Suggestions}}
            <div class="rec-values">
                <strong>Suggestions:</strong>
                <ul style="margin: 4px 0 0 16px; padding: 0;">
                {{range .Suggestions}}
                    <li>{{.}}</li>
                {{end}}
                </ul>
            </div>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{end}}

        <div class="footer">
            Generated by <strong>Pondy</strong> - JVM Connection Pool Monitor<br>
            <a href="https://github.com/amazingkj/pondy" style="color: #6b7280;">https://github.com/amazingkj/pondy</a>
        </div>
    </div>
</body>
</html>`
