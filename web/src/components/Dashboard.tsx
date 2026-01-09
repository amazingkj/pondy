import { useState, useEffect, useMemo } from 'react';
import { useTargets } from '../hooks/useMetrics';
import { TargetCard } from './TargetCard';
import { Overview } from './Overview';
import { useTheme } from '../context/ThemeContext';

export type GlobalView = 'trend' | 'recs' | 'leaks' | 'peakTime' | 'anomalies' | 'heatmap' | null;

export function Dashboard() {
  const { data, loading, error } = useTargets(5000);
  const [globalView, setGlobalView] = useState<GlobalView>(null);
  const [targetOrder, setTargetOrder] = useState<string[]>([]);
  const { theme, toggleTheme, colors } = useTheme();

  // Initialize target order when data loads
  useEffect(() => {
    if (data?.targets && targetOrder.length === 0) {
      setTargetOrder(data.targets.map(t => t.name));
    }
  }, [data?.targets, targetOrder.length]);

  // Merge new targets into the existing order
  useEffect(() => {
    if (data?.targets) {
      const currentNames = data.targets.map(t => t.name);
      const existingInOrder = targetOrder.filter(name => currentNames.includes(name));
      const newTargets = currentNames.filter(name => !targetOrder.includes(name));
      if (newTargets.length > 0 || existingInOrder.length !== targetOrder.length) {
        setTargetOrder([...existingInOrder, ...newTargets]);
      }
    }
  }, [data?.targets, targetOrder]);

  const handleGlobalToggle = (view: GlobalView) => {
    setGlobalView(globalView === view ? null : view);
  };

  // Get ordered targets
  const orderedTargets = useMemo(() => {
    if (!data?.targets) return [];
    const targetMap = new Map(data.targets.map(t => [t.name, t]));
    return targetOrder
      .filter(name => targetMap.has(name))
      .map(name => targetMap.get(name)!);
  }, [data?.targets, targetOrder]);

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
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: colors.text }}>
              pondy
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: colors.textSecondary }}>
              Connection Pool Monitor
            </p>
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
              {orderedTargets.map((target) => (
                <TargetCard key={target.name} target={target} globalView={globalView} />
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
          </div>
        </div>
      </footer>
    </div>
  );
}
