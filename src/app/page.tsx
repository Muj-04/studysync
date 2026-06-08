'use client';
import Link from 'next/link';
import { BookOpen, Mic, PenTool, ArrowRight, Zap, Users, Library } from 'lucide-react';

const FEATURES = [
  {
    icon: <Mic size={18} />,
    title: 'Voice Notes',
    subtitle: 'Record per-page audio notes while studying. Replay context-aware annotations instantly.',
    badge: null,
  },
  {
    icon: <PenTool size={18} />,
    title: 'Drawing & Whiteboards',
    subtitle: 'Annotate PDFs with precision tools. Blank pages for diagrams, mind maps, equations.',
    badge: null,
  },
  {
    icon: <Library size={18} />,
    title: 'PPTX Conversion',
    subtitle: 'Import PowerPoint lectures and work with them alongside your PDFs seamlessly.',
    badge: null,
  },
  {
    icon: <Zap size={18} />,
    title: 'AI Features',
    subtitle: 'Quiz generation, auto-summarization, and smart flashcards. Phase 2 rollout.',
    badge: 'Coming Soon',
  },
] as const;

// ── App screen mockup ─────────────────────────────────────────────────────────

function AppScreen() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'rgba(6,8,18,0.85)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
    }}>
      {/* Top nav */}
      <div style={{
        height: 32, flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center',
        padding: '0 10px', gap: 7,
      }}>
        <div style={{
          width: 15, height: 15, borderRadius: 3,
          background: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <div style={{ width: 7, height: 7, border: '1.5px solid #0f172a', borderRadius: 1 }} />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#ffffff' }}>StudySpace</span>
        <div style={{ display: 'flex', gap: 1, marginLeft: 6 }}>
          {['Recent', 'Mercury PDF', 'Blank Page'].map((tab, i) => (
            <div key={i} style={{
              padding: '2px 7px', borderRadius: '3px 3px 0 0', fontSize: 7,
              background: i === 1 ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: i === 1 ? '#ffffff' : 'rgba(255,255,255,0.4)',
              border: i === 1 ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
              borderBottom: 'none',
              fontWeight: i === 1 ? 600 : 400,
            }}>
              {tab}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 42, height: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)' }} />
        <div style={{ width: 28, height: 14, background: '#ffffff', borderRadius: 3 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Thumbnails sidebar */}
        <div style={{
          width: 56, flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          borderRight: '1px solid rgba(255,255,255,0.12)',
          padding: '6px 4px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              width: '100%', paddingBottom: '138%',
              position: 'relative', flexShrink: 0,
              background: i === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
              borderRadius: 2,
              border: i === 0 ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, padding: '3px' }}>
                <div style={{ width: '70%', height: 2, background: i === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)', borderRadius: 1, marginBottom: 2 }} />
                {[88, 72, 80, 65, 77].map((w, j) => (
                  <div key={j} style={{ width: `${w}%`, height: 1.5, background: 'rgba(255,255,255,0.2)', borderRadius: 1, marginBottom: 1.5 }} />
                ))}
              </div>
              <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 5, color: 'rgba(255,255,255,0.4)' }}>{i + 1}</div>
            </div>
          ))}
        </div>

        {/* Main panels */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: PDF */}
          <div style={{
            flex: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '6px 4px 6px 6px',
            background: 'rgba(0,0,0,0.3)',
            borderRight: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{
              width: '96%', height: '96%',
              background: '#f8fafc',
              borderRadius: 2,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 3, right: 4, fontSize: 5, color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>p. 2</div>
              <div style={{ padding: '9px 9px 5px' }}>
                <div style={{ width: '60%', height: 6, background: '#1e293b', borderRadius: 1, marginBottom: 6, opacity: 0.8 }} />
                {[92, 85, 90, 78, 88, 82, 94, 76, 87, 91, 74, 86].map((w, i) => (
                  <div key={i} style={{
                    width: `${w}%`, height: i % 5 === 4 ? 0 : 3,
                    marginBottom: i % 5 === 4 ? 6 : 2,
                    background: '#94a3b8', borderRadius: 1, opacity: 0.45,
                  }} />
                ))}
              </div>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 220 310" preserveAspectRatio="xMidYMid meet">
                <path d="M18 58 Q35 52 60 59 T110 55 T168 60" stroke="#2563eb" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.75"/>
                <path d="M18 68 Q45 62 80 69 T155 65" stroke="#2563eb" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.6"/>
                <line x1="18" y1="75" x2="105" y2="75" stroke="#2563eb" strokeWidth="1" opacity="0.5" strokeLinecap="round"/>
                <rect x="18" y="85" width="88" height="6" fill="rgba(37,99,235,0.18)" rx="1"/>
                <path d="M18 95 Q50 88 90 96 T170 92" stroke="#22c55e" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.7"/>
                <text x="2" y="72" fontSize="5" fill="#2563eb" opacity="0.9" fontFamily="system-ui">✓</text>
              </svg>
            </div>
          </div>

          {/* Right: Blank page */}
          <div style={{
            flex: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '6px 6px 6px 4px',
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: '96%', height: '96%',
              background: '#fafafa',
              borderRadius: 2,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.09) 1px, transparent 1px)',
                backgroundSize: '11px 11px',
              }} />
              <div style={{ position: 'absolute', top: 3, right: 4, fontSize: 5, color: '#94a3b8' }}>Blank</div>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 220 310" preserveAspectRatio="xMidYMid meet">
                <rect x="72" y="48" width="76" height="26" rx="3" fill="rgba(37,99,235,0.1)" stroke="#2563eb" strokeWidth="1.3"/>
                <text x="110" y="59" textAnchor="middle" fontSize="6.5" fontWeight="600" fill="#2563eb" fontFamily="system-ui">Main Concept</text>
                <text x="110" y="68" textAnchor="middle" fontSize="5" fill="#3b82f6" fontFamily="system-ui">Overview</text>
                <path d="M110 74 L50 110" stroke="#2563eb" strokeWidth="1" opacity="0.5"/>
                <path d="M110 74 L170 110" stroke="#2563eb" strokeWidth="1" opacity="0.5"/>
                <path d="M110 74 L110 108" stroke="#2563eb" strokeWidth="1" opacity="0.45"/>
                <rect x="18" y="110" width="64" height="18" rx="3" fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth="1"/>
                <text x="50" y="121" textAnchor="middle" fontSize="5.5" fill="#22c55e" fontFamily="system-ui">Sub-topic A</text>
                <rect x="138" y="110" width="64" height="18" rx="3" fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth="1"/>
                <text x="170" y="121" textAnchor="middle" fontSize="5.5" fill="#22c55e" fontFamily="system-ui">Sub-topic B</text>
                <rect x="80" y="108" width="60" height="16" rx="3" fill="rgba(239,68,68,0.07)" stroke="#ef4444" strokeWidth="0.8"/>
                <text x="110" y="118" textAnchor="middle" fontSize="5" fill="#ef4444" fontFamily="system-ui">Key Point</text>
                <text x="14" y="210" fontSize="6.5" fill="#334155" fontFamily="serif" opacity="0.8">f(x) = ax² + bx + c</text>
                <text x="14" y="222" fontSize="6" fill="#334155" fontFamily="serif" opacity="0.65">∫₀¹ f(x)dx = [F(x)]₀¹</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Right panel: Voice Notes */}
        <div style={{
          width: 136, flexShrink: 0,
          background: 'rgba(255,255,255,0.05)',
          borderLeft: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '5px 8px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ fontSize: 7.5, fontWeight: 700, color: '#ffffff', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Voice Notes</span>
          </div>
          <div style={{ flex: 1, padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { label: 'Chapter 3 — key concepts', time: '0:22' },
              { label: 'Note page 5 introduction', time: '0:34' },
              { label: 'Final review summary', time: '1:12' },
              { label: 'Problem set walkthrough', time: '0:45' },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '3px 5px',
                background: i === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                borderRadius: 3,
                border: `1px solid ${i === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
              }}>
                <div style={{ fontSize: 6, color: i === 0 ? '#ffffff' : 'rgba(255,255,255,0.45)', lineHeight: 1.4, marginBottom: 1.5, fontWeight: i === 0 ? 600 : 400 }}>
                  {item.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 0, height: 0, borderLeft: '3.5px solid #0f172a', borderTop: '2px solid transparent', borderBottom: '2px solid transparent', marginLeft: 1 }} />
                  </div>
                  <span style={{ fontSize: 5, color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace' }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{
            padding: '5px 8px',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
            </div>
            <div style={{ width: 70, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        height: 26, flexShrink: 0,
        background: 'rgba(255,255,255,0.04)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center',
        padding: '0 9px', gap: 7,
      }}>
        <div style={{ width: 44, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
          <div style={{ width: 28, height: 5, background: '#ffffff', borderRadius: 2 }} />
          <div style={{ width: 14, height: 14, borderRadius: 3, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 26, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />
        <div style={{ width: 20, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ── Tablet frame ──────────────────────────────────────────────────────────────

function TabletMockup() {
  return (
    <div style={{
      width: '90%', maxWidth: 960,
      margin: '0 auto',
      position: 'relative',
    }}>
      {/* White glow beneath */}
      <div style={{
        position: 'absolute',
        bottom: '-20px', left: '15%', right: '15%',
        height: 60,
        background: 'radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%)',
        filter: 'blur(16px)',
        pointerEvents: 'none',
      }} />

      {/* Device body */}
      <div style={{
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 16,
        padding: '10px 14px 14px',
        border: '1px solid rgba(255,255,255,0.2)',
        position: 'relative',
      }}>
        {/* Top bezel */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative' }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
          }} />
          <div style={{ position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ width: 2.5, height: 10, borderRadius: 1.5, background: 'rgba(255,255,255,0.2)' }} />
            <div style={{ width: 2.5, height: 10, borderRadius: 1.5, background: 'rgba(255,255,255,0.2)' }} />
          </div>
          <div style={{ position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)' }}>
            <div style={{ width: 2.5, height: 15, borderRadius: 1.5, background: 'rgba(255,255,255,0.2)' }} />
          </div>
        </div>

        {/* Screen */}
        <div style={{
          borderRadius: 6,
          overflow: 'hidden',
          aspectRatio: '16/9',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
          <AppScreen />
        </div>

        {/* Home bar */}
        <div style={{
          width: 80, height: 3, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
          margin: '10px auto 0',
        }} />
      </div>

      {/* Stylus */}
      <div style={{
        position: 'absolute',
        right: -12, top: '10%', bottom: '10%',
        width: 10, borderRadius: 5,
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.25)',
      }}>
        <div style={{
          position: 'absolute', bottom: -7,
          left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '8px solid rgba(255,255,255,0.3)',
        }} />
        <div style={{
          position: 'absolute', top: '30%', left: 0, right: 0, height: 18,
          background: 'rgba(255,255,255,0.08)',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          borderBottom: '1px solid rgba(255,255,255,0.2)',
        }} />
      </div>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({
  icon, title, subtitle, badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string | null;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 200,
      background: 'rgba(255,255,255,0.08)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 4,
      padding: '20px 18px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.2s, background 0.2s',
    }}
      onMouseOver={(e) => {
        Object.assign((e.currentTarget as HTMLDivElement).style, {
          borderColor: 'rgba(255,255,255,0.35)',
          background: 'rgba(255,255,255,0.13)',
        });
      }}
      onMouseOut={(e) => {
        Object.assign((e.currentTarget as HTMLDivElement).style, {
          borderColor: 'rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.08)',
        });
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 4,
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#ffffff', marginBottom: 14,
      }}>
        {icon}
      </div>

      {badge && (
        <span style={{
          display: 'inline-block',
          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
          padding: '2px 7px', borderRadius: 4, marginBottom: 8,
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444',
          textTransform: 'uppercase',
        }}>
          {badge}
        </span>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', margin: '0 0 8px', lineHeight: 1.3 }}>
        {title}
      </h3>

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>
        {subtitle}
      </p>

      {/* White accent line at bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
      }} />
    </div>
  );
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#ffffff', lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      color: '#ffffff',
      fontFamily: "'Geist', 'Inter', system-ui, -apple-system, sans-serif",
      overflowX: 'hidden',
    }}>

      {/* ══ Hero ══ */}
      <section style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* ── Header ── */}
        <header style={{
          position: 'relative', zIndex: 10,
          height: 60, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 36px',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 4, flexShrink: 0,
              background: '#ffffff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={16} style={{ color: '#0f172a' }} />
            </div>
            <span style={{
              fontSize: 16, fontWeight: 700,
              color: '#ffffff', letterSpacing: '-0.02em',
            }}>
              StudySpace
            </span>
          </div>

          <Link
            href="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 36, padding: '0 18px',
              borderRadius: 4,
              background: '#ffffff',
              border: 'none',
              color: '#0f172a',
              fontSize: 13.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              textDecoration: 'none',
              transition: 'background 0.15s',
              letterSpacing: '-0.01em',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.88)'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#ffffff'; }}
          >
            Get Started <ArrowRight size={14} />
          </Link>
        </header>

        {/* ── Hero content ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center',
          padding: '56px 24px 0',
        }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 4, marginBottom: 24,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffffff' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              For University Students
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(2.4rem, 6.5vw, 5rem)',
            fontWeight: 800,
            lineHeight: 1.07,
            letterSpacing: '-0.035em',
            color: '#ffffff',
            margin: '0 0 20px',
            maxWidth: 840,
          }}>
            Don&apos;t Just Read Your<br />
            Study — Interact With It
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: 'clamp(0.9rem, 1.5vw, 1.05rem)',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.7,
            maxWidth: 560,
            margin: '0 0 36px',
          }}>
            The complete workspace for serious students.
            Annotate PDFs, record voice notes, draw diagrams — all in one place.
          </p>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 64 }}>
            <Link
              href="/login"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                height: 46, padding: '0 28px',
                borderRadius: 4,
                background: '#ffffff',
                border: 'none',
                color: '#0f172a',
                fontSize: 15, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'none',
                letterSpacing: '-0.01em',
                transition: 'background 0.15s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.88)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#ffffff'; }}
            >
              Start for Free <ArrowRight size={15} />
            </Link>

            <button
              style={{
                height: 46, padding: '0 28px',
                borderRadius: 4,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.25)',
                color: 'rgba(255,255,255,0.75)',
                fontSize: 15, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseOver={(e) => {
                Object.assign(e.currentTarget.style, { borderColor: 'rgba(255,255,255,0.5)', color: '#ffffff' });
              }}
              onMouseOut={(e) => {
                Object.assign(e.currentTarget.style, { borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.75)' });
              }}
            >
              Watch Demo
            </button>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: 48, marginBottom: 64, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            <StatItem value="10k+" label="Students" />
            <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' }} />
            <StatItem value="500k+" label="Annotations" />
            <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' }} />
            <StatItem value="99.9%" label="Uptime" />
          </div>

          {/* Tablet mockup */}
          <TabletMockup />

          {/* Feature cards */}
          <div style={{
            width: '90%', maxWidth: 960,
            display: 'flex', gap: 12,
            margin: '48px auto 0',
            flexWrap: 'wrap',
          }}>
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>

          <div style={{ height: 64 }} />
        </div>
      </section>
    </div>
  );
}
