import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { createCommunityPost } from '@/lib/supabase/db';

export default function ShareToCommunityModal({ docId, docName, pageTextNotes, onClose }: {
  docId: string | null;
  docName: string | null;
  pageTextNotes: Record<string, import('@/types').TextNote[]>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const postingRef = useRef(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onClose, 1200);
    return () => clearTimeout(timer);
  }, [done, onClose]);

  const addTag = (tagStr: string) => {
    const trimmed = tagStr.trim().replace(/,/g, '');
    if (!trimmed || tags.includes(trimmed) || tags.length >= 5) return;
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
  };

  const handlePost = async () => {
    if (!title.trim() || postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError(null);
    const pages: import('@/lib/supabase/db').CommunityPage[] = [];
    if (docId) {
      const prefix = `${docId}:`;
      for (const [key, notes] of Object.entries(pageTextNotes)) {
        if (!key.startsWith(prefix)) continue;
        if (!notes.length) continue;
        pages.push({
          pageKey: key.slice(prefix.length),
          textNotes: notes.map((n) => ({ content: n.content, x: n.x, y: n.y })),
          canvasData: null,
        });
      }
    }
    try {
      const postId = await createCommunityPost({ documentId: docId, title: title.trim(), description: description.trim(), pages, tags });
      if (!postId) throw new Error('Post was not saved');
      setDone(true);
    } catch {
      setError('Could not share your notes. Please try again.');
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-float)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--bg-float-border)',
          boxShadow: 'var(--shadow-float)',
          borderRadius: 4, padding: '28px', width: 420,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Posted to Community!</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{t('ws_share_title')}</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            {docName && (
              <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-3)' }}>
                {t('ws_share_from')} <strong style={{ color: 'var(--text-2)' }}>{docName}</strong>
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{t('ws_share_title_label')}</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('ws_share_title_placeholder')}
                  style={{
                    width: '100%', height: 36, padding: '0 10px', boxSizing: 'border-box',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 4, fontSize: 13, color: 'var(--text-1)',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{t('ws_share_desc_label')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('ws_share_desc_placeholder')}
                  rows={3}
                  style={{
                    width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 4, fontSize: 13, color: 'var(--text-1)',
                    outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{t('ws_share_tags_label')}</label>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
                    {tags.map((t) => (
                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 500 }}>
                        {t}
                        <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, fontSize: 12 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
                    placeholder={t('ws_share_tags_placeholder')} disabled={tags.length >= 5}
                    style={{ flex: 1, height: 32, padding: '0 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12.5, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }} />
                  <button onClick={() => addTag(tagInput)} disabled={!tagInput.trim() || tags.length >= 5} style={{ height: 32, padding: '0 10px', borderRadius: 4, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t('common_add')}</button>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                {t('ws_share_notes_hint')}
              </p>

              {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{error}</p>}

              <button
                onClick={handlePost}
                disabled={!title.trim() || posting}
                style={{
                  height: 40, borderRadius: 4,
                  background: title.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: title.trim() ? '#fff' : 'var(--text-3)',
                  border: 'none', fontSize: 13.5, fontWeight: 600,
                  cursor: title.trim() ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'background 0.12s, color 0.12s',
                }}
              >
                {posting ? t('ws_share_posting') : t('ws_share_btn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
