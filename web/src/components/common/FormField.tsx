import { memo, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';

interface BaseFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

interface InputFieldProps extends BaseFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'style'> {
  type?: 'text' | 'number' | 'email' | 'password' | 'datetime-local';
}

interface SelectFieldProps extends BaseFieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  children: ReactNode;
}

export const FormField = memo(function FormField({
  label,
  required,
  error,
  hint,
  ...inputProps
}: InputFieldProps) {
  const { colors } = useTheme();

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${error ? '#ef4444' : colors.border}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    color: colors.text,
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block' as const,
    marginBottom: '4px',
    color: colors.textSecondary,
    fontSize: '12px',
    fontWeight: 500 as const,
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <input
        {...inputProps}
        style={inputStyle}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputProps.id}-error` : hint ? `${inputProps.id}-hint` : undefined}
      />
      {error && (
        <span id={`${inputProps.id}-error`} style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', display: 'block' }}>
          {error}
        </span>
      )}
      {hint && !error && (
        <span id={`${inputProps.id}-hint`} style={{ color: colors.textSecondary, fontSize: '11px', marginTop: '4px', display: 'block' }}>
          {hint}
        </span>
      )}
    </div>
  );
});

export const SelectField = memo(function SelectField({
  label,
  required,
  error,
  hint,
  children,
  ...selectProps
}: SelectFieldProps) {
  const { colors } = useTheme();

  const selectStyle = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${error ? '#ef4444' : colors.border}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    color: colors.text,
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block' as const,
    marginBottom: '4px',
    color: colors.textSecondary,
    fontSize: '12px',
    fontWeight: 500 as const,
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <select
        {...selectProps}
        style={selectStyle}
        aria-invalid={!!error}
      >
        {children}
      </select>
      {error && (
        <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', display: 'block' }}>
          {error}
        </span>
      )}
      {hint && !error && (
        <span style={{ color: colors.textSecondary, fontSize: '11px', marginTop: '4px', display: 'block' }}>
          {hint}
        </span>
      )}
    </div>
  );
});

interface LabelledCheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const LabelledCheckbox = memo(function LabelledCheckbox({
  id,
  label,
  checked,
  onChange,
  disabled,
}: LabelledCheckboxProps) {
  const { colors } = useTheme();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ width: '16px', height: '16px', cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      <label
        htmlFor={id}
        style={{
          color: colors.text,
          fontSize: '13px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {label}
      </label>
    </div>
  );
});

interface ButtonGroupProps {
  children: ReactNode;
  style?: React.CSSProperties;
}

export const ButtonGroup = memo(function ButtonGroup({ children, style }: ButtonGroupProps) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', ...style }} role="group">
      {children}
    </div>
  );
});

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  'aria-label'?: string;
}

export const FilterButton = memo(function FilterButton({
  active,
  onClick,
  children,
  'aria-label': ariaLabel,
}: FilterButtonProps) {
  const { colors } = useTheme();

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      style={{
        padding: '6px 12px',
        border: `1px solid ${active ? '#3b82f6' : colors.border}`,
        borderRadius: '4px',
        backgroundColor: active ? '#3b82f6' : 'transparent',
        color: active ? '#fff' : colors.text,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </button>
  );
});
