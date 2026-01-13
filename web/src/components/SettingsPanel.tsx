import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { createBackup, downloadBackup, restoreBackup } from '../hooks/useMetrics';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { colors } = useTheme();
  const [backupStatus, setBackupStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle');
  const [backupMessage, setBackupMessage] = useState('');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [restoreMessage, setRestoreMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateBackup = async () => {
    setBackupStatus('creating');
    setBackupMessage('');

    const result = await createBackup();

    if (result) {
      setBackupStatus('success');
      setBackupMessage(result.message || 'Backup created successfully');
    } else {
      setBackupStatus('error');
      setBackupMessage('Failed to create backup');
    }
  };

  const handleDownloadBackup = () => {
    setDownloadStatus('downloading');
    downloadBackup();
    setDownloadStatus('success');
    setTimeout(() => setDownloadStatus('idle'), 2000);
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file extension
    if (!file.name.endsWith('.db')) {
      setRestoreStatus('error');
      setRestoreMessage('Please select a .db backup file');
      return;
    }

    setRestoreStatus('uploading');
    setRestoreMessage('');

    const result = await restoreBackup(file);

    if ('error' in result) {
      setRestoreStatus('error');
      setRestoreMessage(result.error);
    } else {
      setRestoreStatus('success');
      setRestoreMessage(result.message);
      // Refresh page after successful restore
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '400px',
        maxWidth: '100vw',
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
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
          Settings
        </h2>
        <button
          onClick={onClose}
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
              <button
                onClick={handleCreateBackup}
                disabled={backupStatus === 'creating'}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: backupStatus === 'creating' ? 'wait' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  opacity: backupStatus === 'creating' ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {backupStatus === 'creating' ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Create Backup
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadBackup}
                disabled={downloadStatus === 'downloading'}
                style={{
                  padding: '8px 16px',
                  backgroundColor: colors.bgCard,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  cursor: downloadStatus === 'downloading' ? 'wait' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  opacity: downloadStatus === 'downloading' ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {downloadStatus === 'downloading' ? (
                  'Downloading...'
                ) : downloadStatus === 'success' ? (
                  <>
                    <span style={{ color: '#22c55e' }}>✓</span>
                    Downloaded
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download Latest
                  </>
                )}
              </button>
            </div>

            {backupStatus !== 'idle' && backupMessage && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: backupStatus === 'success' ? '#dcfce7' : '#fee2e2',
                color: backupStatus === 'success' ? '#166534' : '#991b1b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>
                {backupMessage}
              </div>
            )}
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
              onChange={handleRestoreBackup}
              style={{ display: 'none' }}
              id="restore-file-input"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={restoreStatus === 'uploading'}
              style={{
                padding: '8px 16px',
                backgroundColor: colors.bgCard,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                cursor: restoreStatus === 'uploading' ? 'wait' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                opacity: restoreStatus === 'uploading' ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {restoreStatus === 'uploading' ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite' }}>&#8987;</span>
                  Restoring...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload Backup File
                </>
              )}
            </button>

            {restoreStatus !== 'idle' && restoreMessage && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: restoreStatus === 'success' ? '#dcfce7' : '#fee2e2',
                color: restoreStatus === 'success' ? '#166534' : '#991b1b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>
                {restoreMessage}
                {restoreStatus === 'success' && (
                  <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                    (Refreshing page...)
                  </span>
                )}
              </div>
            )}
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
    </div>
  );
}
