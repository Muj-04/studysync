'use client';
import { useEffect, useState, useRef } from 'react';
import type { VoiceNote } from '@/types';
import { listDocumentWrites, subscribeDocumentOutbox, type DocumentWrite } from '@/lib/documentOutbox';
import { listLocalDocumentRecovery, recoveryDocumentIds, subscribeDocumentRecovery, type LocalDocumentRecovery } from '@/lib/documentRecovery';
import { createDocumentRecoveryCopy } from '@/lib/documentRecoveryCopy';
import { getStoredPdf } from '@/lib/pdfStore';
import { readRecoveryAudio } from '@/lib/recoveryAudio';
import { assertDocumentOwner } from '@/lib/supabase/documentProtocol';
import { retryPendingDocumentWrites } from '@/lib/supabase/documentCollections';

export function DocumentRecoveryPanel({ ownerId, voiceNotes, openCopy }: { ownerId: string | null; voiceNotes: VoiceNote[]; openCopy: (file: File, id: string) => Promise<unknown> }) {
  const [listing, setListing] = useState<{ ownerId: string | null; items: { id: string; local?: LocalDocumentRecovery; pending: DocumentWrite[] }[] }>({ ownerId: null, items: [] });
  const items = listing.ownerId === ownerId ? listing.items : [];
  const lifetime = useRef({ ownerId, active: false });
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const token = { ownerId, active: true }; lifetime.current = token;
    const refresh = () => { if (active) { try { setListing({ ownerId, items: recoveryDocumentIds(ownerId).map(id => ({ id, local: listLocalDocumentRecovery(ownerId).find(entry => entry.documentId === id), pending: listDocumentWrites(ownerId).filter(entry => entry.documentId === id) })) }); } catch (error) { setMessage(String(error)); } } };
    const retry = () => { void retryPendingDocumentWrites(ownerId).catch(error => { if (active) setMessage(String(error)); }); refresh(); };
    refresh(); retry();
    const unsubscribe = subscribeDocumentOutbox(refresh);
    const unsubscribeLocal = subscribeDocumentRecovery(refresh);
    window.addEventListener('online', retry);
    window.addEventListener('storage', refresh);
    return () => { active = false; token.active = false; unsubscribe(); unsubscribeLocal(); window.removeEventListener('online', retry); window.removeEventListener('storage', refresh); };
  }, [ownerId]);
  if (!ownerId) return null;
  const owner = ownerId;
  const action = async (run: () => Promise<string>) => {
    const token = lifetime.current;
    setBusy(true); setMessage('');
    try { const result = await run(); if (token.active && token.ownerId === owner) setMessage(result); }
    catch (error) { if (token.active && token.ownerId === owner) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (token.active && token.ownerId === owner) setBusy(false); }
  };
  const exportDocument = async (id: string) => {
    await assertDocumentOwner(owner);
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const writes = listDocumentWrites(owner).filter(entry => entry.documentId === id);
    const local = listLocalDocumentRecovery(owner).find(entry => entry.documentId === id);
    zip.file('recovery.json', JSON.stringify({ format: 'studysync-recovery-v1', ownerId: owner, originalDocumentId: id, local, writes }, null, 2));
    const source = await getStoredPdf(id, owner);
    if (source) zip.file('source.pdf', await source.blob.arrayBuffer());
    const audio = new Map((await readRecoveryAudio(owner, id)).map(entry => [entry.id, entry.blob]));
    for (const note of voiceNotes) if (note.documentId === id && note.audioBlob?.size) audio.set(note.id, note.audioBlob);
    for (const [audioId, blob] of audio) zip.file(`audio/${audioId}.${blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm'}`, await blob.arrayBuffer());
    zip.file('README.txt', `Local recovery archive. Original document ID must not be reused. ${source ? 'Source PDF included.' : 'Source PDF unavailable on this device.'} ${audio.size} local audio files included. Remote recordings are not automatically downloaded. Import the source as a new recovery document; recovery.json preserves annotation content.`);
    const blob = await zip.generateAsync({ type: 'blob' });
    await assertDocumentOwner(owner);
    if (!lifetime.current.active || lifetime.current.ownerId !== owner) throw new Error('Recovery view changed; export cancelled.');
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `studysync-recovery-${id}.zip`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Archive exported. The retained original remains available.';
  };
  return <section aria-label="Document recovery" style={{ padding: '6px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
    <button type="button" onClick={() => setOpen(!open)}>Local recovery ({items.length})</button>
    {open && <div>
      <p>Unsynced or conflicting work is kept for this account. Deletion wins for the original document. Export includes available source and local audio; a recovery copy uses a new document and your document quota.</p>
      <button disabled={busy} onClick={() => void action(async () => { await retryPendingDocumentWrites(owner); return 'Retry finished. Conflicts remain available for export or recovery.'; })}>Retry pending edits</button>
      {items.map(({ id, local, pending }) => {
        return <div key={id} style={{ marginTop: 12 }}><strong>{local?.name ?? 'Recovered document'}</strong> <span>{pending.length} retained writes</span>
          {pending.find(entry => entry.error)?.error && <p>{pending.find(entry => entry.error)?.error}</p>}
          <button disabled={busy} onClick={() => void action(() => exportDocument(id))}>Export recovery ZIP</button>{' '}
          <button disabled={busy} onClick={() => void action(async () => {
            const copy = await createDocumentRecoveryCopy(owner, id, local?.name ?? 'Recovered document');
            await assertDocumentOwner(owner);
            if (!lifetime.current.active || lifetime.current.ownerId !== owner) throw new Error('Recovery view changed. Your copy remains in your account.');
            if (copy.file) await openCopy(copy.file, copy.id);
            return copy.incomplete ? 'Recovery document created with pending edits. Retry or export; the original remains retained.' : copy.file ? 'Recovery copy opened. Original recovery data remains retained.' : 'Recovery copy created. Reattach its matching source PDF to view it; original recovery data remains retained.';
          })}>Create recovery copy</button>
        </div>;
      })}
      {items.length === 0 && <p>No retained local recovery data.</p>}
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
