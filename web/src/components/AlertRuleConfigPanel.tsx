import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { AlertRuleConfigModal } from './AlertRuleConfigModal';

interface AlertRule {
  id: number;
  name: string;
  condition: string;
  severity: string;
  message: string;
  enabled: boolean;
}

interface AlertRuleConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE = '';

const severityColors: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export function AlertRuleConfigPanel({ isOpen, onClose }: AlertRuleConfigPanelProps) {
  const { colors } = useTheme();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rules`);
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error('Failed to fetch rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRules();
    }
  }, [isOpen, fetchRules]);

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/rules/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchRules();
      }
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
    setDeleteConfirm(null);
  };

  const handleToggle = async (rule: AlertRule) => {
    try {
      const res = await fetch(`${API_BASE}/api/rules/${rule.id}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) {
        fetchRules();
      }
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleEdit = (rule: AlertRule) => {
    setEditRule(rule);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditRule(null);
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
          <h3 style={{ margin: 0, color: colors.text, fontSize: '18px' }}>
            Alert Rules
          </h3>
          <button
            onClick={handleAdd}
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
            + Add Rule
          </button>
        </div>

        {/* Rule List */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
              Loading...
            </div>
          ) : rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
              No alert rules configured. Click "Add Rule" to create one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: colors.bgSecondary,
                    borderRadius: '8px',
                    borderLeft: `3px solid ${severityColors[rule.severity] || colors.border}`,
                    opacity: rule.enabled ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(rule)}
                      style={{
                        width: '40px',
                        height: '22px',
                        borderRadius: '11px',
                        border: 'none',
                        backgroundColor: rule.enabled ? '#22c55e' : colors.border,
                        cursor: 'pointer',
                        position: 'relative',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        position: 'absolute',
                        top: '2px',
                        left: rule.enabled ? '20px' : '2px',
                        transition: 'left 0.2s',
                      }} />
                    </button>

                    {/* Rule Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>
                          {rule.name}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: `${severityColors[rule.severity]}20`,
                          color: severityColors[rule.severity],
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}>
                          {rule.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '2px' }}>
                        <code style={{
                          padding: '2px 6px',
                          backgroundColor: colors.bgCard,
                          borderRadius: '3px',
                          fontSize: '11px',
                        }}>
                          {rule.condition}
                        </code>
                      </div>
                      {rule.message && (
                        <div style={{ fontSize: '11px', color: colors.textSecondary, fontStyle: 'italic' }}>
                          {rule.message}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => handleEdit(rule)}
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
                      {deleteConfirm === rule.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(rule.id)}
                            style={{
                              padding: '6px 12px',
                              border: 'none',
                              borderRadius: '4px',
                              backgroundColor: '#ef4444',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 500,
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{
                              padding: '6px 12px',
                              border: `1px solid ${colors.border}`,
                              borderRadius: '4px',
                              backgroundColor: 'transparent',
                              color: colors.textSecondary,
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(rule.id)}
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
                      )}
                    </div>
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
      <AlertRuleConfigModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        rule={editRule}
        onSave={fetchRules}
      />
    </div>
  );
}
