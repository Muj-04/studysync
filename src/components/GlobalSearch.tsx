'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, FileText, Mic, Bookmark, File } from 'lucide-react';
import { globalSearch } from '@/lib/supabase/db';
import type { GlobalSearchResult } from '@/lib/supabase/db';

interface Props {
  onClose: () => void;
  onNavigate: (docId: string, pageNum?: number) => void;
}

const TYPE_ICON: Record<GlobalSearchResult['type'], React.ReactNode> = {
  document:   <File size={13} />,
  text_note:  <FileText size={13} />,
  voice_note: <Mic size={13} />,
  bookmark:   <Bookmark size={13} />,
};

const TYPE_LABEL: Record<GlobalSearchResult['type'], string> = {
  document:   'Document',
  text_note:  'Note',
  voice_note: 'Voice Note',
  bookmark:   'Bookmark',
};

const TYPE_COLOR: Record<GlobalSearchResult['type'], string> = {
  document:   '#5965d9',
  text_note:  '#22c55e',
  voice_note: '#f59e0b',
  bookmark:   '#ec4899',
};

function group(results: GlobalSearchResult[]) {
  const map = new Map<GlobalSearchResult['type'], GlobalSearchResult[]>();
  for (const r of results) {
    if (!map.has(r.type)) map.set(r.type, []);
    map.get(r.type)!.push(r);
  }
  return map;
}

export default function GlobalSearch({ onClose, onNavigate }: Props) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [focused, setFocused]   = useState(-1);
  const inputRef                = useRef<HTMLInputElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    globalSearch(q).then((res) => { setResults(res); setLoading(false); setFocused(-1); });
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  function handleSelect(r: GlobalSearchResult) {
    onNavigate(r.docId, r.pageNum);
    onClose();
  }

  // Flatten results for keyboard nav
  const flat = results;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused((i) => Math.min(i + 1, flat.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && focused >= 0 && flat[focused]) handleSelect(flat[focused]);
  }

  const grouped = group(results);
  const order: GlobalSearchResult['type'][] = ['document', 'text_note', 'voice_note', 'bookmark'];
  let runningIdx = 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520, maxHeight: '70vh',
          background: 'var(--bg-panel)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <Search size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={handleInput}
            placeholder="Search notes, bookmarks, documents…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit',
            }}
          />
          {loading && (
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid var(--border-strong)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 0.7s linear infinite',
              flexShrink: 0,
            }} />
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!query.trim() && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Type to search across all your documents, notes, and bookmarks.</p>
            </div>
          )}

          {query.trim() && !loading && results.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {order.map((type) => {
            const items = grouped.get(type);
            if (!items?.length) return null;
            return (
              <div key={type}>
                {/* Group header */}
                <div style={{
                  padding: '8px 16px 4px',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--text-3)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ color: TYPE_COLOR[type] }}>{TYPE_ICON[type]}</span>
                  {TYPE_LABEL[type]}s
                </div>

                {items.map((r) => {
                  const idx = runningIdx++;
                  const isFocused = focused === idx;
                  return (
                    <button
                      key={`${r.type}-${r.docId}-${r.pageNum}-${r.content.slice(0, 20)}`}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setFocused(idx)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        width: '100%', padding: '8px 16px',
                        background: isFocused ? 'var(--bg-hover)' : 'transparent',
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                    >
                      <span style={{
                        flexShrink: 0, marginTop: 2,
                        color: TYPE_COLOR[r.type],
                      }}>
                        {TYPE_ICON[r.type]}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontSize: 12.5, color: 'var(--text-1)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}>
                          {r.content.length > 80 ? r.content.slice(0, 80) + '…' : r.content}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          {r.docName}{r.pageNum ? ` · Page ${r.pageNum}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div style={{
            padding: '6px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 12, alignItems: 'center',
          }}>
            <Hint keys={['↑', '↓']} label="navigate" />
            <Hint keys={['Enter']} label="open" />
            <Hint keys={['Esc']} label="close" />
          </div>
        )}
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--text-3)' }}>
      {keys.map((k) => (
        <kbd key={k} style={{
          fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
          borderRadius: 3, padding: '1px 4px', color: 'var(--text-2)',
        }}>{k}</kbd>
      ))}
      {label}
    </span>
  );
}
