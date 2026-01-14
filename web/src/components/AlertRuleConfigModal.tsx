import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

interface AlertRule {
  id?: number;
  name: string;
  condition: string;
  severity: string;
  message: string;
  enabled: boolean;
}

interface AlertRuleConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule?: AlertRule | null;
  onSave: () => void;
}

const API_BASE = '';

const CONDITION_TEMPLATES = [
  { label: 'High Usage', condition: 'usage > 80', message: 'Pool usage is high: {{ .Usage }}%' },
  { label: 'Critical Usage', condition: 'usage > 95', message: 'Pool usage critical: {{ .Usage }}%' },
  { label: 'Pending Connections', condition: 'pending > 5', message: '{{ .Pending }} connections waiting' },
  { label: 'No Idle', condition: 'idle == 0', message: 'No idle connections available' },
  { label: 'Connection Timeout', condition: 'timeout > 0', message: 'Connection timeout detected' },
  { label: 'High CPU', condition: 'cpu > 0.8', message: 'CPU usage high: {{ .CpuUsage }}%' },
  { label: 'High Heap', condition: 'heap_percent > 85', message: 'Heap usage high: {{ .HeapPercent }}%' },
];

export function AlertRuleConfigModal({ isOpen, onClose, rule, onSave }: AlertRuleConfigModalProps) {
  const { colors } = useTheme();
  const [form, setForm] = useState<AlertRule>({
    name: '',
    condition: '',
    severity: 'warning',
    message: '',
    enabled: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rule) {
      setForm(rule);
    } else {
      setForm({
        name: '',
        condition: '',
        severity: 'warning',
        message: '',
        enabled: true,
      });
    }
    setError(null);
  }, [rule, isOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const url = rule?.id
        ? `${API_BASE}/api/rules/${rule.id}`
        : `${API_BASE}/api/rules`;

      const method = rule?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save rule');
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (template: typeof CONDITION_TEMPLATES[0]) => {
    setForm(prev => ({
      ...prev,
      condition: template.condition,
      message: template.message,
    }));
  };

  if (!isOpen) return null;

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    color: colors.text,
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '4px',
    color: colors.textSecondary,
    fontSize: '12px',
    fontWeight: 500 as const,
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: '12px',
          padding: '24px',
          width: '500px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 20px 0', color: colors.text, fontSize: '18px' }}>
          {rule?.id ? 'Edit Alert Rule' : 'Add Alert Rule'}
        </h3>

        {error && (
          <div style={{
            padding: '10px 12px',
            backgroundColor: '#ef444420',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#ef4444',
            fontSize: '13px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="high_usage"
              style={inputStyle}
            />
          </div>

          {/* Condition Templates */}
          <div>
            <label style={labelStyle}>Quick Templates</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {CONDITION_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  style={{
                    padding: '4px 10px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    backgroundColor: colors.bgSecondary,
                    color: colors.text,
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div>
            <label style={labelStyle}>Condition *</label>
            <input
              type="text"
              value={form.condition}
              onChange={(e) => setForm(prev => ({ ...prev, condition: e.target.value }))}
              placeholder="usage > 80"
              style={inputStyle}
            />
            <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
              Available: usage, pending, idle, active, max, timeout, cpu, heap_percent
            </div>
          </div>

          {/* Severity */}
          <div>
            <label style={labelStyle}>Severity *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['info', 'warning', 'critical'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setForm(prev => ({ ...prev, severity: sev }))}
                  style={{
                    flex: 1,
                    padding: '8px',
                    border: `1px solid ${form.severity === sev
                      ? (sev === 'critical' ? '#ef4444' : sev === 'warning' ? '#f59e0b' : '#3b82f6')
                      : colors.border}`,
                    borderRadius: '6px',
                    backgroundColor: form.severity === sev
                      ? (sev === 'critical' ? '#ef444420' : sev === 'warning' ? '#f59e0b20' : '#3b82f620')
                      : colors.bgSecondary,
                    color: form.severity === sev
                      ? (sev === 'critical' ? '#ef4444' : sev === 'warning' ? '#f59e0b' : '#3b82f6')
                      : colors.text,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    textTransform: 'capitalize' as const,
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label style={labelStyle}>Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Pool usage is high: {{ .Usage }}%"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' as const }}
            />
            <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
              Template vars: {'{{ .Usage }}'}, {'{{ .Pending }}'}, {'{{ .Active }}'}, {'{{ .Idle }}'}
            </div>
          </div>

          {/* Enabled */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="enabled"
              checked={form.enabled}
              onChange={(e) => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="enabled" style={{ color: colors.text, fontSize: '13px', cursor: 'pointer' }}>
              Enabled
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: colors.textSecondary,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name || !form.condition || !form.severity}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: loading || !form.name || !form.condition ? 0.7 : 1,
            }}
          >
            {loading ? 'Saving...' : (rule?.id ? 'Update' : 'Add Rule')}
          </button>
        </div>
      </div>
    </div>
  );
}
