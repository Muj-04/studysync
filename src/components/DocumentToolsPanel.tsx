'use client';

import { useRef, useState } from 'react';
import {
  ImagePlus, Trash2, FilePlus, Mic, Users, Eraser, X,
} from 'lucide-react';
import type { PDFPageImage } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Workspace TOOLS panel — renders inside the RightPanelTabs "Tools" tab.
 *
 * Previously this was the entire right-panel (aside, AI Assistant + Translate
 * + workspace tools all stacked). After the right-panel restructure, the AI
 * Assistant + Translate content moved to AIAssistantTabContent and this
 * component shrunk to JUST the workspace-tool sections:
 *
 *   - Insert Image (Add to current page / Add as new page, via picker modal)
 *   - Add Blank Page (white/dark background swatches)
 *   - Page Background swatches (when viewing a blank page)
 *   - Delete current blank page
 *   - Clear all drawings (with confirmation)
 *   - Study Room button
 *   - Voice Note recorder
 *   - Page Images list (with per-image delete)
 *
 * The outer aside chrome (header with close button etc.) is provided by
 * RightPanelTabs — this component renders a flex-column body that fills
 * the tab pane.
 *
 * This tab is documented as TRANSITIONAL: when the bottom floating pill
 * toolbar restyle lands, most of these sections will move into bottom-bar
 * buttons + modals and the Tools tab will be removed.
 */

const BG_THEMES: Array<{ theme: 'white' | 'dark'; label: string; bg: string; dotColor: string }> = [
  { theme: 'white', label: 'White', bg: '#ffffff',  dotColor: 'rgba(0,0,0,0.15)' },
  { theme: 'dark',  label: 'Dark',  bg: '#1e1e2e',  dotColor: 'rgba(255,255,255,0.18)' },
];

interface Props {
  hasDocument:        boolean;
  isBlankPage:        boolean;
  onInsertBlankPage:  (theme: 'white' | 'dark') => void;
  onInsertImage?:     (dataUrl: string) => void;
  onDeleteBlankPage?: () => void;
  currentBgTheme?:    'white' | 'dark';
  onChangeBgTheme?:   (theme: 'white' | 'dark') => void;
  onVoiceNote?:       () => void;
  isRecording?:       boolean;
  onCreateRoom?:       () => void;
  onClearAllDrawings?: () => void;
  onAddImageToPage?:   (dataUrl: string) => void;
  onAddImageAsNewPage?: (dataUrl: string) => void;
  docPageImages?: Record<number, PDFPageImage[]>;
  currentPdfPageForImages?: number | null;
  onDeletePageImage?: (pageNumber: number, imageId: string) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--text-3)',
      marginBottom: 6, paddingLeft: 2,
    }}>
      {children}
    </p>
  );
}

function BgSwatches({
  themes = BG_THEMES,
  active,
  disabled = false,
  onSelect,
}: {
  themes?: typeof BG_THEMES;
  active?: 'white' | 'dark';
  disabled?: boolean;
  onSelect: (theme: 'white' | 'dark') => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {themes.map(({ theme, label, bg, dotColor }) => (
        <button
          key={theme}
          onClick={() => !disabled && onSelect(theme)}
          disabled={disabled}
          style={{
            flex: 1, padding: '8px 10px',
            background: 'transparent',
            border: `1px solid ${active === theme ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.45 : 1,
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'inherit',
            transition: 'border-color 0.12s, background 0.12s',
          }}
          onMouseOver={(e) => { if (!disabled && active !== theme) e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
          onMouseOut={(e)  => { if (!disabled && active !== theme) e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 4,
            background: bg, border: `1px solid ${dotColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: active === theme ? 'var(--accent)' : 'var(--text-2)' }}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function DocumentToolsPanel({
  hasDocument, isBlankPage,
  onInsertBlankPage, onInsertImage, onDeleteBlankPage,
  currentBgTheme, onChangeBgTheme,
  onVoiceNote, isRecording = false,
  onCreateRoom,
  onClearAllDrawings,
  onAddImageToPage,
  onAddImageAsNewPage,
  docPageImages,
  currentPdfPageForImages,
  onDeletePageImage,
}: Props) {
  const { t } = useLanguage();
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);

  const [addImageData,     setAddImageData]     = useState<string | null>(null);
  const [removeImgOpen,    setRemoveImgOpen]    = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const translatedBgThemes: typeof BG_THEMES = [
    { ...BG_THEMES[0], label: t('room_bg_white') },
    { ...BG_THEMES[1], label: t('room_bg_dark') },
  ];

  return (
    <>
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* ── Add Image ── */}
        {(onAddImageToPage || onAddImageAsNewPage) && (
          <div>
            <SectionLabel>{t('dtp_image')}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => addImageInputRef.current?.click()}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 11px', borderRadius: 4,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  fontSize: 12.5, fontWeight: 500,
                  transition: 'background 0.13s, border-color 0.13s',
                }}
                onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                  background: 'var(--bg-hover)', borderColor: 'var(--border-strong)',
                })}
                onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                  background: 'transparent', borderColor: 'var(--border)',
                })}
              >
                <ImagePlus size={14} />
                {t('dtp_insert_image')}
              </button>
              {onDeletePageImage && docPageImages && Object.values(docPageImages).some((imgs) => imgs.length > 0) && (
                <button
                  onClick={() => setRemoveImgOpen(true)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 11px', borderRadius: 4,
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    fontSize: 12.5, fontWeight: 500,
                    transition: 'background 0.13s, border-color 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                    background: 'var(--bg-hover)', borderColor: 'var(--border-strong)',
                  })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                    background: 'transparent', borderColor: 'var(--border)',
                  })}
                >
                  <Trash2 size={14} />
                  Manage page images
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Add Blank Page ── */}
        <div>
          <SectionLabel>{t('dtp_add_blank')}</SectionLabel>
          <BgSwatches themes={translatedBgThemes} disabled={!hasDocument} onSelect={onInsertBlankPage} />
        </div>

        {/* Insert image (blank pages only — uses different file input/handler) */}
        <button
          onClick={isBlankPage && onInsertImage ? () => fileInputRef.current?.click() : undefined}
          disabled={!isBlankPage || !onInsertImage}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 11px', borderRadius: 4,
            background: 'transparent',
            border: `1px solid ${(!isBlankPage || !onInsertImage) ? 'var(--border-subtle)' : 'var(--border)'}`,
            color: (!isBlankPage || !onInsertImage) ? 'var(--text-3)' : 'var(--text-2)',
            cursor: (!isBlankPage || !onInsertImage) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
            opacity: (!isBlankPage || !onInsertImage) ? 0.45 : 1,
            transition: 'background 0.13s, border-color 0.13s',
            fontSize: 12.5, fontWeight: 500,
          }}
          onMouseOver={(e) => {
            if (!isBlankPage || !onInsertImage) return;
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
          onMouseOut={(e) => {
            if (!isBlankPage || !onInsertImage) return;
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <ImagePlus size={14} />
          Image onto blank page
        </button>

        {/* Page Background (blank pages only) */}
        {isBlankPage && onChangeBgTheme && (
          <div>
            <SectionLabel>{t('dtp_page_bg')}</SectionLabel>
            <BgSwatches themes={translatedBgThemes} active={currentBgTheme ?? 'white'} onSelect={onChangeBgTheme} />
          </div>
        )}

        {/* Delete blank page */}
        {isBlankPage && onDeleteBlankPage && (
          <button
            onClick={onDeleteBlankPage}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 11px', borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--red)',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              fontSize: 12.5, fontWeight: 500,
              transition: 'background 0.13s, border-color 0.13s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              background: 'var(--red-muted)', borderColor: 'var(--red)',
            })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
              background: 'transparent', borderColor: 'var(--border)',
            })}
          >
            <Trash2 size={14} />
            {t('dtp_delete_page')}
          </button>
        )}

        {/* Clear all drawings */}
        {onClearAllDrawings && !isBlankPage && (
          <button
            onClick={() => setConfirmClearOpen(true)}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 11px', borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--red)',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              fontSize: 12.5, fontWeight: 500,
              transition: 'background 0.13s, border-color 0.13s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              background: 'var(--red-muted)', borderColor: 'var(--red)',
            })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
              background: 'transparent', borderColor: 'var(--border)',
            })}
          >
            <Eraser size={14} />
            {t('dtp_clear_drawings')}
          </button>
        )}

        {/* Study Room */}
        {onCreateRoom && (
          <button
            onClick={onCreateRoom}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 4,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.13s, border-color 0.13s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              borderColor: 'var(--accent)', background: 'var(--bg-hover)',
            })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
              borderColor: 'var(--border)', background: 'var(--bg-elevated)',
            })}
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--bg-active)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Users size={14} style={{ color: 'var(--text-2)' }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)' }}>
                {t('dtp_create_room')}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
                {t('dtp_collaborate')}
              </div>
            </div>
          </button>
        )}

        {/* Voice Note */}
        <button
          onClick={onVoiceNote}
          disabled={!onVoiceNote}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderRadius: 4,
            background: isRecording ? 'var(--red-muted)' : 'var(--bg-elevated)',
            border: `1px solid ${isRecording ? 'var(--red)' : 'var(--border)'}`,
            color: 'var(--text-1)',
            cursor: onVoiceNote ? 'pointer' : 'not-allowed',
            opacity: onVoiceNote ? 1 : 0.5,
            fontFamily: 'inherit',
            transition: 'background 0.13s, border-color 0.13s',
          }}
          onMouseOver={(e) => {
            if (onVoiceNote && !isRecording) Object.assign(e.currentTarget.style, {
              borderColor: 'var(--border-strong)', background: 'var(--bg-hover)',
            });
          }}
          onMouseOut={(e) => {
            if (onVoiceNote && !isRecording) Object.assign(e.currentTarget.style, {
              borderColor: 'var(--border)', background: 'var(--bg-elevated)',
            });
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: isRecording ? 'rgba(220,38,38,0.18)' : 'var(--bg-active)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mic size={14} style={{ color: isRecording ? 'var(--red)' : 'var(--text-2)' }} />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: isRecording ? 'var(--red)' : 'var(--text-1)' }}>
              {isRecording ? t('dtp_recording') : t('dtp_record_voice')}
            </span>
          </div>
          {isRecording && (
            <span className="rec-dot" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--red)', flexShrink: 0,
            }} />
          )}
        </button>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !onInsertImage) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') onInsertImage(reader.result);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
          }}
        />
        <input
          ref={addImageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') setAddImageData(reader.result);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* ── Add Image picker modal ── */}
      {addImageData && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setAddImageData(null)}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 4, overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImagePlus size={15} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Add Image</span>
              </div>
              <button
                onClick={() => setAddImageData(null)}
                style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: '1px solid transparent',
                  background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{
              padding: '16px 20px 12px',
              display: 'flex', justifyContent: 'center',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={addImageData}
                alt="Selected"
                style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 4, objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 4px', lineHeight: 1.5 }}>
                Where would you like to add this image?
              </p>

              {onAddImageToPage && (
                <button
                  onClick={() => { onAddImageToPage(addImageData); setAddImageData(null); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 0.13s, background 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', background: 'var(--bg-hover)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' })}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ImagePlus size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>Add to current page</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>Overlay on the current PDF page as an annotation</p>
                  </div>
                </button>
              )}

              {onAddImageAsNewPage && (
                <button
                  onClick={() => { onAddImageAsNewPage(addImageData); setAddImageData(null); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 0.13s, background 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', background: 'var(--bg-hover)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' })}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FilePlus size={15} style={{ color: 'var(--text-2)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>Add as new page</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>Create a new blank page with this image on it</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Clear All Drawings confirmation ── */}
      {confirmClearOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setConfirmClearOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 4, overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eraser size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Clear All Drawings</span>
              </div>
              <button
                onClick={() => setConfirmClearOpen(false)}
                style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.6, margin: '0 0 8px' }}>
                Are you sure? This will permanently remove all drawings from this document.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                Voice notes and text notes will not be affected.
              </p>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmClearOpen(false)}
                style={{ height: 32, padding: '0 16px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onClearAllDrawings?.(); setConfirmClearOpen(false); }}
                style={{ height: 32, padding: '0 16px', borderRadius: 4, background: 'var(--red)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Eraser size={13} />
                Clear All Drawings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Image modal ── */}
      {removeImgOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setRemoveImgOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImagePlus size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Page Images</span>
              </div>
              <button onClick={() => setRemoveImgOpen(false)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docPageImages && Object.entries(docPageImages)
                .flatMap(([pageStr, imgs]) => imgs.map((img) => ({ ...img, pageNumber: Number(pageStr) })))
                .filter((img) => img.src)
                .length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: 16 }}>
                  No images on this document.
                </p>
              ) : (
                docPageImages && Object.entries(docPageImages)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .flatMap(([pageStr, imgs]) => imgs.map((img) => ({ img, pageNumber: Number(pageStr) })))
                  .map(({ img, pageNumber }) => {
                    const isCurrentPage = pageNumber === currentPdfPageForImages;
                    return (
                      <div
                        key={`${pageNumber}:${img.id}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 12px', borderRadius: 4,
                          background: isCurrentPage ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                          border: `1px solid ${isCurrentPage ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--border)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                            Page {pageNumber}
                            {isCurrentPage && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-2)', fontWeight: 500 }}>Current</span>}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                            {Math.round(img.width * 100)}% × {Math.round(img.height * 100)}%
                          </p>
                        </div>
                        <button
                          onClick={() => { onDeletePageImage?.(pageNumber, img.id); }}
                          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--red)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s' }}
                          onMouseOver={(e) => { e.currentTarget.style.background = 'var(--red-muted)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                          title="Delete image"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
