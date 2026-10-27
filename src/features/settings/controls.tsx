'use client';
import { useState } from 'react';
import { Check, Eye, EyeOff, AlertTriangle } from 'lucide-react';

export function Divider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '24px 0' }} />;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
      {children}
    </p>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
      {children}
    </h2>
  );
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

export function AppInput({
  value, onChange, type = 'text', placeholder, disabled, maxLength,
  autoCapitalize, spellCheck, onMouseOver, onMouseOut,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  autoCapitalize?: string;
  spellCheck?: boolean;
  onMouseOver?: React.MouseEventHandler<HTMLInputElement>;
  onMouseOut?: React.MouseEventHandler<HTMLInputElement>;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      spellCheck={spellCheck}
      className="app-input"
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      style={{
        width: '100%', height: 38, padding: '0 12px',
        borderRadius: 4, border: '1px solid var(--border)',
        background: 'var(--bg-elevated)', color: 'var(--text-1)',
        fontSize: 13, fontFamily: 'inherit',
        boxSizing: 'border-box',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : undefined,
      }}
    />
  );
}

export function PrimaryBtn({
  children, onClick, disabled, loading,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        height: 36, padding: '0 16px',
        background: disabled || loading ? 'rgba(255,255,255,0.12)' : '#ffffff',
        color: disabled || loading ? 'rgba(255,255,255,0.35)' : '#0f172a',
        border: disabled || loading ? '1px solid rgba(255,255,255,0.15)' : 'none',
        borderRadius: 4, fontSize: 12.5, fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'background 0.13s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
      onMouseOver={(e) => { if (!disabled && !loading) e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
      onMouseOut={(e) => { if (!disabled && !loading) e.currentTarget.style.background = '#ffffff'; }}
    >
      {loading && (
        <span className="spinner" style={{
          width: 12, height: 12, borderRadius: '50%',
          border: '2px solid rgba(15,23,42,0.2)',
          borderTopColor: '#0f172a', flexShrink: 0,
        }} />
      )}
      {children}
    </button>
  );
}

export function GhostBtn({
  children, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 36, padding: '0 16px',
        background: 'var(--bg-elevated)',
        color: danger ? '#ef4444' : 'var(--text-2)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
        borderRadius: 4, fontSize: 12.5, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'background 0.13s, color 0.13s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseOver={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)';
          e.currentTarget.style.color = danger ? '#ef4444' : 'var(--text-1)';
        }
      }}
      onMouseOut={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--bg-elevated)';
          e.currentTarget.style.color = danger ? '#ef4444' : 'var(--text-2)';
        }
      }}
    >
      {children}
    </button>
  );
}

export function StatusMsg({ type, children }: { type: 'ok' | 'err'; children: React.ReactNode }) {
  return (
    <p style={{
      margin: '8px 0 0', fontSize: 12,
      color: type === 'ok' ? '#22c55e' : '#ef4444',
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {type === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />}
      {children}
    </p>
  );
}

export function PasswordInput({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="app-input"
        style={{
          width: '100%', height: 38, padding: '0 38px 0 12px',
          borderRadius: 4, border: '1px solid var(--border)',
          background: 'var(--bg-elevated)', color: 'var(--text-1)',
          fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: 'var(--text-3)',
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
        }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-checked={on}
      role="switch"
      style={{
        width: 40, height: 22, borderRadius: 4, padding: 2,
        background: on ? 'var(--accent)' : 'var(--border-strong)',
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'block', width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        transform: on ? 'translateX(18px)' : 'translateX(0)',
        transition: 'transform 0.2s',
        
      }} />
    </button>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 6 }}>{children}</div>;
}

export function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 4,
        background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
        border: `1.5px solid ${active ? 'rgba(37,99,235,0.35)' : 'var(--border)'}`,
        color: active ? 'var(--accent-hover)' : 'var(--text-2)',
        fontSize: 12, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => { if (!active) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' }); }}
      onMouseOut={(e) => { if (!active) Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' }); }}
    >
      {children}
    </button>
  );
}

export function SettingRow({ label, sub, children }: {
  label: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{label}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>{sub}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
