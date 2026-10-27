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

interface TimerState {
  phase: PomodoroPhase;
  timeLeft: number;
  running: boolean;
  sessions: number;
}

const INITIAL_STATE: TimerState = { phase: 'work', timeLeft: WORK_SECS, running: false, sessions: 0 };

export function usePomodoro() {
  const [state, setState] = useState(INITIAL_STATE);
  // Timer callbacks and consecutive button clicks share the latest committed action.
  const stateRef = useRef(INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const update = useCallback((next: TimerState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);
  const advance = useCallback(() => {
    clearTimer();
    const current = stateRef.current;
    const phase = current.phase === 'work' ? 'break' : 'work';
    update({ phase, timeLeft: phase === 'work' ? WORK_SECS : BREAK_SECS,
      running: false, sessions: current.sessions + (current.phase === 'work' ? 1 : 0) });
  }, [clearTimer, update]);

  const start = useCallback(() => {
    if (intervalRef.current !== null) return;
    update({ ...stateRef.current, running: true });
    intervalRef.current = setInterval(() => {
      if (stateRef.current.timeLeft <= 1) {
        advance();
        playBell();
      } else {
        update({ ...stateRef.current, timeLeft: stateRef.current.timeLeft - 1 });
      }
    }, 1000);
  }, [advance, update]);

  const pause = useCallback(() => {
    clearTimer();
    update({ ...stateRef.current, running: false });
  }, [clearTimer, update]);

  const reset = useCallback(() => {
    clearTimer();
    update({ ...stateRef.current, running: false,
      timeLeft: stateRef.current.phase === 'work' ? WORK_SECS : BREAK_SECS });
  }, [clearTimer, update]);

  useEffect(() => clearTimer, [clearTimer]);

  const total = state.phase === 'work' ? WORK_SECS : BREAK_SECS;
  return { ...state, total, start, pause, reset, skipPhase: advance };
}
