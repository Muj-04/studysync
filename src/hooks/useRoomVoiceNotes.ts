'use client';
import { retainRecoveryAudio } from '@/lib/recoveryAudio';
import { createRoomSnapshotGate } from '@/lib/roomSnapshot';
import { useRecordingLifetime } from './useRecordingLifetime';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceNote } from '@/types';
import { saveRoomVoiceNote, deleteRoomVoiceNote, updateRoomVoiceNoteTitle } from '@/lib/supabase/db';
import type { RoomVoiceNotePayload } from './useStudyRoom';
import { createClient } from '@/lib/supabase/client';


interface RecordingState {
  mediaRecorder: MediaRecorder;
  stream: MediaStream;
  chunks: BlobPart[];
  pageNumber: number | string;
  startTime: number;
  intervalId: ReturnType<typeof setInterval>;
}

function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus', 'audio/webm',
    'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function useRoomVoiceNotes(
  roomId: string,
  onNoteAdded?: (noteId: string) => void,
  onNoteDeleted?: (noteId: string) => void,
) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingContext, setRecordingContext] = useState<{
    documentId: string; pageNumber: number | string;
  } | null>(null);

  const lifetime = useRef({ active: false, generation: 0 });
  const retrySaves = useRef(new Map<string, () => Promise<void>>());
  useEffect(() => {
    const gate = snapshots.current;
    lifetime.current = { active: true, generation: lifetime.current.generation + 1 };
    unsavedNotes.current.clear();
    deletingNotes.current.clear();
    // A replacement room must never render the previous room's recordings.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes([]);
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
      lifetime.current.active = false;
      gate.invalidate();
      retries.clear();
      if (typeof window !== 'undefined') window.removeEventListener('online', retry);
    };
  }, [roomId]);
  const snapshots = useRef(createRoomSnapshotGate<VoiceNote>());
  const unsavedNotes = useRef(new Set<string>());
  const deletingNotes = useRef(new Set<string>());
  const pendingSaves = useRef(new Map<string, Promise<void>>());
  const recordingRef    = useRef<RecordingState | null>(null);
  const acquireStream = useRecordingLifetime(recordingRef, roomId);
  const onNoteAddedRef  = useRef(onNoteAdded);
  const onNoteDeletedRef = useRef(onNoteDeleted);

  useEffect(() => { onNoteAddedRef.current = onNoteAdded; }, [onNoteAdded]);
  useEffect(() => { onNoteDeletedRef.current = onNoteDeleted; }, [onNoteDeleted]);

  const seedNotes = useCallback((remote: Array<{
    id: string; pageNumber: number | string; duration: number;
    audioUrl?: string; timestamp: string; title?: string;
  }>) => {
    setNotes(
      remote
        .filter((r) => r.audioUrl)
        .map((r) => ({
          id: r.id,
          documentId: roomId,
          pageNumber: r.pageNumber,
          audioBlob: new Blob([], { type: 'audio/webm' }),
          audioUrl: r.audioUrl!,
          duration: r.duration,
          timestamp: new Date(r.timestamp),
          title: r.title,
        }))
    );
  }, [roomId]);

  const titleWrites = useRef(new Map<string, Promise<void>>());
  const titleLifetime = useRef({ active: false });
  useEffect(() => {
    const lifetime = { active: true };
    titleLifetime.current = lifetime;
    return () => { lifetime.active = false; };
  }, [roomId]);

  const beginReconcileNotes = useCallback((isCurrent: () => boolean = () => true) => {
    const protectedIds = () => [...unsavedNotes.current, ...pendingSaves.current.keys(), ...titleWrites.current.keys(), ...deletingNotes.current];
    const merge = snapshots.current.begin(protectedIds());
    const generation = lifetime.current.generation;
    return (remote: Parameters<typeof seedNotes>[0]) => {
      if (!isCurrent() || !lifetime.current.active || generation !== lifetime.current.generation) return;
      for (const note of remote) {
        if (note.audioUrl && !pendingSaves.current.has(note.id)) unsavedNotes.current.delete(note.id);
      }
      const incoming: VoiceNote[] = remote.filter(note => note.audioUrl).map(note => ({
        ...note, documentId: roomId, audioUrl: note.audioUrl!,
        audioBlob: new Blob([], { type: 'audio/webm' }), timestamp: new Date(note.timestamp),
      }));
      setNotes(local => isCurrent() ? merge(local, incoming, protectedIds(), (current, next) => ({ ...current, title: next.title })) : local);
    };
  }, [roomId]);

  const addIncomingNote = useCallback((payload: RoomVoiceNotePayload) => {
    snapshots.current.touch(payload.id);
    setNotes((prev) => {
      if (prev.some((n) => n.id === payload.id)) {
        return prev.map((note) => note.id === payload.id ? { ...note, title: payload.title } : note);
      }
      return [...prev, {
        id: payload.id,
        documentId: roomId,
        pageNumber: payload.pageNumber,
        audioBlob: new Blob([], { type: 'audio/webm' }),
        audioUrl: payload.audioUrl,
        duration: payload.duration,
        timestamp: new Date(payload.timestamp),
        title: payload.title,
      }];
    });
  }, [roomId]);

  const removeIncomingNote = useCallback((noteId: string) => {
    snapshots.current.touch(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const startRecording = useCallback(async (pageNumber: number | string) => {
    if (recordingRef.current) return;
    const generation = lifetime.current.generation;
    const isCurrent = () => lifetime.current.active && lifetime.current.generation === generation;
    const { data: { user } } = await createClient().auth.getUser();
    if (!isCurrent()) return;
    if (!user) { alert('Sign in to record voice notes.'); return; }
    const owner = user.id;

    let stream: MediaStream;
    try {
      const acquired = await acquireStream();
      if (!acquired) return;
      stream = acquired;
    } catch {
      alert('Microphone access is required to record voice notes.');
      return;
    }

    if (!isCurrent()) { stream.getTracks().forEach(track => track.stop()); return; }
    const mimeType = getSupportedMimeType();
    let mediaRecorder: MediaRecorder;
    try { mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); }
    catch (error) { stream.getTracks().forEach((track) => track.stop()); throw error; }
    const chunks: BlobPart[] = [];
    const startTime = Date.now();

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    mediaRecorder.onstop = () => {
      const duration = (Date.now() - startTime) / 1000;
      const recordedType = mediaRecorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: recordedType });

      const note: VoiceNote = {
        syncStatus: 'pending',
        id: crypto.randomUUID(),
        documentId: roomId,
        pageNumber,
        audioBlob: blob,
        audioUrl: URL.createObjectURL(blob),
        duration,
        timestamp: new Date(),
      };

      void retainRecoveryAudio(owner, note).catch(() => { if (isCurrent()) alert('Local audio backup failed. Export this recording before closing the tab.'); });
      unsavedNotes.current.add(note.id);
      snapshots.current.touch(note.id);
      setNotes((prev) => [...prev, note]);

      const sync = (): Promise<void> => {
        if (!isCurrent()) return Promise.resolve();
        const pending = pendingSaves.current.get(note.id);
        if (pending) return pending;
        const save = saveRoomVoiceNote(roomId, note, owner).then((remoteUrl) => {
          if (!remoteUrl) throw new Error('The recording was not saved.');
          retrySaves.current.delete(note.id);
          unsavedNotes.current.delete(note.id);
          snapshots.current.touch(note.id);
          if (isCurrent()) {
            setNotes(prev => prev.map(current => current.id === note.id ? { ...current, syncStatus: 'saved' } : current));
            onNoteAddedRef.current?.(note.id);
          }
        }).catch((error: unknown) => {
          console.warn('[VoiceNote] room recording save failed:', error);
          if (isCurrent()) {
            setNotes(prev => prev.map(current => current.id === note.id ? { ...current, syncStatus: 'failed' } : current));
            retrySaves.current.set(note.id, sync);
            alert('Could not save this recording. The audio is still available in this tab, but has not been shared. Reconnect to retry.');
          }
        }).finally(() => { pendingSaves.current.delete(note.id); });
        pendingSaves.current.set(note.id, save);
        return save;
      };
      void sync();
    };

    const intervalId = setInterval(() => {
      setRecordingDuration((Date.now() - startTime) / 1000);
    }, 100);

    recordingRef.current = { mediaRecorder, stream, chunks, pageNumber, startTime, intervalId };
    mediaRecorder.start(100);
    setIsRecording(true);
    setRecordingDuration(0);
    setRecordingContext({ documentId: roomId, pageNumber });
  }, [roomId, acquireStream]);

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
    deletingNotes.current.add(id);
    snapshots.current.touch(id);
    const generation = lifetime.current.generation;
    const isCurrent = () => lifetime.current.active && lifetime.current.generation === generation;
    // Finish an in-flight upload first so it cannot recreate a deleted note.
    await pendingSaves.current.get(id);
    retrySaves.current.delete(id);
    if (!isCurrent()) return;
    try {
      await deleteRoomVoiceNote(id, roomId);
      if (!isCurrent()) return;
      setNotes((prev) => {
        const note = prev.find((n) => n.id === id);
        if (note && note.audioBlob.size > 0) URL.revokeObjectURL(note.audioUrl);
        return prev.filter((n) => n.id !== id);
      });
      unsavedNotes.current.delete(id);
      snapshots.current.touch(id);
      onNoteDeletedRef.current?.(id);
    } catch (error) {
      console.warn('[VoiceNote] room recording deletion failed:', error);
      if (isCurrent()) alert('Could not delete this recording. Please try again.');
    } finally { deletingNotes.current.delete(id); }
  }, [roomId]);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    snapshots.current.touch(id);
    const lifetime = titleLifetime.current;
    const previous = titleWrites.current.get(id) ?? Promise.resolve();
    const ownerRequest = process.env.NEXT_PUBLIC_SERVER_RECORDING_RECOVERY === 'true'
      ? createClient().auth.getUser().then(({ data: { user } }) => user?.id ?? null).catch(() => null)
      : Promise.resolve(undefined);
    // Preserve edit order at the database as well as in the local view.
    const write = previous.then(async () => {
      if (!lifetime.active) return;
      const owner = await ownerRequest;
      if (!lifetime.active) return;
      if (owner === null) throw new Error('Sign in to rename recordings.');
      await updateRoomVoiceNoteTitle(id, title || undefined, owner);
      if (!lifetime.active) return;
      const local = notes.find(note => note.id === id);
      if (owner && local?.audioBlob.size) void retainRecoveryAudio(owner, { ...local, title: title || undefined }).catch(() => undefined);
      snapshots.current.touch(id);
      setNotes((prev) => prev.map((note) => note.id === id ? { ...note, title: title || undefined } : note));
    }).catch((error: unknown) => {
      console.warn('[VoiceNote] room title update failed:', error);
      if (lifetime.active) alert('Could not rename this recording. Please try again.');
    }).finally(() => {
      if (titleWrites.current.get(id) === write) titleWrites.current.delete(id);
    });
    titleWrites.current.set(id, write);
    return write;
  }, [notes]);

  const getNotesForPage = useCallback(
    (pageNumber: number | string) => notes.filter((n) => n.pageNumber === pageNumber),
    [notes]
  );

  return {
    notes, isRecording, recordingDuration, recordingContext,
    startRecording, stopRecording, deleteNote, updateNoteTitle,
    getNotesForPage, seedNotes, beginReconcileNotes, addIncomingNote, removeIncomingNote,
  };
}
