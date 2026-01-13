import { useTheme } from '../context/ThemeContext';

interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  small?: boolean;
}

export function ActionButton({ children, onClick, active = false, small = false }: ActionButtonProps) {
  const { colors } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? '4px 10px' : '6px 12px',
        border: `1px solid ${colors.border}`,
        borderRadius: small ? '4px' : '5px',
        backgroundColor: active ? '#3b82f6' : colors.bgCard,
        color: active ? '#fff' : colors.text,
        cursor: 'pointer',
        fontSize: small ? '11px' : '12px',
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}
