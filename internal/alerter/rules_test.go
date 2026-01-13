package alerter

import (
	"testing"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
)

func TestNewRuleContext(t *testing.T) {
	metrics := &models.PoolMetrics{
		TargetName:   "test-service",
		InstanceName: "default",
		Active:       8,
		Idle:         2,
		Pending:      1,
		Max:          10,
		Timeout:      0,
		HeapUsed:     512 * 1024 * 1024, // 512MB
		HeapMax:      1024 * 1024 * 1024, // 1GB
		CpuUsage:     0.75,
		ThreadsLive:  100,
	}

	ctx := NewRuleContext(metrics)

	if ctx.TargetName != "test-service" {
		t.Errorf("TargetName = %s, want test-service", ctx.TargetName)
	}

	if ctx.Active != 8 {
		t.Errorf("Active = %d, want 8", ctx.Active)
	}

	// Usage should be 80% (8/10 * 100)
	if ctx.Usage != 80 {
		t.Errorf("Usage = %f, want 80", ctx.Usage)
	}

	// HeapUsage should be 50% (512/1024 * 100)
	if ctx.HeapUsage != 50 {
		t.Errorf("HeapUsage = %f, want 50", ctx.HeapUsage)
	}
}

func TestNewRuleContext_ZeroMax(t *testing.T) {
	metrics := &models.PoolMetrics{
		Active:  5,
		Max:     0,
		HeapMax: 0,
	}

	ctx := NewRuleContext(metrics)

	if ctx.Usage != 0 {
		t.Errorf("Usage should be 0 when Max is 0, got %f", ctx.Usage)
	}

	if ctx.HeapUsage != 0 {
		t.Errorf("HeapUsage should be 0 when HeapMax is 0, got %f", ctx.HeapUsage)
	}
}

func TestEvaluateRule(t *testing.T) {
	ctx := &RuleContext{
		TargetName:   "test-service",
		InstanceName: "default",
		Active:       8,
		Idle:         2,
		Pending:      1,
		Max:          10,
		Usage:        80,
		HeapUsage:    50,
		CpuUsage:     0.75,
		ThreadsLive:  100,
	}

	tests := []struct {
		name      string
		condition string
		expected  bool
	}{
		{"usage greater than 70", "usage > 70", true},
		{"usage greater than 90", "usage > 90", false},
		{"usage equals 80", "usage == 80", true},
		{"active greater than 5", "active > 5", true},
		{"idle less than 5", "idle < 5", true},
		{"pending equals 1", "pending == 1", true},
		{"pending not equals 0", "pending != 0", true},
		{"usage greater or equal 80", "usage >= 80", true},
		{"usage less or equal 80", "usage <= 80", true},
		{"cpu greater than 50", "cpu > 50", true},  // 75 * 100 = 75%
		{"threads equals 100", "threads == 100", true},
		{"heapusage less than 60", "heapusage < 60", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule := &config.AlertRule{
				Name:      "test-rule",
				Condition: tt.condition,
				Severity:  "warning",
				Enabled:   boolPtr(true),
			}

			result, err := EvaluateRule(rule, ctx)
			if err != nil {
				t.Fatalf("EvaluateRule() error = %v", err)
			}

			if result != tt.expected {
				t.Errorf("EvaluateRule(%s) = %v, want %v", tt.condition, result, tt.expected)
			}
		})
	}
}

func TestEvaluateRule_DisabledRule(t *testing.T) {
	ctx := &RuleContext{Usage: 90}
	rule := &config.AlertRule{
		Name:      "disabled-rule",
		Condition: "usage > 80",
		Enabled:   boolPtr(false),
	}

	result, err := EvaluateRule(rule, ctx)
	if err != nil {
		t.Fatalf("EvaluateRule() error = %v", err)
	}

	if result != false {
		t.Error("disabled rule should return false")
	}
}

func TestEvaluateRule_InvalidCondition(t *testing.T) {
	ctx := &RuleContext{Usage: 90}

	tests := []struct {
		name      string
		condition string
	}{
		{"empty condition", ""},
		{"invalid format", "usage"},
		{"unknown variable", "unknown > 50"},
		{"invalid value", "usage > abc"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule := &config.AlertRule{
				Name:      "test-rule",
				Condition: tt.condition,
				Enabled:   boolPtr(true),
			}

			_, err := EvaluateRule(rule, ctx)
			if err == nil {
				t.Errorf("EvaluateRule(%s) expected error, got nil", tt.condition)
			}
		})
	}
}

func TestParseCondition(t *testing.T) {
	tests := []struct {
		condition string
		expected  []string
	}{
		{"usage > 80", []string{"usage", ">", "80"}},
		{"usage >= 80", []string{"usage", ">=", "80"}},
		{"usage < 80", []string{"usage", "<", "80"}},
		{"usage <= 80", []string{"usage", "<=", "80"}},
		{"usage == 80", []string{"usage", "==", "80"}},
		{"usage != 80", []string{"usage", "!=", "80"}},
		{"usage>80", []string{"usage", ">", "80"}},      // no spaces
		{"  usage  >  80  ", []string{"usage", ">", "80"}}, // extra spaces
	}

	for _, tt := range tests {
		t.Run(tt.condition, func(t *testing.T) {
			result := parseCondition(tt.condition)
			if len(result) != len(tt.expected) {
				t.Fatalf("parseCondition(%s) len = %d, want %d", tt.condition, len(result), len(tt.expected))
			}
			for i, v := range result {
				if v != tt.expected[i] {
					t.Errorf("parseCondition(%s)[%d] = %s, want %s", tt.condition, i, v, tt.expected[i])
				}
			}
		})
	}
}

func TestGetContextValue(t *testing.T) {
	ctx := &RuleContext{
		Active:      10,
		Idle:        5,
		Pending:     2,
		Max:         20,
		Usage:       50,
		HeapUsage:   75,
		HeapUsed:    1024,
		HeapMax:     2048,
		CpuUsage:    0.5,
		ThreadsLive: 100,
		Timeout:     3,
	}

	tests := []struct {
		varName  string
		expected float64
	}{
		{"usage", 50},
		{"active", 10},
		{"idle", 5},
		{"pending", 2},
		{"max", 20},
		{"timeout", 3},
		{"heapusage", 75},
		{"heap_usage", 75},
		{"heapused", 1024},
		{"heap_used", 1024},
		{"heapmax", 2048},
		{"heap_max", 2048},
		{"cpu", 50},       // 0.5 * 100
		{"cpuusage", 50},
		{"cpu_usage", 50},
		{"threads", 100},
		{"threads_live", 100},
	}

	for _, tt := range tests {
		t.Run(tt.varName, func(t *testing.T) {
			result, err := getContextValue(ctx, tt.varName)
			if err != nil {
				t.Fatalf("getContextValue(%s) error = %v", tt.varName, err)
			}
			if result != tt.expected {
				t.Errorf("getContextValue(%s) = %f, want %f", tt.varName, result, tt.expected)
			}
		})
	}
}

func TestGetContextValue_Unknown(t *testing.T) {
	ctx := &RuleContext{}
	_, err := getContextValue(ctx, "unknown")
	if err == nil {
		t.Error("getContextValue(unknown) expected error, got nil")
	}
}

func TestEvaluateCondition(t *testing.T) {
	tests := []struct {
		left     float64
		operator string
		right    float64
		expected bool
	}{
		{10, ">", 5, true},
		{5, ">", 10, false},
		{10, ">=", 10, true},
		{10, ">=", 5, true},
		{5, "<", 10, true},
		{10, "<", 5, false},
		{10, "<=", 10, true},
		{5, "<=", 10, true},
		{10, "==", 10, true},
		{10, "==", 5, false},
		{10, "!=", 5, true},
		{10, "!=", 10, false},
	}

	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			result, err := evaluateCondition(tt.left, tt.operator, tt.right)
			if err != nil {
				t.Fatalf("evaluateCondition() error = %v", err)
			}
			if result != tt.expected {
				t.Errorf("evaluateCondition(%f %s %f) = %v, want %v",
					tt.left, tt.operator, tt.right, result, tt.expected)
			}
		})
	}
}

func TestEvaluateCondition_UnknownOperator(t *testing.T) {
	_, err := evaluateCondition(10, "~", 5)
	if err == nil {
		t.Error("evaluateCondition with unknown operator expected error, got nil")
	}
}

func TestRenderMessage(t *testing.T) {
	ctx := &RuleContext{
		TargetName:   "test-service",
		InstanceName: "default",
		Active:       8,
		Idle:         2,
		Usage:        80,
	}

	tests := []struct {
		template string
		expected string
	}{
		{"Pool usage is {{ .Usage }}%", "Pool usage is 80%"},
		{"{{ .TargetName }} has {{ .Active }} active connections", "test-service has 8 active connections"},
		{"{{ .Idle }} idle connections remaining", "2 idle connections remaining"},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.template, func(t *testing.T) {
			result := RenderMessage(tt.template, ctx)
			if result != tt.expected {
				t.Errorf("RenderMessage(%s) = %s, want %s", tt.template, result, tt.expected)
			}
		})
	}
}

func TestRenderMessage_InvalidTemplate(t *testing.T) {
	ctx := &RuleContext{Usage: 80}
	template := "{{ .Usage"  // Invalid template

	result := RenderMessage(template, ctx)
	// Should return original template on error
	if result != template {
		t.Errorf("RenderMessage with invalid template should return original, got %s", result)
	}
}

func boolPtr(b bool) *bool {
	return &b
}
