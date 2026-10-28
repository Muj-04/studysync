'use client';
import { useRecordingLifetime } from './useRecordingLifetime';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceNote } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { saveRoomVoiceNote, deleteRoomVoiceNote, updateRoomVoiceNoteTitle } from '@/lib/supabase/db';
import type { RoomVoiceNotePayload } from './useStudyRoom';


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

  const recordingRef    = useRef<RecordingState | null>(null);
  const acquireStream = useRecordingLifetime(recordingRef, roomId);
  const userIdRef       = useRef<string | null>(null);
  const onNoteAddedRef  = useRef(onNoteAdded);
  const onNoteDeletedRef = useRef(onNoteDeleted);

  useEffect(() => { onNoteAddedRef.current = onNoteAdded; }, [onNoteAdded]);
  useEffect(() => { onNoteDeletedRef.current = onNoteDeleted; }, [onNoteDeleted]);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      userIdRef.current = user?.id ?? null;
    });
  }, []);

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

  const addIncomingNote = useCallback((payload: RoomVoiceNotePayload) => {
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
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const startRecording = useCallback(async (pageNumber: number | string) => {
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

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    mediaRecorder.onstop = () => {
      const duration = (Date.now() - startTime) / 1000;
      const recordedType = mediaRecorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: recordedType });

      const note: VoiceNote = {
        id: crypto.randomUUID(),
        documentId: roomId,
        pageNumber,
        audioBlob: blob,
        audioUrl: URL.createObjectURL(blob),
        duration,
        timestamp: new Date(),
      };

      setNotes((prev) => [...prev, note]);

      if (userIdRef.current) {
        saveRoomVoiceNote(roomId, note).then((remoteUrl) => {
          if (remoteUrl) {
            console.log('[VoiceNote] broadcasting voice_note_added event:', { noteId: note.id, pageNumber: note.pageNumber });
            onNoteAddedRef.current?.(note.id);
          } else {
            console.warn('[VoiceNote] saveRoomVoiceNote returned null — not broadcasting');
          }
        });
      }
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

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const note = prev.find((n) => n.id === id);
      if (note && note.audioBlob.size > 0) URL.revokeObjectURL(note.audioUrl);
      return prev.filter((n) => n.id !== id);
    });
    deleteRoomVoiceNote(id, roomId);
    onNoteDeletedRef.current?.(id);
  }, [roomId]);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    const lifetime = titleLifetime.current;
    const previous = titleWrites.current.get(id) ?? Promise.resolve();
    // Preserve edit order at the database as well as in the local view.
    const write = previous.then(async () => {
      if (!lifetime.active) return;
      await updateRoomVoiceNoteTitle(id, title || undefined);
      if (!lifetime.active) return;
      setNotes((prev) => prev.map((note) => note.id === id ? { ...note, title: title || undefined } : note));
    }).catch((error: unknown) => {
      console.warn('[VoiceNote] room title update failed:', error);
      if (lifetime.active) alert('Could not rename this recording. Please try again.');
    }).finally(() => {
      if (titleWrites.current.get(id) === write) titleWrites.current.delete(id);
    });
    titleWrites.current.set(id, write);
    return write;
  }, []);

  const getNotesForPage = useCallback(
    (pageNumber: number | string) => notes.filter((n) => n.pageNumber === pageNumber),
    [notes]
  );

  return {
    notes, isRecording, recordingDuration, recordingContext,
    startRecording, stopRecording, deleteNote, updateNoteTitle,
    getNotesForPage, seedNotes, addIncomingNote, removeIncomingNote,
  };
}
