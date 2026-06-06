'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceNote } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { fetchVoiceNotes, saveVoiceNote, deleteVoiceNote, updateVoiceNoteTitle } from '@/lib/supabase/db';

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

export function useVoiceNotes() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingContext, setRecordingContext] = useState<{
    documentId: string;
    pageNumber: number | string;
  } | null>(null);
  const recordingRef = useRef<RecordingState | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Load from localStorage, then merge Supabase notes on top
  useEffect(() => {
    const persisted = storageGet<PersistedNote[]>(KEYS.VOICE_NOTES);
    if (persisted?.length) {
      try { setNotes(deserializeNotes(persisted)); } catch { /* corrupted */ }
    }

    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) { console.warn('[VoiceNotes] getUser returned no user — Supabase fetch skipped'); return; }
      userIdRef.current = user.id;
      console.log('[VoiceNotes] userId resolved:', user.id, '— fetching all voice notes from Supabase');
      fetchVoiceNotes().then((remote) => {
        console.log('[VoiceNotes] fetchVoiceNotes returned', remote.length, 'rows');
        remote.forEach((r, i) => {
          console.log(`[VoiceNotes]   [${i}] id:${r.id} doc:${r.documentId} page:${r.pageNumber} audioUrl:${r.audioUrl ? r.audioUrl.slice(0, 80) + '…' : 'NULL'}`);
        });
        setNotes((prev) => {
          const prevIds = new Set(prev.map((n) => n.id));
          const fromSupabase: VoiceNote[] = remote
            .filter((r) => !prevIds.has(r.id))
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
    });
  }, []);

  // Persist notes to localStorage whenever they change
  // Only serialize notes that have real blob data (size > 0)
  useEffect(() => {
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
  }, [notes]);

  const startRecording = useCallback(async (documentId: string, pageNumber: number | string) => {
    if (recordingRef.current) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone access is required to record voice notes.');
      return;
    }

    const mimeType = getSupportedMimeType();
    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
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

      console.log('[VoiceNotes] recording stopped — blob size:', blob.size, 'bytes, mime:', blob.type, 'duration:', duration.toFixed(1) + 's');

      const note: VoiceNote = {
        id: crypto.randomUUID(),
        documentId,
        pageNumber,
        audioBlob: blob,
        audioUrl,
        duration,
        timestamp: new Date(),
      };

      setNotes((prev) => [...prev, note]);

      // Upload to Supabase in background
      if (userIdRef.current) {
        console.log('[VoiceNotes] userIdRef set — calling saveVoiceNote id:', note.id);
        saveVoiceNote(note).then((url) => {
          console.log('[VoiceNotes] saveVoiceNote returned audioUrl:', url ? url.slice(0, 80) + '…' : null);
        });
      } else {
        console.warn('[VoiceNotes] userIdRef is null — saveVoiceNote NOT called (user not logged in?)');
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
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recordingRef.current;
    if (!rec) return;
    clearInterval(rec.intervalId);
    rec.mediaRecorder.stop();
    rec.stream.getTracks().forEach((t) => t.stop());
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    setRecordingContext(null);
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const note = prev.find((n) => n.id === id);
      if (note) {
        URL.revokeObjectURL(note.audioUrl);
        if (userIdRef.current) {
          deleteVoiceNote(note.id, note.documentId);
        }
      }
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: title || undefined } : n)));
    if (userIdRef.current) {
      updateVoiceNoteTitle(id, title || undefined);
    }
  }, []);

  const getNotesForPage = useCallback(
    (documentId: string, pageNumber: number | string): VoiceNote[] =>
      notes.filter((n) => n.documentId === documentId && n.pageNumber === pageNumber),
    [notes]
  );

  return {
    notes,
    isRecording,
    recordingDuration,
    recordingContext,
    startRecording,
    stopRecording,
    deleteNote,
    updateNoteTitle,
    getNotesForPage,
  };
}
