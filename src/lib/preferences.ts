// Shared preference types + DOM application utilities.
// Used by settings page, workspace, dashboard, and the anti-FOUC layout script.

export interface UserPreferences {
  theme?: 'dark' | 'light';
  fontSize?: 'small' | 'medium' | 'large';
  accentColor?: string;   // named preset ('Blue') or custom hex ('#ff0000')
  bgColor?: string | null;
  sidebarColor?: string | null;
  fontFamily?: 'default' | 'serif' | 'mono';
  viewMode?: 'page' | 'scroll';
  defaultZoom?: number;
  defaultBg?: 'white' | 'dark';
  notifRoomJoin?: boolean;
}

export const ACCENT_PRESETS: Record<string, { base: string; hover: string; muted: string }> = {
  Blue:   { base: '#2563eb', hover: '#3b82f6', muted: 'rgba(37,99,235,0.14)' },
  Purple: { base: '#7c3aed', hover: '#8b5cf6', muted: 'rgba(124,58,237,0.14)' },
  Green:  { base: '#059669', hover: '#10b981', muted: 'rgba(5,150,105,0.14)' },
  Orange: { base: '#d97706', hover: '#f59e0b', muted: 'rgba(217,119,6,0.14)' },
  Pink:   { base: '#db2777', hover: '#ec4899', muted: 'rgba(219,39,119,0.14)' },
};

export const FONT_STACKS: Record<string, string> = {
  default: "'Geist', 'Inter', system-ui, -apple-system, sans-serif",
  serif:   "Georgia, 'Times New Roman', serif",
  mono:    "'JetBrains Mono', 'Fira Code', Consolas, monospace",
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.replace('#', '').padStart(6, '0'));
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

function lightenHex(hex: string, amount = 0.18): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgb(${Math.min(255, Math.round(c.r + (255 - c.r) * amount))},${Math.min(255, Math.round(c.g + (255 - c.g) * amount))},${Math.min(255, Math.round(c.b + (255 - c.b) * amount))})`;
}

function mutedHex(hex: string): string {
  const c = hexToRgb(hex);
  if (!c) return 'rgba(37,99,235,0.14)';
  return `rgba(${c.r},${c.g},${c.b},0.14)`;
}

export function applyPreferences(prefs: UserPreferences) {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;

  // ── Theme ──────────────────────────────────────────────────────────────────
  if (prefs.theme === 'light') r.setAttribute('data-theme', 'light');
  else if (prefs.theme === 'dark') r.removeAttribute('data-theme');

  // ── Font size ──────────────────────────────────────────────────────────────
  if (prefs.fontSize === 'small') document.body.style.fontSize = '11px';
  else if (prefs.fontSize === 'large') document.body.style.fontSize = '16px';
  else if (prefs.fontSize === 'medium') document.body.style.fontSize = '';

  // ── Accent color ───────────────────────────────────────────────────────────
  if (prefs.accentColor) {
    const preset = ACCENT_PRESETS[prefs.accentColor];
    if (preset) {
      r.style.setProperty('--accent', preset.base);
      r.style.setProperty('--accent-hover', preset.hover);
      r.style.setProperty('--accent-muted', preset.muted);
      r.style.setProperty('--violet', preset.base);
      r.style.setProperty('--violet-muted', preset.muted);
    } else {
      // custom hex
      r.style.setProperty('--accent', prefs.accentColor);
      r.style.setProperty('--accent-hover', lightenHex(prefs.accentColor));
      r.style.setProperty('--accent-muted', mutedHex(prefs.accentColor));
      r.style.setProperty('--violet', prefs.accentColor);
      r.style.setProperty('--violet-muted', mutedHex(prefs.accentColor));
    }
  }

  // ── Background color ───────────────────────────────────────────────────────
  if (prefs.bgColor) {
    r.style.setProperty('--bg-app', prefs.bgColor);
  } else if (prefs.bgColor === null) {
    r.style.removeProperty('--bg-app');
  }

  // ── Sidebar color ──────────────────────────────────────────────────────────
  if (prefs.sidebarColor) {
    r.style.setProperty('--bg-panel', prefs.sidebarColor);
    r.style.setProperty('--bg-sidebar', prefs.sidebarColor);
  } else if (prefs.sidebarColor === null) {
    r.style.removeProperty('--bg-panel');
    r.style.removeProperty('--bg-sidebar');
  }

  // ── Font family ────────────────────────────────────────────────────────────
  if (prefs.fontFamily && FONT_STACKS[prefs.fontFamily]) {
    r.style.setProperty('--font-body', FONT_STACKS[prefs.fontFamily]);
  }
}

export function getInitials(nameOrEmail: string): string {
  const name = nameOrEmail.split('@')[0].trim();
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
