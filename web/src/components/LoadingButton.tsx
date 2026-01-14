import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  children,
  isLoading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  style,
  ...props
}) => {
  const { colors, isDark } = useTheme();

  const sizeStyles = {
    sm: { padding: '6px 12px', fontSize: '12px', gap: '6px' },
    md: { padding: '8px 16px', fontSize: '14px', gap: '8px' },
    lg: { padding: '12px 24px', fontSize: '16px', gap: '10px' },
  };

  const variantStyles = {
    primary: {
      backgroundColor: colors.primary,
      color: '#ffffff',
      border: 'none',
    },
    secondary: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      color: colors.text,
      border: `1px solid ${colors.border}`,
    },
    danger: {
      backgroundColor: '#ef4444',
      color: '#ffffff',
      border: 'none',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: colors.text,
      border: 'none',
    },
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sizeStyles[size].gap,
        padding: sizeStyles[size].padding,
        fontSize: sizeStyles[size].fontSize,
        fontWeight: 500,
        borderRadius: '8px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
        transition: 'all 0.2s ease',
        outline: 'none',
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner size={size === 'sm' ? 12 : size === 'lg' ? 18 : 14} />
          {loadingText || children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
};

const Spinner: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={{ animation: 'button-spin 1s linear infinite' }}
  >
    <style>{`@keyframes button-spin { to { transform: rotate(360deg); } }`}</style>
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="3"
      fill="none"
      strokeDasharray="50"
      strokeDashoffset="15"
      strokeLinecap="round"
    />
  </svg>
);

// Icon button variant
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  isLoading = false,
  size = 'md',
  disabled,
  style,
  ...props
}) => {
  const { colors, isDark } = useTheme();

  const sizeMap = {
    sm: { size: '28px', iconSize: 14 },
    md: { size: '36px', iconSize: 18 },
    lg: { size: '44px', iconSize: 22 },
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizeMap[size].size,
        height: sizeMap[size].size,
        padding: 0,
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        color: colors.text,
        border: 'none',
        borderRadius: '8px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
        transition: 'all 0.2s ease',
        outline: 'none',
        ...style,
      }}
      {...props}
    >
      {isLoading ? <Spinner size={sizeMap[size].iconSize} /> : children}
    </button>
  );
};
