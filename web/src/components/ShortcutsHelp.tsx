import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

interface ShortcutItem {
  key: string;
  description: string;
}

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutItem[];
}

export function ShortcutsHelp({ isOpen, onClose, shortcuts }: ShortcutsHelpProps) {
  const { colors } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={modalRef}
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: colors.textSecondary,
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ color: colors.text, fontSize: '14px' }}>{shortcut.description}</span>
              <kbd
                style={{
                  padding: '4px 8px',
                  backgroundColor: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: colors.text,
                  minWidth: '24px',
                  textAlign: 'center',
                }}
              >
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: '16px',
            marginBottom: 0,
            fontSize: '12px',
            color: colors.textSecondary,
            textAlign: 'center',
          }}
        >
          Press <kbd style={{ padding: '2px 6px', backgroundColor: colors.bgSecondary, borderRadius: '3px', fontSize: '11px' }}>?</kbd> to toggle this help
        </p>
      </div>
    </div>
  );
}
