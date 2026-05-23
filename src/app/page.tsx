'use client';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

const HERO_IMG =
  'https://i.pinimg.com/originals/d7/b9/0c/d7b90cc80898e8823455a127945719af.jpg';

// ── Feature card data ─────────────────────────────────────────────────────────

const FEATURES = [
  {
    emoji: '🎤',
    title: 'Voice Notes',
    subtitle: 'Record Your Thoughts on\nEvery Page',
    badge: null,
  },
  {
    emoji: '✏️',
    title: 'Drawing & Whiteboards',
    subtitle: 'Precise Tools on PDF & Empty\nPages for Explanation',
    badge: null,
  },
  {
    emoji: '🔄',
    title: 'PPTX Conversion',
    subtitle: 'Easily Convert Your\nPowerPoint Lectures',
    badge: null,
  },
  {
    emoji: '⭐',
    title: 'AI Features (Phase 2):',
    subtitle: 'Quiz generation, Summarization',
    badge: 'Coming Soon',
  },
] as const;

// ── Detailed app screen mockup ────────────────────────────────────────────────

function AppScreen() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#111827',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        height: 33, flexShrink: 0,
        background: '#161f30',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center',
        padding: '0 10px', gap: 7,
      }}>
        {/* Logo mark */}
        <div style={{
          width: 16, height: 16, borderRadius: 4,
          background: 'linear-gradient(135deg,#6b78f0,#5965d9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <div style={{ width: 8, height: 8, border: '1.5px solid #fff', borderRadius: 1.5 }} />
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>StudySpace</span>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 1, marginLeft: 6 }}>
          {['Recent Submissions', 'Manage TEST Mercury PDF', 'Blank Page'].map((tab, i) => (
            <div key={i} style={{
              padding: '3px 8px', borderRadius: '4px 4px 0 0', fontSize: 7.5,
              background: i === 1 ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: i === 1 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
              border: i === 1 ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
              borderBottom: 'none',
              fontWeight: i === 1 ? 600 : 400,
            }}>
              {tab}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {/* Action buttons */}
        <div style={{ width: 48, height: 16, background: 'rgba(255,255,255,0.07)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.10)' }} />
        <div style={{ width: 30, height: 16, background: '#5965d9', borderRadius: 4, opacity: 0.9 }} />
        <div style={{ width: 20, height: 16, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }} />
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar — thumbnails */}
        <div style={{
          width: 64, flexShrink: 0,
          background: '#0d1420',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '6px 5px',
          display: 'flex', flexDirection: 'column', gap: 5,
          overflowY: 'hidden',
        }}>
          {[2, 1, 3, 4, 5].map((pg, i) => (
            <div key={i} style={{
              width: '100%', paddingBottom: '141%',
              position: 'relative', flexShrink: 0,
              background: i === 0 ? 'rgba(89,101,217,0.28)' : 'rgba(255,255,255,0.07)',
              borderRadius: 3,
              border: i === 0 ? '1.5px solid rgba(89,101,217,0.7)' : '1px solid rgba(255,255,255,0.07)',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, padding: '3px 3px' }}>
                <div style={{ width: '70%', height: 2.5, background: 'rgba(255,255,255,0.45)', borderRadius: 1, marginBottom: 2 }} />
                {[88, 72, 80, 65, 77, 90, 60].map((w, j) => (
                  <div key={j} style={{ width: `${w}%`, height: 1.5, background: 'rgba(255,255,255,0.22)', borderRadius: 0.5, marginBottom: 1.5 }} />
                ))}
              </div>
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                fontSize: 5.5, color: 'rgba(255,255,255,0.4)',
                lineHeight: 1,
              }}>
                {pg}
              </div>
            </div>
          ))}
        </div>

        {/* Main two-panel area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── Left panel: PDF with green handwriting ── */}
          <div style={{
            flex: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '7px 5px 7px 7px',
            background: '#111827',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              width: '96%', height: '96%',
              background: '#f7f4ee',
              borderRadius: 3,
              boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Page top label */}
              <div style={{ position: 'absolute', top: 3, right: 5, fontSize: 5.5, color: '#888' }}>Page 2</div>

              {/* Printed text content */}
              <div style={{ padding: '10px 10px 6px' }}>
                <div style={{ width: '65%', height: 7, background: '#2a2240', borderRadius: 1.5, marginBottom: 7, opacity: 0.85 }} />
                {/* Dense text lines */}
                {[92, 85, 90, 78, 88, 82, 94, 76, 87, 91, 74, 86].map((w, i) => (
                  <div key={i} style={{
                    width: `${w}%`, height: i % 5 === 4 ? 0 : 3.5,
                    marginBottom: i % 5 === 4 ? 7 : 2.5,
                    background: '#7a7a8a', borderRadius: 1, opacity: 0.55,
                  }} />
                ))}
                <div style={{ width: '55%', height: 5.5, background: '#2a2240', borderRadius: 1, marginBottom: 6, opacity: 0.7 }} />
                {[88, 79, 91, 83, 70, 85].map((w, i) => (
                  <div key={i} style={{ width: `${w}%`, height: 3.5, marginBottom: 2.5, background: '#7a7a8a', borderRadius: 1, opacity: 0.55 }} />
                ))}
              </div>

              {/* Green handwriting overlay */}
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                viewBox="0 0 220 310"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Annotation squiggles matching handwritten notes */}
                <path d="M18 58 Q35 52 60 59 T110 55 T168 60" stroke="#2e7d32" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.88"/>
                <path d="M18 68 Q45 62 80 69 T155 65" stroke="#2e7d32" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.78"/>
                <path d="M18 95 Q50 88 90 96 T170 92" stroke="#2e7d32" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.82"/>
                <path d="M18 105 Q60 98 100 106 T175 102" stroke="#2e7d32" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.7"/>
                {/* Underlines */}
                <line x1="18" y1="75" x2="105" y2="75" stroke="#2e7d32" strokeWidth="1" opacity="0.6" strokeLinecap="round"/>
                {/* Circle around a section */}
                <ellipse cx="110" cy="115" rx="42" ry="14" stroke="#2e7d32" strokeWidth="1.2" fill="none" opacity="0.55" strokeDasharray="2,1.5"/>
                {/* Arrow annotation */}
                <path d="M145 130 Q150 145 140 158" stroke="#2e7d32" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M136 155 L140 158 L143 154" stroke="#2e7d32" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
                {/* Margin note */}
                <text x="2" y="72" fontSize="5" fill="#2e7d32" opacity="0.8" fontFamily="system-ui">✓</text>
                <text x="2" y="100" fontSize="5" fill="#2e7d32" opacity="0.7" fontFamily="system-ui">!</text>
                {/* Highlight rectangle */}
                <rect x="18" y="85" width="88" height="6" fill="rgba(255,200,0,0.32)" rx="1"/>
                {/* More squiggly text at bottom */}
                <path d="M18 170 Q40 164 70 171 T130 167" stroke="#2e7d32" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.75"/>
                <path d="M18 180 Q55 174 95 181 T180 177" stroke="#2e7d32" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.68"/>
              </svg>
            </div>
          </div>

          {/* ── Right panel: blank page with mind-map diagram ── */}
          <div style={{
            flex: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '7px 7px 7px 5px',
            background: '#111827',
          }}>
            <div style={{
              width: '96%', height: '96%',
              background: '#fafaf8',
              borderRadius: 3,
              boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Dot grid */}
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.13) 1px, transparent 1px)',
                backgroundSize: '12px 12px',
              }} />
              {/* Page label */}
              <div style={{ position: 'absolute', top: 3, right: 5, fontSize: 5.5, color: '#888' }}>Blank Page</div>

              {/* Hand-drawn mind map / diagram */}
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                viewBox="0 0 220 310"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Central topic box */}
                <rect x="72" y="48" width="76" height="28" rx="5" fill="rgba(89,101,217,0.12)" stroke="#5965d9" strokeWidth="1.5"/>
                <text x="110" y="60" textAnchor="middle" fontSize="7" fontWeight="600" fill="#3344bb" fontFamily="system-ui">Main Concept</text>
                <text x="110" y="70" textAnchor="middle" fontSize="5.5" fill="#5560cc" fontFamily="system-ui">Overview</text>

                {/* Branch lines */}
                <path d="M110 76 L50 115" stroke="#5965d9" strokeWidth="1.2" opacity="0.6"/>
                <path d="M110 76 L170 115" stroke="#5965d9" strokeWidth="1.2" opacity="0.6"/>
                <path d="M110 76 L110 110" stroke="#5965d9" strokeWidth="1.2" opacity="0.5"/>
                <path d="M50 135 L30 170" stroke="#666" strokeWidth="1" opacity="0.5"/>
                <path d="M50 135 L70 170" stroke="#666" strokeWidth="1" opacity="0.5"/>
                <path d="M170 135 L150 170" stroke="#666" strokeWidth="1" opacity="0.5"/>
                <path d="M170 135 L190 170" stroke="#666" strokeWidth="1" opacity="0.5"/>

                {/* Sub-nodes */}
                <rect x="18" y="115" width="64" height="20" rx="4" fill="rgba(46,125,50,0.1)" stroke="#2e7d32" strokeWidth="1.2"/>
                <text x="50" y="127" textAnchor="middle" fontSize="6" fill="#2e7d32" fontFamily="system-ui">Sub-topic A</text>

                <rect x="138" y="115" width="64" height="20" rx="4" fill="rgba(46,125,50,0.1)" stroke="#2e7d32" strokeWidth="1.2"/>
                <text x="170" y="127" textAnchor="middle" fontSize="6" fill="#2e7d32" fontFamily="system-ui">Sub-topic B</text>

                <rect x="80" y="110" width="60" height="18" rx="4" fill="rgba(229,72,77,0.08)" stroke="#e5484d" strokeWidth="1"/>
                <text x="110" y="121" textAnchor="middle" fontSize="5.5" fill="#c0392b" fontFamily="system-ui">Key Point</text>

                {/* Leaf nodes */}
                <rect x="12" y="168" width="40" height="16" rx="3" fill="rgba(0,0,0,0.04)" stroke="#999" strokeWidth="1"/>
                <text x="32" y="179" textAnchor="middle" fontSize="5" fill="#666" fontFamily="system-ui">Detail 1</text>

                <rect x="56" y="168" width="40" height="16" rx="3" fill="rgba(0,0,0,0.04)" stroke="#999" strokeWidth="1"/>
                <text x="76" y="179" textAnchor="middle" fontSize="5" fill="#666" fontFamily="system-ui">Detail 2</text>

                <rect x="140" y="168" width="40" height="16" rx="3" fill="rgba(0,0,0,0.04)" stroke="#999" strokeWidth="1"/>
                <text x="160" y="179" textAnchor="middle" fontSize="5" fill="#666" fontFamily="system-ui">Detail 3</text>

                <rect x="184" y="168" width="38" height="16" rx="3" fill="rgba(0,0,0,0.04)" stroke="#999" strokeWidth="1"/>
                <text x="203" y="179" textAnchor="middle" fontSize="5" fill="#666" fontFamily="system-ui">Detail 4</text>

                {/* Math formula area */}
                <text x="14" y="218" fontSize="7" fill="#333" fontFamily="serif" opacity="0.8">f(x) = ax² + bx + c</text>
                <text x="14" y="232" fontSize="6.5" fill="#333" fontFamily="serif" opacity="0.7">∫₀¹ f(x)dx = [F(x)]₀¹</text>

                {/* Freehand arrow */}
                <path d="M110 135 Q114 155 115 200 Q116 218 120 230" stroke="#5965d9" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeDasharray="3,2" opacity="0.5"/>
              </svg>
            </div>
          </div>
        </div>

        {/* ── Right panel: Voice Notes ── */}
        <div style={{
          width: 148, flexShrink: 0,
          background: '#151f30',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '6px 9px 5px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e5484d' }} />
            <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Voice Notes</span>
          </div>

          {/* Recording list */}
          <div style={{ flex: 1, overflowY: 'hidden', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { label: 'Most Recent: Name 2 - Page 3', time: '0:22:0:15' },
              { label: 'Note 1 - Page 5:0:22:0:15', time: '0:34' },
              { label: 'Most Popular: Name Note 1 - Page 3', time: '1:12' },
              { label: 'Note Project: Come Note - Page 5', time: '0:22' },
              { label: 'Note Project: Come Note - Page 6', time: '0:33' },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '4px 6px',
                background: i === 0 ? 'rgba(89,101,217,0.14)' : 'rgba(255,255,255,0.04)',
                borderRadius: 4,
                borderLeft: `2px solid ${i === 0 ? '#5965d9' : 'rgba(255,255,255,0.1)'}`,
              }}>
                <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, marginBottom: 1.5, fontWeight: i === 0 ? 600 : 400 }}>
                  {item.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#5965d9', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 0, height: 0, borderLeft: '4px solid #fff', borderTop: '2.5px solid transparent', borderBottom: '2.5px solid transparent', marginLeft: 1 }} />
                  </div>
                  <span style={{ fontSize: 5.5, color: 'rgba(255,255,255,0.35)' }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Record button */}
          <div style={{
            padding: '6px 9px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: '#e5484d',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
            </div>
            <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 3 }} />
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        height: 28, flexShrink: 0,
        background: '#161f30',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center',
        padding: '0 10px', gap: 8,
      }}>
        <div style={{ width: 50, height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 10 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ width: 32, height: 6, background: '#5965d9', borderRadius: 10, opacity: 0.85 }} />
          <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 30, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 10 }} />
        <div style={{ width: 24, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 10 }} />
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
      {/* Warm ambient glow below tablet */}
      <div style={{
        position: 'absolute',
        bottom: '-30px', left: '10%', right: '10%',
        height: 80,
        background: 'radial-gradient(ellipse, rgba(89,101,217,0.22) 0%, transparent 70%)',
        filter: 'blur(12px)',
        pointerEvents: 'none',
      }} />

      {/* Tablet body */}
      <div style={{
        background: 'linear-gradient(175deg, #2e2e3e 0%, #1c1c28 40%, #131320 100%)',
        borderRadius: 24,
        padding: '13px 16px 18px',
        boxShadow: [
          '0 40px 100px rgba(0,0,0,0.9)',
          '0 0 0 1px rgba(255,255,255,0.08)',
          'inset 0 1px 0 rgba(255,255,255,0.10)',
          'inset 0 -1px 0 rgba(0,0,0,0.5)',
        ].join(', '),
        position: 'relative',
      }}>
        {/* Top bezel details */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, position: 'relative' }}>
          {/* Camera */}
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#222230',
            boxShadow: '0 0 0 1.5px rgba(255,255,255,0.06), inset 0 0 2px rgba(0,0,0,0.8)',
          }} />
          {/* Volume buttons (left side) - decorative */}
          <div style={{ position: 'absolute', left: -16, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ width: 3, height: 12, borderRadius: 1.5, background: '#252535' }} />
            <div style={{ width: 3, height: 12, borderRadius: 1.5, background: '#252535' }} />
          </div>
          {/* Power button (right side) */}
          <div style={{ position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)' }}>
            <div style={{ width: 3, height: 18, borderRadius: 1.5, background: '#252535' }} />
          </div>
        </div>

        {/* Screen */}
        <div style={{
          borderRadius: 10,
          overflow: 'hidden',
          aspectRatio: '16/9',
          boxShadow: [
            'inset 0 0 0 1px rgba(0,0,0,0.6)',
            '0 2px 20px rgba(0,0,0,0.4)',
          ].join(', '),
        }}>
          <AppScreen />
        </div>

        {/* Home indicator */}
        <div style={{
          width: 90, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.16)',
          margin: '12px auto 0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }} />
      </div>

      {/* Stylus / Apple Pencil */}
      <div style={{
        position: 'absolute',
        right: -14, top: '12%', bottom: '12%',
        width: 12, borderRadius: 6,
        background: 'linear-gradient(180deg, #e8e8ec 0%, #c8c8cc 40%, #a8a8ac 100%)',
        boxShadow: '2px 2px 8px rgba(0,0,0,0.5), -1px 0 0 rgba(255,255,255,0.3)',
      }}>
        {/* Pencil tip */}
        <div style={{
          position: 'absolute', bottom: -8,
          left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '10px solid #c8c8cc',
        }} />
        {/* Pencil flat button area */}
        <div style={{
          position: 'absolute', top: '30%', left: 0, right: 0, height: 24,
          background: 'rgba(255,255,255,0.15)',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          borderBottom: '1px solid rgba(255,255,255,0.2)',
        }} />
      </div>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({
  emoji, title, subtitle, badge,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  badge: string | null;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: 'rgba(18, 24, 38, 0.88)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 18,
      padding: '22px 20px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top row: title + emoji */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          {badge && (
            <span style={{
              display: 'inline-block',
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em',
              padding: '2px 8px', borderRadius: 20, marginBottom: 6,
              background: 'rgba(255,140,50,0.22)',
              border: '1px solid rgba(255,140,50,0.4)',
              color: '#ffaa55',
            }}>
              {badge}
            </span>
          )}
          <h3 style={{
            fontSize: 15, fontWeight: 700,
            color: '#ffffff', margin: 0,
            lineHeight: 1.25,
          }}>
            {title}
          </h3>
        </div>
        <span style={{ fontSize: 28, flexShrink: 0, lineHeight: 1, marginTop: 2 }}>{emoji}</span>
      </div>

      <p style={{
        fontSize: 12.5, color: 'rgba(255,255,255,0.52)',
        margin: 0, lineHeight: 1.55,
        whiteSpace: 'pre-line',
      }}>
        {subtitle}
      </p>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      color: '#fff',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      overflowX: 'hidden',
    }}>

      {/* ══ Hero section — full viewport, brick wall background ══ */}
      <section style={{
        minHeight: '100vh',
        backgroundImage: `url(${HERO_IMG})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 35%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Dark overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(6,8,18,0.88) 0%, rgba(6,8,18,0.72) 30%, rgba(6,8,18,0.68) 55%, rgba(6,8,18,0.88) 85%, rgba(6,8,18,0.96) 100%)',
          pointerEvents: 'none',
        }} />

        {/* ── Header ── */}
        <header style={{
          position: 'relative', zIndex: 10,
          height: 64, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 36px',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #b8721a 0%, #d4891f 40%, #e8a030 100%)',
              border: '1px solid rgba(255,200,100,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 12px rgba(200,120,20,0.4)',
            }}>
              <BookOpen size={18} style={{ color: '#fff' }} />
            </div>
            <span style={{
              fontSize: 17, fontWeight: 700,
              color: '#ffffff', letterSpacing: '-0.02em',
            }}>
              StudySpace
            </span>
          </div>

          {/* Get Started — with warm amber glow matching the brick wall light */}
          <Link
            href="/login"
            style={{
              display: 'inline-flex', alignItems: 'center',
              height: 42, padding: '0 26px',
              borderRadius: 10,
              background: 'rgba(20,16,10,0.75)',
              border: '1px solid rgba(220,160,60,0.55)',
              color: '#fff',
              fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              textDecoration: 'none',
              boxShadow: [
                '0 0 24px rgba(230,150,40,0.35)',
                '0 0 60px rgba(200,120,20,0.18)',
                'inset 0 1px 0 rgba(255,200,80,0.12)',
              ].join(', '),
              transition: 'box-shadow 0.2s, background 0.2s',
              letterSpacing: '-0.01em',
            }}
          >
            Get Started
          </Link>
        </header>

        {/* ── Hero text ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center',
          padding: '40px 24px 0',
        }}>
          {/* Headline — two lines, massive */}
          <h1 style={{
            fontSize: 'clamp(2.6rem, 6.8vw, 5.2rem)',
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: '-0.035em',
            color: '#ffffff',
            margin: '0 0 22px',
            maxWidth: 900,
            textShadow: '0 2px 40px rgba(0,0,0,0.6)',
          }}>
            Don&apos;t Just Read Your<br />
            Study.. Interact With It
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: 'clamp(0.9rem, 1.6vw, 1.05rem)',
            color: 'rgba(255,255,255,0.62)',
            lineHeight: 1.65,
            maxWidth: 640,
            margin: '0 0 32px',
          }}>
            The Complete Workspace for University Students.
            Upload PDFs, Record Voice Notes, and Draw on Your Lectures in One Place.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 52 }}>
            <Link
              href="/login"
              style={{
                display: 'inline-flex', alignItems: 'center',
                height: 50, padding: '0 32px',
                borderRadius: 9999,
                background: 'rgba(255,255,255,0.10)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1.5px solid rgba(255,255,255,0.40)',
                color: '#ffffff',
                fontSize: 15, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'none',
                letterSpacing: '-0.01em',
              }}
            >
              Start for Free
            </Link>

            <button
              style={{
                height: 50, padding: '0 32px',
                borderRadius: 9999,
                background: 'transparent',
                border: '1.5px solid rgba(255,255,255,0.28)',
                color: 'rgba(255,255,255,0.75)',
                fontSize: 15, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '-0.01em',
              }}
            >
              Watch a Video Demo 🎯
            </button>
          </div>

          {/* ── Tablet mockup ── */}
          <TabletMockup />

          {/* ── Feature cards ── */}
          <div style={{
            width: '90%', maxWidth: 960,
            display: 'flex', gap: 14,
            margin: '32px auto 0',
            flexWrap: 'wrap',
          }}>
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>

          {/* Bottom padding */}
          <div style={{ height: 48 }} />
        </div>
      </section>
    </div>
  );
}
