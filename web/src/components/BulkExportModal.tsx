import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { exportAllCSV, openCombinedReport } from '../hooks/useMetrics';

interface BulkExportModalProps {
  onClose: () => void;
}

const RANGE_OPTIONS = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '168h', label: '7 Days' },
  { value: '720h', label: '30 Days' },
  { value: '1008h', label: '6 Weeks' },
];

export function BulkExportModal({ onClose }: BulkExportModalProps) {
  const { colors } = useTheme();
  const [range, setRange] = useState('24h');
  const [exporting, setExporting] = useState<'csv' | 'report' | null>(null);

  const handleExportAll = () => {
    setExporting('csv');
    exportAllCSV(range);
    setTimeout(onClose, 300);
  };

  const handleCombinedReport = () => {
    setExporting('report');
    openCombinedReport(range);
    setTimeout(onClose, 300);
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
          minWidth: '360px',
          maxWidth: '90vw',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px 0', color: colors.text, fontSize: '18px' }}>
          Bulk Export / Report
        </h3>
        <p style={{ margin: '0 0 16px 0', color: colors.textSecondary, fontSize: '13px' }}>
          Export data for <strong style={{ color: colors.text }}>all configured targets</strong>
        </p>

        {/* Range Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: colors.textSecondary, fontSize: '12px' }}>
            Time Range
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                style={{
                  padding: '6px 12px',
                  border: `1px solid ${range === opt.value ? '#3b82f6' : colors.border}`,
                  borderRadius: '6px',
                  backgroundColor: range === opt.value ? '#3b82f6' : colors.bgSecondary,
                  color: range === opt.value ? '#fff' : colors.text,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: range === opt.value ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button
            onClick={handleExportAll}
            disabled={exporting !== null}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#22c55e',
              color: '#fff',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting === 'csv' ? 'Opening...' : 'Export All CSV'}
          </button>
          <button
            onClick={handleCombinedReport}
            disabled={exporting !== null}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting === 'report' ? 'Opening...' : 'Combined Report'}
          </button>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '12px',
            padding: '8px 16px',
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: colors.textSecondary,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
