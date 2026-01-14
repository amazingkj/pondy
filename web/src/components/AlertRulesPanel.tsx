import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, toggleAlertRule } from '../hooks/useMetrics';
import type { AlertRule, AlertRuleInput } from '../types/metrics';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { TableRowSkeleton } from './Skeleton';
import { LoadingButton } from './LoadingButton';

const severityColors: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const conditionVariables = [
  { name: 'usage', desc: 'Pool usage percentage (0-100)' },
  { name: 'active', desc: 'Active connections count' },
  { name: 'idle', desc: 'Idle connections count' },
  { name: 'pending', desc: 'Pending connections count' },
  { name: 'max', desc: 'Max pool size' },
  { name: 'timeout', desc: 'Timeout count' },
  { name: 'heapusage', desc: 'Heap memory usage percentage' },
  { name: 'nonheap', desc: 'Non-heap memory (bytes)' },
  { name: 'cpu', desc: 'CPU usage percentage (0-100)' },
  { name: 'threads', desc: 'Live thread count' },
  { name: 'gccount', desc: 'GC count' },
  { name: 'gctime', desc: 'GC time (seconds)' },
];

export function AlertRulesPanel() {
  const { colors } = useTheme();
  const toast = useToast();
  const { data, loading, refetch } = useAlertRules();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AlertRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async (input: AlertRuleInput) => {
    try {
      await createAlertRule(input);
      setShowForm(false);
      refetch();
      toast.success('Alert rule created successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  const handleUpdate = async (id: number, input: AlertRuleInput) => {
    try {
      await updateAlertRule(id, input);
      setEditingRule(null);
      refetch();
      toast.success('Alert rule updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const success = await deleteAlertRule(deleteConfirm.id);
      if (success) {
        refetch();
        toast.success('Alert rule deleted');
      } else {
        toast.error('Failed to delete rule');
      }
    } catch {
      toast.error('Failed to delete rule');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    await toggleAlertRule(id);
    refetch();
    toast.info(enabled ? 'Rule disabled' : 'Rule enabled');
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[1, 2, 3].map((i) => (
          <TableRowSkeleton key={i} columns={3} />
        ))}
      </div>
    );
  }

  const rules = data?.rules || [];
  const configRules = data?.config_rules || [];

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>Alert Rules</h2>
        <button
          onClick={() => { setShowForm(true); setEditingRule(null); }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          + Add Rule
        </button>
      </div>

      {/* Form */}
      {(showForm || editingRule) && (
        <RuleForm
          rule={editingRule}
          onSubmit={editingRule ? (input) => handleUpdate(editingRule.id, input) : handleCreate}
          onCancel={() => { setShowForm(false); setEditingRule(null); }}
        />
      )}

      {/* DB Rules */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '12px' }}>
          Custom Rules ({rules.length})
        </h3>
        {rules.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: colors.textSecondary,
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            fontSize: '13px',
          }}>
            No custom rules yet. Click "Add Rule" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={() => setEditingRule(rule)}
                onDelete={() => setDeleteConfirm(rule)}
                onToggle={() => handleToggle(rule.id, rule.enabled)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Config Rules (read-only) */}
      {configRules.length > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '12px' }}>
            Config File Rules ({configRules.length})
            <span style={{ fontWeight: 400, fontSize: '12px', color: colors.textSecondary, marginLeft: '8px' }}>
              (read-only, defined in config.yaml)
            </span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {configRules.map((rule, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px',
                  backgroundColor: colors.bgSecondary,
                  borderRadius: '8px',
                  borderLeft: `3px solid ${severityColors[rule.severity] || '#9ca3af'}`,
                  opacity: rule.enabled === false ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>{rule.name}</div>
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: severityColors[rule.severity] + '20',
                    color: severityColors[rule.severity],
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {rule.severity}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '4px', fontFamily: 'monospace' }}>
                  {rule.condition}
                </div>
                {rule.message && (
                  <div style={{ fontSize: '12px', color: colors.text, marginTop: '4px' }}>
                    {rule.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Variable Reference */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '8px' }}>
          Available Variables
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '8px',
          fontSize: '12px',
        }}>
          {conditionVariables.map((v) => (
            <div key={v.name} style={{ padding: '8px', backgroundColor: colors.bgSecondary, borderRadius: '4px' }}>
              <code style={{ color: '#8b5cf6' }}>{v.name}</code>
              <div style={{ color: colors.textSecondary, marginTop: '2px' }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Alert Rule"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: AlertRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const { colors } = useTheme();

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: colors.bgSecondary,
        borderRadius: '8px',
        borderLeft: `3px solid ${severityColors[rule.severity] || '#9ca3af'}`,
        opacity: rule.enabled ? 1 : 0.5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>{rule.name}</span>
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: severityColors[rule.severity] + '20',
              color: severityColors[rule.severity],
              fontWeight: 600,
              textTransform: 'uppercase',
            }}>
              {rule.severity}
            </span>
            {!rule.enabled && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: colors.border,
                color: colors.textSecondary,
              }}>
                DISABLED
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '4px', fontFamily: 'monospace' }}>
            {rule.condition}
          </div>
          {rule.message && (
            <div style={{ fontSize: '12px', color: colors.text, marginTop: '4px' }}>
              {rule.message}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={onToggle}
            aria-label={rule.enabled ? `Disable ${rule.name}` : `Enable ${rule.name}`}
            style={{
              padding: '4px 8px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              backgroundColor: colors.bgCard,
              color: colors.text,
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            {rule.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={onEdit}
            aria-label={`Edit ${rule.name}`}
            style={{
              padding: '4px 8px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              backgroundColor: colors.bgCard,
              color: colors.text,
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete ${rule.name}`}
            style={{
              padding: '4px 8px',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleForm({
  rule,
  onSubmit,
  onCancel,
}: {
  rule: AlertRule | null;
  onSubmit: (input: AlertRuleInput) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(rule?.name || '');
  const [condition, setCondition] = useState(rule?.condition || '');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>(rule?.severity || 'warning');
  const [message, setMessage] = useState(rule?.message || '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!condition.trim()) {
      newErrors.condition = 'Condition is required';
    } else if (!/^\w+\s*(>|<|>=|<=|==|!=)\s*\d+$/.test(condition.trim())) {
      newErrors.condition = 'Invalid format. Use: variable operator value (e.g., usage > 80)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit({ name, condition, severity, message, enabled });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    backgroundColor: colors.bgCard,
    color: colors.text,
    fontSize: '13px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: colors.text,
    marginBottom: '4px',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '16px',
        backgroundColor: colors.bgSecondary,
        borderRadius: '8px',
        marginBottom: '16px',
        border: `1px solid ${colors.border}`,
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, color: colors.text }}>
        {rule ? 'Edit Rule' : 'Create New Rule'}
      </h3>

      <div style={{ display: 'grid', gap: '12px' }}>
        <div>
          <label style={labelStyle} htmlFor="rule-name">Name *</label>
          <input
            id="rule-name"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors(prev => ({ ...prev, name: '' })); }}
            placeholder="e.g., high_usage"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            style={{
              ...inputStyle,
              borderColor: errors.name ? '#ef4444' : colors.border,
            }}
          />
          {errors.name && (
            <div id="name-error" style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
              {errors.name}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle} htmlFor="rule-condition">Condition *</label>
          <input
            id="rule-condition"
            type="text"
            value={condition}
            onChange={(e) => { setCondition(e.target.value); setErrors(prev => ({ ...prev, condition: '' })); }}
            placeholder='e.g., usage > 80, pending > 5, idle == 0'
            aria-invalid={!!errors.condition}
            aria-describedby={errors.condition ? 'condition-error' : 'condition-hint'}
            style={{
              ...inputStyle,
              borderColor: errors.condition ? '#ef4444' : colors.border,
            }}
          />
          {errors.condition ? (
            <div id="condition-error" style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
              {errors.condition}
            </div>
          ) : (
            <div id="condition-hint" style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
              Format: variable operator value (e.g., usage {'>'} 80)
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Severity *</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as 'info' | 'warning' | 'critical')}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Message Template</label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder='e.g., Pool usage is {{ .Usage }}%'
            style={inputStyle}
          />
          <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
            Use {'{{ .Variable }}'} for template values (Usage, Active, Idle, Pending, etc.)
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="enabled" style={{ fontSize: '13px', color: colors.text, cursor: 'pointer' }}>
            Enabled
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
        <LoadingButton
          type="button"
          onClick={onCancel}
          variant="secondary"
          disabled={submitting}
          size="sm"
        >
          Cancel
        </LoadingButton>
        <LoadingButton
          type="submit"
          isLoading={submitting}
          loadingText={rule ? 'Updating...' : 'Creating...'}
          size="sm"
        >
          {rule ? 'Update' : 'Create'}
        </LoadingButton>
      </div>
    </form>
  );
}
