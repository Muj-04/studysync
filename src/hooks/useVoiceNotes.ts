'use client';
import { retainRecoveryAudio } from '@/lib/recoveryAudio';
import { useRecordingLifetime } from './useRecordingLifetime';
import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import type { VoiceNote } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { fetchVoiceNotes, saveVoiceNote, deleteVoiceNote, updateVoiceNoteTitle, getTotalVoiceStorageBytes, getProfile, deleteAllVoiceNotesForDocument } from '@/lib/supabase/db';
import { effectivePlanLimits, type Plan } from '@/lib/planLimits';

interface PersistedNote {
  id: string;
  documentId: string;
  pageNumber: number | string;
  audioDataUrl: string; // "data:audio/webm;base64,..."
  duration: number;
  timestamp: string;   // ISO date string
  title?: string;
}

interface RecordingState {
  mediaRecorder: MediaRecorder;
  stream: MediaStream;
  chunks: BlobPart[];
  documentId: string;
  pageNumber: number | string;
  startTime: number;
  intervalId: ReturnType<typeof setInterval>;
}

function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeType = header?.split(':')[1]?.split(';')[0] ?? 'audio/webm';
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mimeType });
}

function deserializeNotes(persisted: PersistedNote[]): VoiceNote[] {
  return persisted.map((p) => {
    const blob = dataUrlToBlob(p.audioDataUrl);
    return {
      id: p.id,
      documentId: p.documentId,
      pageNumber: p.pageNumber,
      audioBlob: blob,
      audioUrl: URL.createObjectURL(blob),
      duration: p.duration,
      timestamp: new Date(p.timestamp),
      title: p.title,
    };
  });
}

// Blob URLs belong to the mounted client store, never to a speculative render.
// Subscribe restores local notes before any asynchronous account lookup finishes.
function createVoiceNoteStore() {
  const initialSnapshot = { notes: [] as VoiceNote[], ready: false };
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const emit = () => { listeners.forEach((listener) => listener()); };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!snapshot.ready) {
        const persisted = storageGet<PersistedNote[]>(KEYS.VOICE_NOTES);
        let restored: VoiceNote[] = [];
        if (persisted?.length) {
          try { restored = deserializeNotes(persisted); } catch { /* corrupted */ }
        }
        snapshot = { notes: restored, ready: true };
        emit();
      }
      return () => { listeners.delete(listener); };
    },
    setNotes(update: VoiceNote[] | ((previous: VoiceNote[]) => VoiceNote[])) {
      const notes = typeof update === 'function' ? update(snapshot.notes) : update;
      if (notes !== snapshot.notes) {
        snapshot = { ...snapshot, notes };
        emit();
      }
    },
  };
}

export function useVoiceNotes(opts?: { onStorageLimitReached?: () => void }) {
  const onLimitRef = useRef(opts?.onStorageLimitReached);
  const [store] = useState(createVoiceNoteStore);
  const { notes, ready } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const setNotes = store.setNotes;
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingContext, setRecordingContext] = useState<{
    documentId: string;
    pageNumber: number | string;
  } | null>(null);
  const recordingRef = useRef<RecordingState | null>(null);
  const acquireStream = useRecordingLifetime(recordingRef);
  const userIdRef = useRef<string | null>(null);
  const pendingSaves = useRef(new Map<string, Promise<void>>());
  const retrySaves = useRef(new Map<string, () => Promise<void>>());
  const deletedNotes = useRef(new Set<string>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const retries = retrySaves.current;
    const retry = () => {
      for (const [id, save] of [...retries.entries()].slice(0, 20)) {
        retries.delete(id);
        retries.set(id, save);
        void save();
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('online', retry);
    return () => {
      mounted.current = false;
      retries.clear();
      if (typeof window !== 'undefined') window.removeEventListener('online', retry);
    };
  }, []);

  // Merge Supabase notes into the already-restored local store.
  useEffect(() => {
    let cancelled = false;
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      if (!user) { console.warn('[VoiceNotes] getUser returned no user — Supabase fetch skipped'); return; }
      userIdRef.current = user.id;
      console.log('[VoiceNotes] userId resolved:', user.id, '— fetching all voice notes from Supabase');
      return fetchVoiceNotes().then((remote) => {
        if (cancelled) return;
        console.log('[VoiceNotes] fetchVoiceNotes returned', remote.length, 'rows');
        remote.forEach((r, i) => {
          console.log(`[VoiceNotes]   [${i}] id:${r.id} doc:${r.documentId} page:${r.pageNumber} audioUrl:${r.audioUrl ? r.audioUrl.slice(0, 80) + '…' : 'NULL'}`);
        });
        setNotes((prev) => {
          const prevIds = new Set(prev.map((n) => n.id));
          const fromSupabase: VoiceNote[] = remote
            .filter((r) => !prevIds.has(r.id) && !deletedNotes.current.has(r.id))
            .map((r) => ({
              id: r.id,
              documentId: r.documentId,
              pageNumber: r.pageNumber,
              audioBlob: new Blob([], { type: 'audio/webm' }), // placeholder — no local blob
              audioUrl: r.audioUrl ?? '',
              duration: r.duration,
              timestamp: new Date(r.timestamp),
              title: r.title,
            }));
          console.log('[VoiceNotes] adding', fromSupabase.length, 'new notes from Supabase (', remote.length - fromSupabase.length, 'already in local state)');
          return fromSupabase.length > 0 ? [...prev, ...fromSupabase] : prev;
        });
      });
    }).catch((error: unknown) => {
      if (!cancelled) console.warn('[VoiceNotes] remote restore failed:', error);
    });
    return () => { cancelled = true; };
  }, [setNotes]);

  // Persist notes to localStorage whenever they change
  // Only serialize notes that have real blob data (size > 0)
  useEffect(() => {
    if (!ready) return;
    const withBlob = notes.filter((n) => n.audioBlob.size > 0);
    if (withBlob.length === 0 && notes.length > 0) {
      // All notes are from Supabase (no local blobs) — preserve existing localStorage
      return;
    }
    if (withBlob.length === 0) {
      storageSet(KEYS.VOICE_NOTES, []);
      return;
    }
    let cancelled = false;
    Promise.all(
      withBlob.map(async (n): Promise<PersistedNote | null> => {
        try {
          return {
            id: n.id,
            documentId: n.documentId,
            pageNumber: n.pageNumber,
            audioDataUrl: await blobToDataUrl(n.audioBlob),
            duration: n.duration,
            timestamp: n.timestamp.toISOString(),
            title: n.title,
          };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const valid = results.filter((r): r is PersistedNote => r !== null);
      if (!storageSet(KEYS.VOICE_NOTES, valid)) {
        console.warn('StudySync: voice notes could not be saved — storage quota exceeded');
      }
    });
    return () => { cancelled = true; };
  }, [notes, ready]);

  const startRecording = useCallback(async (documentId: string, pageNumber: number | string) => {
    console.log('[VoiceNotes] startRecording called — docId:', documentId, 'pageNumber:', pageNumber);
    if (recordingRef.current) return;

    let stream: MediaStream;
    try {
      const acquired = await acquireStream();
      if (!acquired) return;
      stream = acquired;
    } catch {
      alert('Microphone access is required to record voice notes.');
      return;
    }

    const mimeType = getSupportedMimeType();
    let mediaRecorder: MediaRecorder;
    try { mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); }
    catch (error) { stream.getTracks().forEach((track) => track.stop()); throw error; }
    const chunks: BlobPart[] = [];
    const startTime = Date.now();

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const duration = (Date.now() - startTime) / 1000;
      const recordedType = mediaRecorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: recordedType });
      const audioUrl = URL.createObjectURL(blob);

      console.log('[VoiceNotes] recording stopped — pageNumber:', pageNumber, 'blob size:', blob.size, 'bytes, mime:', blob.type, 'duration:', duration.toFixed(1) + 's');

      const note: VoiceNote = {
        syncStatus: 'pending',
        id: crypto.randomUUID(),
        documentId,
        pageNumber,
        audioBlob: blob,
        audioUrl,
        duration,
        timestamp: new Date(),
      };

      setNotes((prev) => [...prev, note]);

      // Upload to Supabase in background (with per-plan storage limit check)
      if (userIdRef.current) {
        const owner = userIdRef.current;
        void retainRecoveryAudio(owner, note).catch(() => { if (mounted.current) alert('Local audio backup failed. Export this recording before closing the tab.'); });
        const sync = (): Promise<void> => {
          if (!mounted.current) return Promise.resolve();
          const pending = pendingSaves.current.get(note.id);
          if (pending) return pending;
          const saving = (async () => {
            const [profile, usedBytes] = await Promise.all([getProfile(), getTotalVoiceStorageBytes()]);
            const isVip = profile?.isVip ?? false;
            const plan  = (profile?.plan ?? 'free') as Plan;
            const storageLimit = effectivePlanLimits(plan, isVip).voiceStorageBytes;
            if (usedBytes + blob.size > storageLimit) {
              onLimitRef.current?.();
              return;
            }
            console.log('[VoiceNotes] calling saveVoiceNote id:', note.id);
            if (!mounted.current) return;
            const url = await saveVoiceNote(note, owner);
            retrySaves.current.delete(note.id);
            if (mounted.current) setNotes(prev => prev.map(current => current.id === note.id ? { ...current, syncStatus: 'saved' } : current));
            console.log('[VoiceNotes] saveVoiceNote returned audioUrl:', url ? url.slice(0, 80) + '…' : null);
          })().catch((error: unknown) => {
            console.warn('[VoiceNotes] remote save failed; local recording retained:', error);
            if (mounted.current) {
              setNotes(prev => prev.map(current => current.id === note.id ? { ...current, syncStatus: 'failed' } : current));
              retrySaves.current.set(note.id, sync);
              alert('Could not save this recording. The audio is still available in this tab. Reconnect to retry.');
            }
          }).finally(() => { pendingSaves.current.delete(note.id); });
          pendingSaves.current.set(note.id, saving);
          return saving;
        };
        void sync();
      } else {
        console.warn('[VoiceNotes] userIdRef is null — saveVoiceNote NOT called');
      }
    };

    const intervalId = setInterval(() => {
      setRecordingDuration((Date.now() - startTime) / 1000);
    }, 100);

    recordingRef.current = {
      mediaRecorder,
      stream,
      chunks,
      documentId,
      pageNumber,
      startTime,
      intervalId,
    };

    mediaRecorder.start(100);
    setIsRecording(true);
    setRecordingDuration(0);
    setRecordingContext({ documentId, pageNumber });
  }, [acquireStream, setNotes]);

  const stopRecording = useCallback(() => {
    const rec = recordingRef.current;
    if (!rec) return;
    clearInterval(rec.intervalId);
    if (rec.mediaRecorder.state !== 'inactive') rec.mediaRecorder.stop();
    rec.stream.getTracks().forEach((t) => t.stop());
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    setRecordingContext(null);
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    const note = store.getSnapshot().notes.find((n) => n.id === id);
    if (!note) return;
    const owner = userIdRef.current;
    await pendingSaves.current.get(id);
    retrySaves.current.delete(id);
    if (!mounted.current) return;
    try {
      if (!owner) throw new Error('Sign in to delete this recording.');
      await deleteVoiceNote(note.id, note.documentId, owner);
      if (!mounted.current) return;
      deletedNotes.current.add(id);
      URL.revokeObjectURL(note.audioUrl);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.warn('[VoiceNotes] deletion failed; recording retained:', error);
      if (mounted.current) alert('Could not delete this recording. Please try again.');
    }
  }, [setNotes, store]);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: title || undefined } : n)));
    const owner = userIdRef.current;
    if (owner) {
      const note = store.getSnapshot().notes.find(item => item.id === id);
      if (note?.audioBlob.size) void retainRecoveryAudio(owner, { ...note, title: title || undefined }).catch(() => undefined);
      void updateVoiceNoteTitle(id, title || undefined, owner).catch((error: unknown) => {
        console.warn('[VoiceNotes] title remains local:', error);
        if (mounted.current && userIdRef.current === owner) alert('Could not save this recording title. Your local title is retained; please retry.');
      });
    }
  }, [setNotes, store]);

  const getNotesForPage = useCallback(
    (documentId: string, pageNumber: number | string): VoiceNote[] =>
      notes.filter((n) => n.documentId === documentId && n.pageNumber === pageNumber),
    [notes]
  );

  const deleteNotesForDocument = useCallback(async (docId: string) => {
    const owner = userIdRef.current;
    const local = store.getSnapshot().notes.filter(note => note.documentId === docId);
    await Promise.all(local.map(note => pendingSaves.current.get(note.id)));
    local.forEach(note => retrySaves.current.delete(note.id));
    if (!mounted.current) return;
    try {
      if (!owner) throw new Error('Sign in to delete recordings.');
      await deleteAllVoiceNotesForDocument(docId, owner);
      if (!mounted.current) return;
      local.forEach(note => { deletedNotes.current.add(note.id); URL.revokeObjectURL(note.audioUrl); });
      setNotes(prev => prev.filter(note => note.documentId !== docId));
    } catch (error) {
      console.warn('[VoiceNotes] deletion failed; recordings retained:', error);
      if (mounted.current) alert('Could not delete these recordings. Please try again.');
    }
  }, [setNotes, store]);

  // Called from syncDoc after canonical docId is resolved. Adds any remote notes
  // not already in local state (idempotent — duplicate IDs are skipped).
  const seedVoiceNotes = useCallback((remote: Array<{
    id: string; documentId: string; pageNumber: number | string;
    duration: number; title?: string; audioUrl?: string; timestamp: string;
  }>) => {
    setNotes((prev) => {
      const prevIds = new Set(prev.map((n) => n.id));
      const incoming: VoiceNote[] = remote
        .filter((r) => !prevIds.has(r.id) && !deletedNotes.current.has(r.id))
        .map((r) => ({
          id: r.id,
          documentId: r.documentId,
          pageNumber: r.pageNumber,
          audioBlob: new Blob([], { type: 'audio/webm' }),
          audioUrl: r.audioUrl ?? '',
          duration: r.duration,
          timestamp: new Date(r.timestamp),
          title: r.title,
        }));
      console.log('[VoiceNotes] seedVoiceNotes — incoming:', remote.length, 'new to add:', incoming.length);
      return incoming.length > 0 ? [...prev, ...incoming] : prev;
    });
  }, [setNotes]);

  return {
    notes,
    isRecording,
    recordingDuration,
    recordingContext,
    startRecording,
    stopRecording,
    deleteNote,
    deleteNotesForDocument,
    updateNoteTitle,
    getNotesForPage,
    seedVoiceNotes,
  };
}
