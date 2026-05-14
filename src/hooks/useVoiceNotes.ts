'use client';
import { useState, useCallback, useRef } from 'react';
import type { VoiceNote } from '@/types';

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

export function useVoiceNotes() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingContext, setRecordingContext] = useState<{
    documentId: string;
    pageNumber: number | string;
  } | null>(null);
  const recordingRef = useRef<RecordingState | null>(null);

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
      // Use the type the recorder actually used, not the requested candidate —
      // the browser may have adjusted it (e.g. added codec params or switched format).
      const recordedType = mediaRecorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: recordedType });
      const audioUrl = URL.createObjectURL(blob);

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
      if (note) URL.revokeObjectURL(note.audioUrl);
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: title || undefined } : n)));
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
