import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

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

interface TargetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  target?: TargetConfig | null;
  onSave: () => void;
}

const API_BASE = '';

export function TargetConfigModal({ isOpen, onClose, target, onSave }: TargetConfigModalProps) {
  const { colors } = useTheme();
  const [form, setForm] = useState<TargetConfig>({
    name: '',
    type: 'actuator',
    endpoint: '',
    interval: '10s',
    group: '',
    instances: [],
  });
  const [useMultiInstance, setUseMultiInstance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setForm(target);
      setUseMultiInstance(target.instances && target.instances.length > 0);
    } else {
      setForm({
        name: '',
        type: 'actuator',
        endpoint: '',
        interval: '10s',
        group: '',
        instances: [],
      });
      setUseMultiInstance(false);
    }
    setError(null);
  }, [target, isOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...form,
        endpoint: useMultiInstance ? '' : form.endpoint,
        instances: useMultiInstance ? form.instances : [],
      };

      const url = target
        ? `${API_BASE}/api/config/targets/${encodeURIComponent(target.name)}`
        : `${API_BASE}/api/config/targets`;

      const method = target ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save target');
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const addInstance = () => {
    setForm(prev => ({
      ...prev,
      instances: [...prev.instances, { id: '', endpoint: '' }],
    }));
  };

  const removeInstance = (index: number) => {
    setForm(prev => ({
      ...prev,
      instances: prev.instances.filter((_, i) => i !== index),
    }));
  };

  const updateInstance = (index: number, field: 'id' | 'endpoint', value: string) => {
    setForm(prev => ({
      ...prev,
      instances: prev.instances.map((inst, i) =>
        i === index ? { ...inst, [field]: value } : inst
      ),
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
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: '12px',
          padding: '24px',
          width: '480px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 20px 0', color: colors.text, fontSize: '18px' }}>
          {target ? 'Edit Target' : 'Add Target'}
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
              placeholder="my-service"
              style={inputStyle}
            />
          </div>

          {/* Type & Interval */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                style={inputStyle}
              >
                <option value="actuator">Actuator</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Interval</label>
              <select
                value={form.interval}
                onChange={(e) => setForm(prev => ({ ...prev, interval: e.target.value }))}
                style={inputStyle}
              >
                <option value="5s">5s</option>
                <option value="10s">10s</option>
                <option value="30s">30s</option>
                <option value="1m">1m</option>
                <option value="5m">5m</option>
              </select>
            </div>
          </div>

          {/* Group */}
          <div>
            <label style={labelStyle}>Group (optional)</label>
            <input
              type="text"
              value={form.group}
              onChange={(e) => setForm(prev => ({ ...prev, group: e.target.value }))}
              placeholder="prod, dev, staging..."
              style={inputStyle}
            />
          </div>

          {/* Single vs Multi Instance Toggle */}
          <div>
            <label style={labelStyle}>Instance Mode</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setUseMultiInstance(false)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: `1px solid ${!useMultiInstance ? '#3b82f6' : colors.border}`,
                  borderRadius: '6px',
                  backgroundColor: !useMultiInstance ? '#3b82f620' : colors.bgSecondary,
                  color: !useMultiInstance ? '#3b82f6' : colors.text,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Single Instance
              </button>
              <button
                onClick={() => setUseMultiInstance(true)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: `1px solid ${useMultiInstance ? '#3b82f6' : colors.border}`,
                  borderRadius: '6px',
                  backgroundColor: useMultiInstance ? '#3b82f620' : colors.bgSecondary,
                  color: useMultiInstance ? '#3b82f6' : colors.text,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Multi Instance
              </button>
            </div>
          </div>

          {/* Single Instance Endpoint */}
          {!useMultiInstance && (
            <div>
              <label style={labelStyle}>Endpoint *</label>
              <input
                type="text"
                value={form.endpoint}
                onChange={(e) => setForm(prev => ({ ...prev, endpoint: e.target.value }))}
                placeholder="http://localhost:8080/actuator/metrics"
                style={inputStyle}
              />
            </div>
          )}

          {/* Multi Instance */}
          {useMultiInstance && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Instances *</label>
                <button
                  onClick={addInstance}
                  style={{
                    padding: '4px 10px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#22c55e',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  + Add Instance
                </button>
              </div>

              {form.instances.length === 0 && (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: colors.textSecondary,
                  fontSize: '12px',
                  border: `1px dashed ${colors.border}`,
                  borderRadius: '6px',
                }}>
                  Click "Add Instance" to add endpoints
                </div>
              )}

              {form.instances.map((inst, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '8px',
                  padding: '10px',
                  backgroundColor: colors.bgSecondary,
                  borderRadius: '6px',
                }}>
                  <div style={{ width: '100px' }}>
                    <input
                      type="text"
                      value={inst.id}
                      onChange={(e) => updateInstance(idx, 'id', e.target.value)}
                      placeholder="ID"
                      style={{ ...inputStyle, backgroundColor: colors.bgCard }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={inst.endpoint}
                      onChange={(e) => updateInstance(idx, 'endpoint', e.target.value)}
                      placeholder="http://host:port/actuator/metrics"
                      style={{ ...inputStyle, backgroundColor: colors.bgCard }}
                    />
                  </div>
                  <button
                    onClick={() => removeInstance(idx)}
                    style={{
                      padding: '8px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: '#ef444420',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}
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
            disabled={loading}
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
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Saving...' : (target ? 'Update' : 'Add Target')}
          </button>
        </div>
      </div>
    </div>
  );
}
