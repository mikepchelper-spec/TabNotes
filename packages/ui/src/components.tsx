import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  children,
  style,
  ...props
}) => {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
    ...(size === 'sm' && { fontSize: 'var(--text-xs)', padding: '5px 10px', height: '28px' }),
    ...(size === 'md' && { fontSize: 'var(--text-sm)', padding: '7px 14px', height: '34px' }),
    ...(size === 'lg' && { fontSize: 'var(--text-md)', padding: '10px 20px', height: '42px' }),
    ...(variant === 'primary' && {
      background: 'var(--color-accent)',
      color: '#fff',
    }),
    ...(variant === 'secondary' && {
      background: 'var(--color-bg-muted)',
      color: 'var(--color-text)',
    }),
    ...(variant === 'ghost' && {
      background: 'transparent',
      color: 'var(--color-text-muted)',
    }),
    ...(variant === 'danger' && {
      background: 'var(--color-danger-subtle)',
      color: 'var(--color-danger)',
    }),
    ...style,
  };

  return (
    <button style={base} {...props}>
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, style, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    {label && (
      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
        {label}
      </label>
    )}
    <input
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)',
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        outline: 'none',
        transition: 'border-color var(--transition-fast)',
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    />
  </div>
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, style, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
    {label && (
      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
        {label}
      </label>
    )}
    <textarea
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)',
        lineHeight: '1.6',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        outline: 'none',
        resize: 'none',
        transition: 'border-color var(--transition-fast)',
        flex: 1,
        ...style,
      }}
      {...props}
    />
  </div>
);

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, style, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)',
      boxShadow: 'var(--shadow-sm)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all var(--transition-fast)',
      ...style,
    }}
  >
    {children}
  </div>
);

interface TabOption {
  value: string;
  label: string;
  icon?: string;
}

interface SegmentedControlProps {
  options: TabOption[];
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, onChange, style }) => (
  <div
    style={{
      display: 'flex',
      background: 'var(--color-bg-muted)',
      borderRadius: 'var(--radius-md)',
      padding: '2px',
      gap: '1px',
      ...style,
    }}
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          fontSize: 'var(--text-xs)',
          fontWeight: value === opt.value ? 600 : 400,
          fontFamily: 'var(--font-sans)',
          padding: '5px 8px',
          borderRadius: 'calc(var(--radius-md) - 2px)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
          background: value === opt.value ? 'var(--color-bg)' : 'transparent',
          color: value === opt.value ? 'var(--color-text)' : 'var(--color-text-muted)',
          boxShadow: value === opt.value ? 'var(--shadow-sm)' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {opt.icon && <span>{opt.icon}</span>}
        {opt.label}
      </button>
    ))}
  </div>
);

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'accent';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default' }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: 'var(--text-xs)',
      fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      padding: '2px 7px',
      borderRadius: 'var(--radius-full)',
      ...(variant === 'default' && { background: 'var(--color-bg-muted)', color: 'var(--color-text-muted)' }),
      ...(variant === 'success' && { background: 'var(--color-success-subtle)', color: 'var(--color-success)' }),
      ...(variant === 'danger' && { background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' }),
      ...(variant === 'accent' && { background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }),
    }}
  >
    {children}
  </span>
);
