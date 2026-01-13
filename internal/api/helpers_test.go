package api

import (
	"testing"
	"time"
)

func TestParseTimeRange_Valid(t *testing.T) {
	tests := []struct {
		input   string
		default_ time.Duration
		expected time.Duration
	}{
		{"1h", time.Hour, time.Hour},
		{"30m", time.Hour, 30 * time.Minute},
		{"24h", time.Hour, 24 * time.Hour},
		{"2h30m", time.Hour, 2*time.Hour + 30*time.Minute},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := ParseTimeRange(tt.input, tt.default_)

			duration := result.To.Sub(result.From)

			// Allow 1 second tolerance for time comparison
			diff := duration - tt.expected
			if diff < -time.Second || diff > time.Second {
				t.Errorf("ParseTimeRange(%s) duration = %v, want ~%v", tt.input, duration, tt.expected)
			}
		})
	}
}

func TestParseTimeRange_Invalid(t *testing.T) {
	// Invalid input should use default
	result := ParseTimeRange("invalid", time.Hour)

	duration := result.To.Sub(result.From)

	// Should use 1 hour default
	diff := duration - time.Hour
	if diff < -time.Second || diff > time.Second {
		t.Errorf("ParseTimeRange(invalid) duration = %v, want ~1h", duration)
	}
}

func TestParseTimeRange_Empty(t *testing.T) {
	// Empty input should use default
	result := ParseTimeRange("", 24*time.Hour)

	duration := result.To.Sub(result.From)

	// Should use 24 hour default
	diff := duration - 24*time.Hour
	if diff < -time.Second || diff > time.Second {
		t.Errorf("ParseTimeRange(empty) duration = %v, want ~24h", duration)
	}
}

func TestParseTimeRange_TimeBounds(t *testing.T) {
	before := time.Now()
	result := ParseTimeRange("1h", time.Hour)
	after := time.Now()

	// 'To' should be between before and after
	if result.To.Before(before) || result.To.After(after) {
		t.Error("To time should be approximately now")
	}

	// 'From' should be ~1 hour before 'To'
	expectedFrom := result.To.Add(-time.Hour)
	diff := result.From.Sub(expectedFrom)
	if diff < -time.Second || diff > time.Second {
		t.Errorf("From time should be ~1h before To, got diff %v", diff)
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		input    time.Duration
		expected string
	}{
		{24 * time.Hour, "24h"},
		{48 * time.Hour, "24h"},
		{time.Hour, "1h"},
		{30 * time.Minute, "1h"},
		{6 * time.Hour, "1h"},
	}

	for _, tt := range tests {
		t.Run(tt.input.String(), func(t *testing.T) {
			result := formatDuration(tt.input)
			if result != tt.expected {
				t.Errorf("formatDuration(%v) = %s, want %s", tt.input, result, tt.expected)
			}
		})
	}
}

func TestConstants(t *testing.T) {
	if DefaultRangeShort != time.Hour {
		t.Errorf("DefaultRangeShort = %v, want 1h", DefaultRangeShort)
	}

	if DefaultRangeLong != 24*time.Hour {
		t.Errorf("DefaultRangeLong = %v, want 24h", DefaultRangeLong)
	}
}

func TestTimeRange_Struct(t *testing.T) {
	from := time.Now().Add(-time.Hour)
	to := time.Now()

	tr := TimeRange{
		From: from,
		To:   to,
	}

	if !tr.From.Equal(from) {
		t.Error("TimeRange.From not set correctly")
	}

	if !tr.To.Equal(to) {
		t.Error("TimeRange.To not set correctly")
	}
}
