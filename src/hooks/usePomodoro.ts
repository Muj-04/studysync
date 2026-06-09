'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export type PomodoroPhase = 'work' | 'break';

const WORK_SECS  = 25 * 60;
const BREAK_SECS =  5 * 60;

function playBell() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch { /* silent if no audio context */ }
}

export function usePomodoro() {
  const [phase, setPhase]       = useState<PomodoroPhase>('work');
  const [timeLeft, setTimeLeft] = useState(WORK_SECS);
  const [running, setRunning]   = useState(false);
  const [sessions, setSessions] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          playBell();
          setRunning(false);
          setPhase((p) => {
            if (p === 'work') { setSessions((s) => s + 1); setTimeLeft(BREAK_SECS); }
            else              { setTimeLeft(WORK_SECS); }
            return p === 'work' ? 'break' : 'work';
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const pause = useCallback(() => stop(), [stop]);

  const reset = useCallback(() => {
    stop();
    setTimeLeft(phase === 'work' ? WORK_SECS : BREAK_SECS);
  }, [stop, phase]);

  const skipPhase = useCallback(() => {
    stop();
    setPhase((p) => {
      const next = p === 'work' ? 'break' : 'work';
      setTimeLeft(next === 'work' ? WORK_SECS : BREAK_SECS);
      if (p === 'work') setSessions((s) => s + 1);
      return next;
    });
  }, [stop]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const total = phase === 'work' ? WORK_SECS : BREAK_SECS;

  return { phase, timeLeft, running, sessions, total, start, pause, reset, skipPhase };
}
