import { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const HELP_GS_KEY = 'help_getting_started_v1';
type GsState = { upload: boolean; voice: boolean; draw: boolean; bookmark: boolean; ai: boolean; room: boolean };
const GS_DEFAULT: GsState = { upload: false, voice: false, draw: false, bookmark: false, ai: false, room: false };

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState(0);
  const [checklist, setChecklist] = useState<GsState>(() => {
    try {
      const s = localStorage.getItem(HELP_GS_KEY);
      return s ? { ...GS_DEFAULT, ...JSON.parse(s) } : GS_DEFAULT;
    } catch { return GS_DEFAULT; }
  });

  const toggleCheck = (key: keyof GsState) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    try { localStorage.setItem(HELP_GS_KEY, JSON.stringify(next)); } catch {}
  };
  const allDone = Object.values(checklist).every(Boolean);

  const tabs = [t('help_tab_shortcuts'), t('help_tab_tips'), t('help_tab_start'), t('help_tab_new')];

  const scGroups = [
    {
      label: 'Navigation',
      items: [{ key: '← / →', desc: t('ws_sc_nav') }],
    },
    {
      label: 'Tools',
      items: [
        { key: 'P', desc: t('ws_sc_pen') },
        { key: 'M', desc: t('ws_sc_marker') },
        { key: 'H', desc: t('ws_sc_highlighter') },
        { key: 'E', desc: t('ws_sc_eraser') },
        { key: 'C', desc: t('ws_sc_cursor') },
      ],
    },
    {
      label: 'Drawing',
      items: [
        { key: 'Shift + drag', desc: t('ws_sc_straight') },
        { key: 'Ctrl + Z', desc: t('ws_sc_undo') },
      ],
    },
    {
      label: 'Document',
      items: [
        { key: 'N', desc: t('ws_sc_blank') },
        { key: 'Ctrl + B', desc: t('ws_sc_bookmark') },
        { key: 'Ctrl + F', desc: t('ws_sc_search') },
        { key: 'Ctrl + S', desc: t('ws_sc_sync') },
        { key: 'Space', desc: t('ws_sc_play') },
      ],
    },
    {
      label: 'Zoom',
      items: [
        { key: 'Ctrl + +', desc: t('ws_sc_zoom_in') },
        { key: 'Ctrl + −', desc: t('ws_sc_zoom_out') },
      ],
    },
    {
      label: 'Other',
      items: [
        { key: 'Escape', desc: t('ws_sc_escape') },
        { key: '?', desc: t('ws_sc_help') },
      ],
    },
  ];

  const tips = [
    { title: t('help_tip1_title'), body: t('help_tip1') },
    { title: t('help_tip2_title'), body: t('help_tip2') },
    { title: t('help_tip3_title'), body: t('help_tip3') },
    { title: t('help_tip4_title'), body: t('help_tip4') },
    { title: t('help_tip5_title'), body: t('help_tip5') },
  ];

  const gsItems: { key: keyof GsState; label: string }[] = [
    { key: 'upload',   label: t('help_gs_upload') },
    { key: 'voice',    label: t('help_gs_voice') },
    { key: 'draw',     label: t('help_gs_draw') },
    { key: 'bookmark', label: t('help_gs_bookmark') },
    { key: 'ai',       label: t('help_gs_ai') },
    { key: 'room',     label: t('help_gs_room') },
  ];

  const wnItems = [
    { title: t('help_wn1_title'), body: t('help_wn1_body') },
    { title: t('help_wn2_title'), body: t('help_wn2_body') },
    { title: t('help_wn3_title'), body: t('help_wn3_body') },
    { title: t('help_wn4_title'), body: t('help_wn4_body') },
    { title: t('help_wn5_title'), body: t('help_wn5_body') },
  ];

  const KBD = ({ children }: { children: React.ReactNode }) => (
    <kbd style={{
      fontSize: 10.5, fontFamily: 'inherit', fontWeight: 600,
      color: 'var(--text-2)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-strong)',
      borderRadius: 4, padding: '1px 6px',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{children}</kbd>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.52)',
      }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{
          width: 460,
          maxHeight: '82vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-float)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--bg-float-border)',
          boxShadow: 'var(--shadow-float)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 0',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>
            {t('help_title')}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: 4, border: '1px solid transparent',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)', borderColor: 'transparent' })}
          ><X size={13} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '10px 18px 0', flexShrink: 0 }}>
          {tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              style={{
                padding: '5px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                background: activeTab === i ? 'var(--bg-active)' : 'transparent',
                border: `1px solid ${activeTab === i ? 'var(--border-strong)' : 'transparent'}`,
                color: activeTab === i ? 'var(--text-1)' : 'var(--text-3)',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseOver={(e) => { if (activeTab !== i) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-2)' }); }}
              onMouseOut={(e) => { if (activeTab !== i) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)' }); }}
            >{tab}</button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '10px 0 0' }} />

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 18px' }}>

          {/* ── Shortcuts tab ── */}
          {activeTab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {scGroups.map(({ label, items }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {items.map(({ key, desc }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{desc}</span>
                        <KBD>{key}</KBD>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Tips tab ── */}
          {activeTab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tips.map(({ title, body }, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{body}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Getting Started tab ── */}
          {activeTab === 2 && (
            <div>
              {!allDone && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
                  {t('help_gs_subtitle')}
                </p>
              )}
              {allDone ? (
                <div style={{
                  padding: '16px 14px', borderRadius: 4,
                  background: 'rgba(89,101,217,0.1)',
                  border: '1px solid rgba(89,101,217,0.25)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{t('help_gs_done')}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {gsItems.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleCheck(key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', borderRadius: 4, width: '100%',
                        background: checklist[key] ? 'rgba(89,101,217,0.07)' : 'var(--bg-elevated)',
                        border: `1px solid ${checklist[key] ? 'rgba(89,101,217,0.22)' : 'var(--border)'}`,
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        transition: 'background 0.14s, border-color 0.14s',
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        background: checklist[key] ? 'var(--accent)' : 'var(--bg-panel)',
                        border: `1.5px solid ${checklist[key] ? 'var(--accent)' : 'var(--border-strong)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.14s, border-color 0.14s',
                      }}>
                        {checklist[key] && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5L3.8 7.5L8.5 2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: 12.5, fontWeight: 500,
                        color: checklist[key] ? 'var(--text-3)' : 'var(--text-1)',
                        textDecoration: checklist[key] ? 'line-through' : 'none',
                        transition: 'color 0.14s',
                      }}>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── What's New tab ── */}
          {activeTab === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {wnItems.map(({ title, body }, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '10px 12px', borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                    background: 'var(--accent)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, marginTop: 1,
                  }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
