import { useState, memo, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { AlertHistoryTab } from './AlertHistoryTab';
import { AlertChannelsTab } from './AlertChannelsTab';
import { MaintenanceTab } from './MaintenanceTab';
import { AlertRulesPanel } from '../AlertRulesPanel';
import type { Tab } from './types';

interface AlertPanelProps {
  onClose: () => void;
  initialTab?: Tab;
}

const TABS = [
  { key: 'history' as const, label: 'History', icon: '📋' },
  { key: 'rules' as const, label: 'Rules', icon: '⚙️' },
  { key: 'channels' as const, label: 'Channels', icon: '📡' },
  { key: 'maintenance' as const, label: 'Maintenance', icon: '🔧' },
];

export const AlertPanel = memo(function AlertPanel({ onClose, initialTab = 'history' }: AlertPanelProps) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alerts-title"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(500px, 100vw)',
        backgroundColor: colors.bgCard,
        borderLeft: `1px solid ${colors.border}`,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header with Tabs */}
      <div
        style={{
          padding: '16px',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 id="alerts-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
            Alerts
          </h2>
          <button
            onClick={onClose}
            aria-label="Close alerts panel"
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

        {/* Tabs */}
        <div role="tablist" aria-label="Alert panel tabs" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              role="tab"
              id={`tab-${key}`}
              aria-selected={activeTab === key}
              aria-controls={`tabpanel-${key}`}
              onClick={() => setActiveTab(key)}
              onKeyDown={(e) => {
                const currentIndex = TABS.findIndex(t => t.key === key);
                if (e.key === 'ArrowRight') {
                  const nextIndex = (currentIndex + 1) % TABS.length;
                  setActiveTab(TABS[nextIndex].key);
                  document.getElementById(`tab-${TABS[nextIndex].key}`)?.focus();
                } else if (e.key === 'ArrowLeft') {
                  const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
                  setActiveTab(TABS[prevIndex].key);
                  document.getElementById(`tab-${TABS[prevIndex].key}`)?.focus();
                }
              }}
              tabIndex={activeTab === key ? 0 : -1}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === key ? '#3b82f6' : colors.textSecondary,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: activeTab === key ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div
        style={{ flex: 1, overflowY: 'auto' }}
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'history' && <AlertHistoryTab />}
        {activeTab === 'rules' && <AlertRulesPanel />}
        {activeTab === 'channels' && <AlertChannelsTab />}
        {activeTab === 'maintenance' && <MaintenanceTab />}
      </div>
    </div>
  );
});
