'use client';

import { type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Tab shell for the workspace right panel. Three tabs: Notes / AI
 * Assistant / Chat. Active tab is controlled by the parent so the
 * BottomPillBar's Note pill can switch to the Notes tab.
 *
 * All three child contents stay mounted with display:none toggled on
 * inactives, so the AI chat conversation and selected chat friend
 * survive tab switches.
 *
 * Token-only styling — adapts to both light + dark themes.
 */

type TabId = 'notes' | 'ai' | 'chat';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'notes', label: 'Notes' },
  { id: 'ai',    label: 'AI Assistant' },
  { id: 'chat',  label: 'Chat' },
];

interface Props {
  isOpen:       boolean;
  activeTab:    TabId;
  onTabChange:  (id: TabId) => void;
  notes:        ReactNode;
  aiAssistant:  ReactNode;
  chat:         ReactNode;
  onClose?:     () => void;
}

export default function RightPanelTabs({
  isOpen, activeTab, onTabChange, notes, aiAssistant, chat, onClose,
}: Props) {
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
        {TABS.map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              title={label}
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
        <TabPane active={activeTab === 'notes'}>{notes}</TabPane>
        <TabPane active={activeTab === 'ai'   }>{aiAssistant}</TabPane>
        <TabPane active={activeTab === 'chat' }>{chat}</TabPane>
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
