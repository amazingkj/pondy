package alerter

import (
	"bytes"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"text/template"

	"github.com/jiin/pondy/internal/config"
	"github.com/jiin/pondy/internal/models"
)

// RuleContext contains the context for rule evaluation
type RuleContext struct {
	TargetName   string
	InstanceName string
	Active       int
	Idle         int
	Pending      int
	Max          int
	Usage        float64 // (Active/Max) * 100
	Timeout      int64
	HeapUsed     int64
	HeapMax      int64
	HeapUsage    float64 // (HeapUsed/HeapMax) * 100
	NonHeapUsed  int64
	CpuUsage     float64
	ThreadsLive  int
	GcCount      int64
	GcTime       float64
}

// NewRuleContext creates a RuleContext from PoolMetrics
func NewRuleContext(m *models.PoolMetrics) *RuleContext {
	ctx := &RuleContext{
		TargetName:   m.TargetName,
		InstanceName: m.InstanceName,
		Active:       m.Active,
		Idle:         m.Idle,
		Pending:      m.Pending,
		Max:          m.Max,
		Timeout:      m.Timeout,
		HeapUsed:     m.HeapUsed,
		HeapMax:      m.HeapMax,
		NonHeapUsed:  m.NonHeapUsed,
		CpuUsage:     m.CpuUsage,
		ThreadsLive:  m.ThreadsLive,
		GcCount:      m.GcCount,
		GcTime:       m.GcTime,
	}

	// Calculate usage percentages
	if m.Max > 0 {
		ctx.Usage = float64(m.Active) / float64(m.Max) * 100
	}
	if m.HeapMax > 0 {
		ctx.HeapUsage = float64(m.HeapUsed) / float64(m.HeapMax) * 100
	}

	return ctx
}

// ValidateCondition validates a rule condition syntax without evaluating it
// Returns nil if valid, error otherwise
func ValidateCondition(condition string) error {
	condition = strings.TrimSpace(condition)
	if condition == "" {
		return fmt.Errorf("condition cannot be empty")
	}

	// Parse the condition
	parts := parseCondition(condition)
	if len(parts) != 3 {
		return fmt.Errorf("invalid condition format: expected 'variable operator value', got '%s'", condition)
	}

	varName := strings.ToLower(parts[0])
	operator := parts[1]
	valueStr := parts[2]

	// Validate variable name
	validVars := []string{
		"usage", "active", "idle", "pending", "max", "timeout",
		"heapusage", "heap_usage", "heapused", "heap_used", "heapmax", "heap_max",
		"nonheapused", "non_heap_used", "nonheap",
		"cpuusage", "cpu_usage", "cpu",
		"threads", "threads_live",
		"gccount", "gc_count", "gctime", "gc_time",
	}

	validVar := false
	for _, v := range validVars {
		if varName == v {
			validVar = true
			break
		}
	}
	if !validVar {
		return fmt.Errorf("unknown variable '%s'. Valid variables: usage, active, idle, pending, max, timeout, heapusage, cpuusage, threads, gccount, gctime", varName)
	}

	// Validate operator
	validOps := []string{">", ">=", "<", "<=", "==", "!="}
	validOp := false
	for _, op := range validOps {
		if operator == op {
			validOp = true
			break
		}
	}
	if !validOp {
		return fmt.Errorf("unknown operator '%s'. Valid operators: >, >=, <, <=, ==, !=", operator)
	}

	// Validate value is a number
	if _, err := strconv.ParseFloat(valueStr, 64); err != nil {
		return fmt.Errorf("invalid value '%s': must be a number", valueStr)
	}

	return nil
}

// EvaluateRule evaluates a rule condition against a context
// Supports simple expressions like: "usage > 80", "pending > 5", "idle == 0"
func EvaluateRule(rule *config.AlertRule, ctx *RuleContext) (bool, error) {
	if !rule.IsEnabled() {
		return false, nil
	}

	condition := strings.TrimSpace(rule.Condition)
	if condition == "" {
		return false, fmt.Errorf("empty condition")
	}

	// Parse the condition: "variable operator value"
	parts := parseCondition(condition)
	if len(parts) != 3 {
		return false, fmt.Errorf("invalid condition format: %s", condition)
	}

	varName := strings.ToLower(parts[0])
	operator := parts[1]
	valueStr := parts[2]

	// Get the variable value from context
	varValue, err := getContextValue(ctx, varName)
	if err != nil {
		return false, err
	}

	// Parse the comparison value
	compareValue, err := strconv.ParseFloat(valueStr, 64)
	if err != nil {
		return false, fmt.Errorf("invalid value: %s", valueStr)
	}

	// Evaluate the condition
	return evaluateCondition(varValue, operator, compareValue)
}

// parseCondition parses a condition string into parts
func parseCondition(condition string) []string {
	// Handle operators with two characters first
	operators := []string{">=", "<=", "==", "!=", ">", "<"}

	for _, op := range operators {
		if idx := strings.Index(condition, op); idx != -1 {
			varName := strings.TrimSpace(condition[:idx])
			value := strings.TrimSpace(condition[idx+len(op):])
			return []string{varName, op, value}
		}
	}

	return nil
}

// getContextValue gets a value from the context by variable name
func getContextValue(ctx *RuleContext, varName string) (float64, error) {
	switch varName {
	case "usage":
		return ctx.Usage, nil
	case "active":
		return float64(ctx.Active), nil
	case "idle":
		return float64(ctx.Idle), nil
	case "pending":
		return float64(ctx.Pending), nil
	case "max":
		return float64(ctx.Max), nil
	case "timeout":
		return float64(ctx.Timeout), nil
	case "heapusage", "heap_usage":
		return ctx.HeapUsage, nil
	case "heapused", "heap_used":
		return float64(ctx.HeapUsed), nil
	case "heapmax", "heap_max":
		return float64(ctx.HeapMax), nil
	case "nonheapused", "non_heap_used", "nonheap":
		return float64(ctx.NonHeapUsed), nil
	case "cpuusage", "cpu_usage", "cpu":
		return ctx.CpuUsage * 100, nil // Convert to percentage
	case "threads", "threads_live":
		return float64(ctx.ThreadsLive), nil
	case "gccount", "gc_count":
		return float64(ctx.GcCount), nil
	case "gctime", "gc_time":
		return ctx.GcTime, nil
	default:
		return 0, fmt.Errorf("unknown variable: %s", varName)
	}
}

// evaluateCondition evaluates a comparison
// Returns false if either value is NaN or Inf to prevent undefined behavior
func evaluateCondition(left float64, operator string, right float64) (bool, error) {
	// Guard against NaN and Inf values
	if math.IsNaN(left) || math.IsInf(left, 0) {
		log.Printf("Alerter: warning - left operand is NaN or Inf (value: %v), skipping condition", left)
		return false, nil
	}
	if math.IsNaN(right) || math.IsInf(right, 0) {
		log.Printf("Alerter: warning - right operand is NaN or Inf (value: %v), skipping condition", right)
		return false, nil
	}

	switch operator {
	case ">":
		return left > right, nil
	case ">=":
		return left >= right, nil
	case "<":
		return left < right, nil
	case "<=":
		return left <= right, nil
	case "==":
		return left == right, nil
	case "!=":
		return left != right, nil
	default:
		return false, fmt.Errorf("unknown operator: %s", operator)
	}
}

// RenderMessage renders a message template with context
func RenderMessage(messageTemplate string, ctx *RuleContext) string {
	if messageTemplate == "" {
		return ""
	}

	tmpl, err := template.New("message").Parse(messageTemplate)
	if err != nil {
		return messageTemplate
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, ctx); err != nil {
		return messageTemplate
	}

	return buf.String()
}
