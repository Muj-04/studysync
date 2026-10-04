'use client';
import { useCallback, useEffect, useRef, type RefObject } from 'react';

type RecordingResources = {
  mediaRecorder: MediaRecorder;
  stream: MediaStream;
  intervalId: ReturnType<typeof setInterval>;
};

/** Own microphone acquisition and cleanup for both personal and room recordings. */
export function useRecordingLifetime(ref: RefObject<RecordingResources | null>, scope = '') {
  const generation = useRef(0);
  const mounted = useRef(false);
  const requesting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      requesting.current = false;
      const recording = ref.current;
      if (!recording) return;
      clearInterval(recording.intervalId);
      recording.mediaRecorder.onstop = null;
      recording.mediaRecorder.ondataavailable = null;
      if (recording.mediaRecorder.state !== 'inactive') recording.mediaRecorder.stop();
      recording.stream.getTracks().forEach((track) => track.stop());
      ref.current = null;
    };
  }, [ref, scope]);

  return useCallback(async () => {
    if (!mounted.current || requesting.current || ref.current) return null;
    requesting.current = true;
    const requestGeneration = generation.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || requestGeneration !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      return stream;
    } catch (error) {
      if (!mounted.current || requestGeneration !== generation.current) return null;
      throw error;
    } finally {
      if (requestGeneration === generation.current) requesting.current = false;
    }
  }, [ref]);
}
