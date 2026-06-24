'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Tab shell for the workspace right panel. Four tabs: Notes / AI
 * Assistant / Chat / Tools. The first three match the reference design;
 * "Tools" is a transitional holding place for the workspace-tool
 * sections (Insert Image, Add Blank Page, Voice Note record, Study
 * Room, Image list, Clear drawings) that currently live in
 * DocumentToolsPanel and will eventually move into the bottom floating
 * pill toolbar in a later turn.
 *
 * All four child contents stay mounted with display:none toggled on
 * inactives, so the AI chat conversation, selected chat friend, and
 * tool modal state survive tab switches.
 *
 * Token-only styling — adapts to both light + dark themes.
 */

type TabId = 'notes' | 'ai' | 'chat' | 'tools';

const TABS: ReadonlyArray<{ id: TabId; label: string; transitional?: boolean }> = [
  { id: 'notes', label: 'Notes' },
  { id: 'ai',    label: 'AI Assistant' },
  { id: 'chat',  label: 'Chat' },
  { id: 'tools', label: 'Tools', transitional: true },
];

interface Props {
  isOpen:      boolean;
  notes:       ReactNode;
  aiAssistant: ReactNode;
  chat:        ReactNode;
  tools:       ReactNode;
  onClose?:    () => void;
}

export default function RightPanelTabs({
  isOpen, notes, aiAssistant, chat, tools, onClose,
}: Props) {
  const [active, setActive] = useState<TabId>('ai');

  return (
    <aside style={{
      width: '100%', height: '100%',
      background: 'var(--bg-panel)',
      borderLeft: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column',
      opacity: isOpen ? 1 : 0,
      transition: 'opacity 0.18s ease',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 4px',
        flexShrink: 0,
        position: 'relative',
      }}>
        {TABS.map(({ id, label, transitional }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => setActive(id)}
              title={transitional ? `${label} (temporary tab — being relocated)` : label}
              style={{
                flex: 1, position: 'relative',
                background: 'transparent', border: 'none',
                padding: '14px 6px 12px',
                fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--accent)' : 'var(--text-2)',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'color 0.12s',
              }}
              onMouseOver={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
              onMouseOut={(e)  => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
            >
              {label}
              {transitional && (
                <span style={{
                  marginLeft: 4, fontSize: 9, color: 'var(--text-3)',
                  fontWeight: 500, letterSpacing: '0.04em',
                }}>·</span>
              )}
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 8, right: 8, bottom: -1,
                  height: 2, borderRadius: 1,
                  background: isActive ? 'var(--accent)' : 'transparent',
                  transition: 'background 0.12s',
                }}
              />
            </button>
          );
        })}

        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              width: 32, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)' })}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tab content — all mounted, display:none on inactives to preserve state */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TabPane active={active === 'notes'}>{notes}</TabPane>
        <TabPane active={active === 'ai'   }>{aiAssistant}</TabPane>
        <TabPane active={active === 'chat' }>{chat}</TabPane>
        <TabPane active={active === 'tools'}>{tools}</TabPane>
      </div>
    </aside>
  );
}

function TabPane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div style={{
      display: active ? 'flex' : 'none',
      flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}
