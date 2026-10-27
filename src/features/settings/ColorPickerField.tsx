'use client';
import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RotateCcw } from 'lucide-react';
import { FieldLabel, SubLabel } from './controls';

export function ColorPickerField({ label, value, onChange, onReset, sub }: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  onReset: () => void;
  sub?: string;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginBottom: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Swatch / trigger */}
        <button
          onClick={() => inputRef.current?.click()}
          title={t('set_app_pick_color')}
          style={{
            width: 38, height: 38, borderRadius: 4,
            background: value,
            border: '2px solid var(--border-strong)',
            cursor: 'pointer', flexShrink: 0,
            
            transition: 'box-shadow 0.15s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.15), 0 0 0 3px var(--accent-muted)'; }}
          onMouseOut={(e)  => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.15)'; }}
        />
        {/* Hidden native color input */}
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          tabIndex={-1}
        />
        {/* Hex text */}
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-2)', letterSpacing: '0.04em' }}>
          {value.toUpperCase()}
        </span>
        {/* Reset */}
        <button
          onClick={onReset}
          title={t('set_app_reset_default')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 4,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'color 0.12s, background 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-1)', background: 'var(--bg-hover)' })}
          onMouseOut={(e)  => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'var(--bg-elevated)' })}
        >
          <RotateCcw size={10} />
          {t('set_app_reset')}
        </button>
      </div>
      {sub && <SubLabel>{sub}</SubLabel>}
    </div>
  );
}
