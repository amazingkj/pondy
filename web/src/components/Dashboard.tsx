import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTargets } from '../hooks/useMetrics';
import { TargetCard } from './TargetCard';
import { Overview } from './Overview';
import { useTheme } from '../context/ThemeContext';
import { useKeyboardShortcuts, useShortcutsHelp } from '../hooks/useKeyboardShortcuts';
import { ShortcutsHelp } from './ShortcutsHelp';

export type GlobalView = 'trend' | 'recs' | 'leaks' | 'peakTime' | 'anomalies' | 'heatmap' | null;

const STORAGE_KEYS = {
  TARGET_ORDER: 'pondy-target-order',
  SELECTED_GROUP: 'pondy-selected-group',
};

export function Dashboard() {
  const { data, loading, error } = useTargets(5000);
  const [globalView, setGlobalView] = useState<GlobalView>(null);
  const [targetOrder, setTargetOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TARGET_ORDER);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedGroup, setSelectedGroup] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SELECTED_GROUP);
    } catch {
      return null;
    }
  });
  const { theme, toggleTheme, colors } = useTheme();

  // Save target order to localStorage
  useEffect(() => {
    if (targetOrder.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEYS.TARGET_ORDER, JSON.stringify(targetOrder));
      } catch {
        // Ignore storage errors
      }
    }
  }, [targetOrder]);

  // Save selected group to localStorage
  useEffect(() => {
    try {
      if (selectedGroup) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_GROUP, selectedGroup);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_GROUP);
      }
    } catch {
      // Ignore storage errors
    }
  }, [selectedGroup]);

  // Initialize target order when data loads (merge with saved order)
  useEffect(() => {
    if (data?.targets && data.targets.length > 0) {
      const currentNames = data.targets.map(t => t.name);
      if (targetOrder.length === 0) {
        // No saved order, use data order
        setTargetOrder(currentNames);
      } else {
        // Merge: keep saved order for existing targets, append new ones
        const existingInOrder = targetOrder.filter(name => currentNames.includes(name));
        const newTargets = currentNames.filter(name => !targetOrder.includes(name));
        if (newTargets.length > 0 || existingInOrder.length !== targetOrder.length) {
          setTargetOrder([...existingInOrder, ...newTargets]);
        }
      }
    }
  }, [data?.targets]);

  const handleGlobalToggle = useCallback((view: GlobalView) => {
    setGlobalView(prev => prev === view ? null : view);
  }, []);

  // Keyboard shortcuts
  const shortcutsHelp = useShortcutsHelp();

  const shortcuts = useMemo(() => [
    { key: 'r', action: () => window.location.reload(), description: 'Reload page' },
    { key: 't', action: () => handleGlobalToggle('trend'), description: 'Toggle Trends view' },
    { key: 'h', action: () => handleGlobalToggle('heatmap'), description: 'Toggle Heatmap view' },
    { key: 'd', action: toggleTheme, description: 'Toggle dark mode' },
    { key: 'Escape', action: () => { setGlobalView(null); setSelectedGroup(null); }, description: 'Clear selections' },
    { key: '?', action: shortcutsHelp.toggle, description: 'Show shortcuts help' },
  ], [handleGlobalToggle, toggleTheme, shortcutsHelp.toggle]);

  useKeyboardShortcuts(shortcuts);

  // Get unique groups from data
  const groups = useMemo(() => {
    return data?.groups || [];
  }, [data?.groups]);

  // Get ordered and filtered targets
  const orderedTargets = useMemo(() => {
    if (!data?.targets) return [];
    const targetMap = new Map(data.targets.map(t => [t.name, t]));
    let targets = targetOrder
      .filter(name => targetMap.has(name))
      .map(name => targetMap.get(name)!);

    // Filter by selected group
    if (selectedGroup) {
      targets = targets.filter(t => t.group === selectedGroup);
    }

    return targets;
  }, [data?.targets, targetOrder, selectedGroup]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, transition: 'background-color 0.2s' }}>
      <header
        style={{
          backgroundColor: colors.bgCard,
          borderBottom: `1px solid ${colors.border}`,
          padding: '12px 16px',
          transition: 'background-color 0.2s, border-color 0.2s',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: colors.text }}>
                pondy
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: colors.textSecondary }}>
                Connection Pool Monitor
              </p>
            </div>
            {groups.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setSelectedGroup(null)}
                  style={{
                    padding: '6px 12px',
                    border: `1px solid ${selectedGroup === null ? colors.accent : colors.border}`,
                    borderRadius: '16px',
                    backgroundColor: selectedGroup === null ? (theme === 'dark' ? '#1e3a5f' : '#dbeafe') : 'transparent',
                    color: selectedGroup === null ? colors.accent : colors.textSecondary,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                >
                  All
                </button>
                {groups.map(group => (
                  <button
                    key={group}
                    onClick={() => setSelectedGroup(group)}
                    style={{
                      padding: '6px 12px',
                      border: `1px solid ${selectedGroup === group ? colors.accent : colors.border}`,
                      borderRadius: '16px',
                      backgroundColor: selectedGroup === group ? (theme === 'dark' ? '#1e3a5f' : '#dbeafe') : 'transparent',
                      color: selectedGroup === group ? colors.accent : colors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      textTransform: 'capitalize',
                      transition: 'all 0.2s',
                    }}
                  >
                    {group}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={toggleTheme}
            style={{
              padding: '8px 12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.bgSecondary,
              color: colors.text,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
            }}
          >
            {theme === 'dark' ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
                Light
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                Dark
              </>
            )}
          </button>
        </div>
      </header>

      <main style={{ padding: '16px' }}>
        {loading && !data && (
          <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>
            Loading...
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#fee2e2',
              borderRadius: '8px',
              color: '#991b1b',
            }}
          >
            Error: {error}
          </div>
        )}

        {data && data.targets.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>
            No targets configured
          </div>
        )}

        {data && data.targets.length > 0 && (
          <>
            <Overview
              globalView={globalView}
              onGlobalToggle={handleGlobalToggle}
              targetOrder={targetOrder}
              onTargetOrderChange={setTargetOrder}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(max(280px, calc((100% - 32px) / 3)), 1fr))',
                gap: '16px',
              }}
            >
              {orderedTargets.map((target, index) => (
                <TargetCard key={target.name} target={target} globalView={globalView} renderIndex={index} />
              ))}
            </div>
          </>
        )}
      </main>

      <footer
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: '12px 16px',
          marginTop: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: colors.text, fontSize: '14px' }}>pondy</span>
            <span
              style={{
                padding: '2px 8px',
                backgroundColor: theme === 'dark' ? '#1e3a5f' : '#dbeafe',
                color: theme === 'dark' ? '#60a5fa' : '#1d4ed8',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              v0.1.0
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px' }}>
            <a
              href="https://github.com/amazingkj/pondy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.textSecondary, textDecoration: 'none' }}
              onMouseOver={(e) => (e.currentTarget.style.color = colors.text)}
              onMouseOut={(e) => (e.currentTarget.style.color = colors.textSecondary)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                GitHub
              </span>
            </a>
            <a
              href="https://github.com/amazingkj/pondy/issues"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.textSecondary, textDecoration: 'none' }}
              onMouseOver={(e) => (e.currentTarget.style.color = colors.text)}
              onMouseOut={(e) => (e.currentTarget.style.color = colors.textSecondary)}
            >
              Issues
            </a>
            <a
              href="https://github.com/amazingkj/pondy/wiki"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.textSecondary, textDecoration: 'none' }}
              onMouseOver={(e) => (e.currentTarget.style.color = colors.text)}
              onMouseOut={(e) => (e.currentTarget.style.color = colors.textSecondary)}
            >
              Docs
            </a>
            <button
              onClick={shortcutsHelp.open}
              style={{
                background: 'none',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                padding: '4px 10px',
                color: colors.textSecondary,
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Keyboard shortcuts (Press ? to open)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
              </svg>
              Shortcuts
            </button>
          </div>
        </div>
      </footer>

      {/* Keyboard Shortcuts Help Modal */}
      <ShortcutsHelp
        isOpen={shortcutsHelp.isOpen}
        onClose={shortcutsHelp.close}
        shortcuts={shortcuts}
      />
    </div>
  );
}
