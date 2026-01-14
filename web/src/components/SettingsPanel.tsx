import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { createBackup, downloadBackup, restoreBackup } from '../hooks/useMetrics';
import { TargetConfigPanel } from './TargetConfigPanel';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { LoadingButton } from './LoadingButton';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const [backupLoading, setBackupLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showTargetConfig, setShowTargetConfig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showTargetConfig && !showRestoreConfirm) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, showTargetConfig, showRestoreConfirm]);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const result = await createBackup();
      if (result) {
        toast.success(result.message || 'Backup created successfully');
      } else {
        toast.error('Failed to create backup');
      }
    } catch {
      toast.error('Failed to create backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadLoading(true);
    try {
      downloadBackup();
      toast.success('Backup download started');
    } catch {
      toast.error('Failed to download backup');
    } finally {
      setTimeout(() => setDownloadLoading(false), 1000);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.db')) {
      toast.error('Please select a .db backup file');
      return;
    }

    setPendingFile(file);
    setShowRestoreConfirm(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRestoreConfirm = async () => {
    if (!pendingFile) return;

    setRestoreLoading(true);
    try {
      const result = await restoreBackup(pendingFile);

      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success(result.message || 'Backup restored successfully');
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      toast.error('Failed to restore backup');
    } finally {
      setRestoreLoading(false);
      setShowRestoreConfirm(false);
      setPendingFile(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(400px, 100vw)',
        backgroundColor: colors.bgCard,
        borderLeft: `1px solid ${colors.border}`,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 id="settings-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
          Settings
        </h2>
        <button
          onClick={onClose}
          aria-label="Close settings panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: colors.textSecondary,
            fontSize: '20px',
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Target Configuration Section */}
        <section style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
            </svg>
            Target Configuration
          </h3>

          <div style={{
            padding: '16px',
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
          }}>
            <p style={{
              fontSize: '13px',
              color: colors.textSecondary,
              margin: '0 0 16px 0',
              lineHeight: 1.5,
            }}>
              Add, edit, or remove monitoring targets. Changes are saved directly to your config file.
            </p>

            <button
              onClick={() => setShowTargetConfig(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Manage Targets
            </button>
          </div>
        </section>

        {/* Backup Section */}
        <section style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Data Backup
          </h3>

          <div style={{
            padding: '16px',
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
          }}>
            <p style={{
              fontSize: '13px',
              color: colors.textSecondary,
              margin: '0 0 16px 0',
              lineHeight: 1.5,
            }}>
              Create a backup of all metrics data, alerts, and alert rules.
              The backup file can be downloaded and stored safely.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <LoadingButton
                onClick={handleCreateBackup}
                isLoading={backupLoading}
                loadingText="Creating..."
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                }
                size="sm"
              >
                Create Backup
              </LoadingButton>

              <LoadingButton
                onClick={handleDownloadBackup}
                isLoading={downloadLoading}
                loadingText="Downloading..."
                variant="secondary"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                }
                size="sm"
              >
                Download Latest
              </LoadingButton>
            </div>
          </div>
        </section>

        {/* Restore Section */}
        <section style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Restore Data
          </h3>

          <div style={{
            padding: '16px',
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
          }}>
            <p style={{
              fontSize: '13px',
              color: colors.textSecondary,
              margin: '0 0 16px 0',
              lineHeight: 1.5,
            }}>
              Upload a backup file (.db) to restore your data.
              This will replace all current data with the backup contents.
            </p>

            <div style={{
              padding: '12px',
              backgroundColor: '#fef3c7',
              borderRadius: '6px',
              marginBottom: '16px',
              border: '1px solid #fde68a',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>&#9888;</span>
                <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.4 }}>
                  Warning: Restoring will overwrite all current metrics, alerts, and rules.
                  Make sure to create a backup first if needed.
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".db"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="restore-file-input"
              aria-label="Select backup file"
            />

            <LoadingButton
              onClick={() => fileInputRef.current?.click()}
              isLoading={restoreLoading}
              loadingText="Restoring..."
              variant="secondary"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              }
              size="sm"
            >
              Upload Backup File
            </LoadingButton>
          </div>
        </section>

        {/* Info Section */}
        <section>
          <h3 style={{
            fontSize: '14px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            About
          </h3>

          <div style={{
            padding: '16px',
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textSecondary }}>Version</span>
                <span style={{ color: colors.text, fontWeight: 500 }}>v0.2.0</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textSecondary }}>Database</span>
                <span style={{ color: colors.text, fontWeight: 500 }}>SQLite</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textSecondary }}>Storage</span>
                <span style={{ color: colors.text, fontWeight: 500 }}>./data/pondy.db</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Target Configuration Panel */}
      <TargetConfigPanel
        isOpen={showTargetConfig}
        onClose={() => setShowTargetConfig(false)}
      />

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        isOpen={showRestoreConfirm}
        title="Restore Backup"
        message={`This will replace all current data with the backup file "${pendingFile?.name}". This action cannot be undone.`}
        confirmLabel="Restore"
        cancelLabel="Cancel"
        variant="warning"
        isLoading={restoreLoading}
        onConfirm={handleRestoreConfirm}
        onCancel={() => {
          setShowRestoreConfirm(false);
          setPendingFile(null);
        }}
      />
    </div>
  );
}
