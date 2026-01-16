import { memo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  'aria-label': string;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  badge?: number;
  children: ReactNode;
}

export const IconButton = memo(function IconButton({
  'aria-label': ariaLabel,
  variant = 'default',
  size = 'md',
  badge,
  children,
  disabled,
  ...buttonProps
}: IconButtonProps) {
  const { colors } = useTheme();

  const sizes = {
    sm: { padding: '4px', fontSize: '14px' },
    md: { padding: '8px', fontSize: '18px' },
    lg: { padding: '12px', fontSize: '24px' },
  };

  const variants = {
    default: {
      backgroundColor: colors.bgSecondary,
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`,
    },
    primary: {
      backgroundColor: '#3b82f6',
      color: '#fff',
      border: '1px solid #3b82f6',
    },
    danger: {
      backgroundColor: '#ef4444',
      color: '#fff',
      border: '1px solid #ef4444',
    },
  };

  return (
    <button
      {...buttonProps}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{
        ...sizes[size],
        ...variants[variant],
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s ease',
      }}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            minWidth: '18px',
            height: '18px',
            padding: '0 4px',
            borderRadius: '9px',
            backgroundColor: '#ef4444',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label={`${badge} items`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
});
