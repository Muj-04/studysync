'use client';
import { MousePointer, Minus, Plus, Maximize2, Minimize2 } from 'lucide-react';

/**
 * Horizontal toolbar that sits directly above the PDF document area
 * (between DocTabsBar and the page content) per the Figma redesign.
 *
 * Three groups:
 *   LEFT   — Cursor / select tool
 *   CENTER — Zoom out · current percentage (click to reset to 100%) · Zoom in
 *   RIGHT  — Fullscreen · Split-view
 *
 * Purely presentational — every handler comes from the workspace page so
 * this can be swapped out or re-styled without touching the surrounding
 * state. Tokenized for both themes.
 */

interface Props {
  // Cursor / tool state
  toolIsCursor: boolean;
  onSelectCursor: () => void;

  // Zoom
  zoom: number;
  onZoomIn:  () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  canZoomIn:  boolean;
  canZoomOut: boolean;

  // Fullscreen
  isFullscreen: boolean;
  onToggleFullscreen: () => void;

  // Split view
  splitMode: boolean;
  onToggleSplit?: () => void;   // undefined hides the button (e.g. PPTX)

  /**
   * Fullscreen-friendly variant: hides the bar surface + left/right
   * groups so only the zoom pill floats centred above the document.
   * Preserves zoom reachability without intruding on the immersive view.
   */
  compact?: boolean;
}

// ── Local building blocks ─────────────────────────────────────────────────────

function ToolbarBtn({
  active = false, disabled = false, onClick, title, children,
}: {
  active?:   boolean;
  disabled?: boolean;
  onClick?:  () => void;
  title:     string;
  children:  React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        width: 28, height: 28, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        background: active ? 'var(--accent-muted)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
        color: disabled ? 'var(--text-3)' : active ? 'var(--accent)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (disabled || active) return;
        Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)',
        });
      }}
      onMouseOut={(e) => {
        if (disabled || active) return;
        Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-2)',
        });
      }}
    >
      {children}
    </button>
  );
}

function SplitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="18" rx="1.5" />
      <rect x="13" y="3" width="8" height="18" rx="1.5" />
    </svg>
  );
}

/**
 * Pill container for a tool group. Consistent styling for left / center /
 * right keeps the toolbar visually balanced — without this, a lone Cursor
 * button on the left looked like a stray icon while the center had clear
 * pill-chrome around the zoom trio.
 */
function GroupPill({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: 2,
        borderRadius: 9999,
        border: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PdfTopToolbar({
  toolIsCursor, onSelectCursor,
  zoom, onZoomIn, onZoomOut, onZoomReset, canZoomIn, canZoomOut,
  isFullscreen, onToggleFullscreen,
  splitMode, onToggleSplit,
  compact = false,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Document view controls"
      style={{
        display: 'flex', alignItems: 'center',
        // Compact: lone zoom pill floats centred over the doc; full:
        // three groups evenly distributed across the bar.
        justifyContent: compact ? 'center' : 'space-between',
        height: 36, flexShrink: 0,
        padding: '0 12px',
        // bg-elevated (not bg-app) so the bar reads as a subtle lifted
        // surface against the workspace background. Without this the
        // bar is invisible and the lone Cursor button on the left looks
        // like it's floating in empty space. Compact mode (fullscreen)
        // drops the bar surface entirely so only the zoom pill is
        // visible above the document.
        background: compact ? 'transparent' : 'var(--bg-elevated)',
        borderBottom: compact ? 'none' : '1px solid var(--border-subtle)',
        // Sit above the doc + don't block pointer events outside the pill
        // when bar is transparent (compact mode).
        ...(compact ? { pointerEvents: 'none' as const } : null),
      }}
    >
      {/* LEFT — selection tool. Hidden in compact (fullscreen) mode. */}
      {!compact && (
        <GroupPill>
          <ToolbarBtn
            title="Select / cursor"
            active={toolIsCursor}
            onClick={onSelectCursor}
          >
            <MousePointer size={14} strokeWidth={1.8} />
          </ToolbarBtn>
        </GroupPill>
      )}

      {/* CENTER — zoom. Always visible. Re-enable pointer events on the
          pill itself when in compact mode (parent disables them). */}
      <div style={compact ? { pointerEvents: 'auto' } : undefined}>
      <GroupPill>
        <ToolbarBtn
          title="Zoom out"
          disabled={!canZoomOut}
          onClick={onZoomOut}
        >
          <Minus size={13} strokeWidth={2} />
        </ToolbarBtn>

        <button
          onClick={onZoomReset}
          title="Reset zoom to 100%"
          aria-label="Reset zoom to 100%"
          style={{
            minWidth: 50, height: 24, padding: '0 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-1)',
            fontFamily: 'var(--font-mono), monospace',
            fontSize: 11.5, fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            borderRadius: 9999,
            transition: 'background 0.13s, color 0.13s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--bg-hover)', color: 'var(--accent)',
          })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, {
            background: 'transparent', color: 'var(--text-1)',
          })}
        >
          {`${Math.round(zoom * 100)}%`}
        </button>

        <ToolbarBtn
          title="Zoom in"
          disabled={!canZoomIn}
          onClick={onZoomIn}
        >
          <Plus size={13} strokeWidth={2} />
        </ToolbarBtn>
      </GroupPill>
      </div>

      {/* RIGHT — fullscreen + split. Hidden in compact (fullscreen)
          mode; the big top-right Exit Fullscreen button handles exit
          and Split is doc-chrome rather than immersive-essential. */}
      {!compact && (
        <GroupPill>
          <ToolbarBtn
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            active={isFullscreen}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} strokeWidth={1.8} /> : <Maximize2 size={14} strokeWidth={1.8} />}
          </ToolbarBtn>

          {onToggleSplit && (
            <ToolbarBtn
              title={splitMode ? 'Exit split view' : 'Split view'}
              active={splitMode}
              onClick={onToggleSplit}
            >
              <SplitIcon />
            </ToolbarBtn>
          )}
        </GroupPill>
      )}
    </div>
  );
}
