import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { TargetConfigModal } from './TargetConfigModal';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { TableRowSkeleton } from './Skeleton';
import { NoTargetsEmpty } from './EmptyState';

interface Instance {
  id: string;
  endpoint: string;
}

interface TargetConfig {
  name: string;
  type: string;
  endpoint: string;
  interval: string;
  group: string;
  instances: Instance[];
}

interface TargetConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE = '';

export function TargetConfigPanel({ isOpen, onClose }: TargetConfigPanelProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TargetConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TargetConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/config/targets`);
      const data = await res.json();
      setTargets(data.targets || []);
    } catch (err) {
      console.error('Failed to fetch targets:', err);
      toast.error('Failed to load targets');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isOpen) {
      fetchTargets();
    }
  }, [isOpen, fetchTargets]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/config/targets/${encodeURIComponent(deleteConfirm.name)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`Target "${deleteConfirm.name}" deleted`);
        fetchTargets();
      } else {
        toast.error('Failed to delete target');
      }
    } catch (err) {
      console.error('Failed to delete target:', err);
      toast.error('Failed to delete target');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const handleEdit = (target: TargetConfig) => {
    setEditTarget(target);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditTarget(null);
    setShowModal(true);
  };

  if (!isOpen) return null;

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
        zIndex: 1000,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="target-config-title"
    >
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: '12px',
          padding: '24px',
          width: '700px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 id="target-config-title" style={{ margin: 0, color: colors.text, fontSize: '18px' }}>
            Target Configuration
          </h3>
          <button
            onClick={handleAdd}
            aria-label="Add new target"
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#22c55e',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            + Add Target
          </button>
        </div>

        {/* Target List */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
              {[1, 2, 3].map((i) => (
                <TableRowSkeleton key={i} columns={3} />
              ))}
            </div>
          ) : targets.length === 0 ? (
            <NoTargetsEmpty onAddTarget={handleAdd} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {targets.map((target) => (
                <div
                  key={target.name}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: colors.bgSecondary,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  {/* Target Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>
                        {target.name}
                      </span>
                      {target.group && (
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: '#3b82f620',
                          color: '#3b82f6',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 500,
                        }}>
                          {target.group}
                        </span>
                      )}
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: colors.border,
                        color: colors.textSecondary,
                        borderRadius: '4px',
                        fontSize: '10px',
                      }}>
                        {target.interval}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: colors.textSecondary }}>
                      {target.instances && target.instances.length > 0 ? (
                        <span>{target.instances.length} instances: {target.instances.map(i => i.id).join(', ')}</span>
                      ) : (
                        <span>{target.endpoint}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleEdit(target)}
                      aria-label={`Edit ${target.name}`}
                      style={{
                        padding: '6px 12px',
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: colors.text,
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(target)}
                      aria-label={`Delete ${target.name}`}
                      style={{
                        padding: '6px 12px',
                        border: `1px solid #ef444440`,
                        borderRadius: '4px',
                        backgroundColor: '#ef444410',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '10px 16px',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: colors.textSecondary,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <TargetConfigModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        target={editTarget}
        onSave={fetchTargets}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Target"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This will remove all associated data.`}
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
