import { useState, memo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useMaintenanceWindows, useTargets, createMaintenanceWindow, deleteMaintenanceWindow } from '../../hooks/useMetrics';
import type { MaintenanceWindowInput } from '../../types/metrics';
import { useToast } from '../Toast';
import { ConfirmModal } from '../ConfirmModal';
import { FormField, SelectField } from '../common';

export const MaintenanceTab = memo(function MaintenanceTab() {
  const { colors } = useTheme();
  const toast = useToast();
  const { data, loading, error, refetch } = useMaintenanceWindows();
  const { data: targetsData } = useTargets();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<MaintenanceWindowInput>({
    name: '',
    description: '',
    target_name: '',
    start_time: '',
    end_time: '',
    recurring: false,
    days_of_week: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name || !formData.start_time || !formData.end_time) {
      setFormError('Please fill in required fields');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await createMaintenanceWindow(formData);
      setShowForm(false);
      setFormData({
        name: '',
        description: '',
        target_name: '',
        start_time: '',
        end_time: '',
        recurring: false,
        days_of_week: '',
      });
      refetch();
      toast.success('Maintenance window created successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create maintenance window';
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      await deleteMaintenanceWindow(deleteConfirm.id);
      refetch();
      toast.success('Maintenance window deleted');
    } catch {
      toast.error('Failed to delete maintenance window');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const isActive = (window: { start_time: string; end_time: string; recurring: boolean }) => {
    if (window.recurring) return false;
    const now = new Date();
    const start = new Date(window.start_time);
    const end = new Date(window.end_time);
    return now >= start && now <= end;
  };

  const targets = targetsData?.targets?.map(t => t.name) || [];

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: colors.text }}>
            Maintenance Windows
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: colors.textSecondary }}>
            Alerts are suppressed during maintenance
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          aria-expanded={showForm}
          aria-controls="maintenance-form"
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {showForm ? 'Cancel' : '+ Add Window'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div
          id="maintenance-form"
          style={{
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            border: `1px solid ${colors.border}`,
          }}
        >
          {formError && (
            <div role="alert" style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px', padding: '8px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>
              {formError}
            </div>
          )}

          <FormField
            id="maintenance-name"
            label="Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Weekly Deployment"
          />

          <SelectField
            id="maintenance-target"
            label="Target (empty = all targets)"
            value={formData.target_name || ''}
            onChange={(e) => setFormData({ ...formData, target_name: e.target.value })}
          >
            <option value="">All Targets</option>
            {targets.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </SelectField>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <FormField
                id="maintenance-start"
                label="Start Time"
                required
                type="datetime-local"
                value={formData.start_time ? formData.start_time.slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FormField
                id="maintenance-end"
                label="End Time"
                required
                type="datetime-local"
                value={formData.end_time ? formData.end_time.slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              />
            </div>
          </div>

          <FormField
            id="maintenance-description"
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional description"
          />

          <button
            onClick={handleSubmit}
            disabled={saving}
            aria-busy={saving}
            style={{
              width: '100%',
              padding: '10px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#22c55e',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Creating...' : 'Create Maintenance Window'}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: colors.textSecondary, fontSize: '13px', textAlign: 'center', padding: '20px' }} role="status">
          Loading...
        </div>
      ) : error ? (
        <div style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', padding: '20px' }} role="alert">
          {error}
        </div>
      ) : !data?.windows?.length ? (
        <div style={{ color: colors.textSecondary, fontSize: '13px', textAlign: 'center', padding: '40px' }}>
          No maintenance windows configured
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} role="list" aria-label="Maintenance windows">
          {data.windows.map((w) => {
            const active = isActive(w);
            return (
              <div
                key={w.id}
                role="listitem"
                style={{
                  padding: '12px',
                  backgroundColor: active ? 'rgba(34, 197, 94, 0.1)' : colors.bgSecondary,
                  border: `1px solid ${active ? '#22c55e' : colors.border}`,
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: colors.text, fontSize: '13px' }}>
                        {w.name}
                      </span>
                      {active && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          backgroundColor: '#22c55e',
                          color: '#fff',
                          borderRadius: '4px',
                        }}>
                          ACTIVE
                        </span>
                      )}
                      {w.recurring && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          backgroundColor: colors.bgCard,
                          color: colors.textSecondary,
                          borderRadius: '4px',
                          border: `1px solid ${colors.border}`,
                        }}>
                          Recurring
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: colors.textSecondary }}>
                      {w.target_name || 'All targets'} | {formatDateTime(w.start_time)} - {formatDateTime(w.end_time)}
                    </div>
                    {w.description && (
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                        {w.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteConfirm({ id: w.id, name: w.name })}
                    aria-label={`Delete ${w.name}`}
                    style={{
                      padding: '4px 8px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: colors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '10px',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Maintenance Window"
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
});
