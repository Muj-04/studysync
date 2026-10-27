'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent, Track, type Participant } from 'livekit-client';
import { createClient } from '@/lib/supabase/client';

export interface UseVoiceChatReturn {
  connected:   boolean;
  connecting:  boolean;
  muted:       boolean;
  speakingIds: Set<string>;
  voiceError:  string | null;
  join:        () => Promise<void>;
  leave:       () => Promise<void>;
  toggleMute:  () => void;
  disconnectImmediate: () => void;
}

export function useVoiceChat(roomId: string, userId: string, displayName: string): UseVoiceChatReturn {
  const [connected,   setConnected]   = useState(false);
  const [connecting,  setConnecting]  = useState(false);
  const [muted,       setMuted]       = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [voiceError,  setVoiceError]  = useState<string | null>(null);

  const lkRoom      = useRef<Room | null>(null);
  const generation = useRef(0);
  const joining = useRef(false);
  const mutedRef    = useRef(false);
  const pttRef      = useRef(false);   // push-to-talk active
  const audioEls    = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Invalidate pending async work before disconnecting; late callbacks must not
  // mutate a newer room or re-enable audio after leaving.
  const cancelConnection = useCallback(() => {
    generation.current++;
    joining.current = false;
    const room = lkRoom.current;
    lkRoom.current = null;
    audioEls.current.forEach((el) => el.remove());
    audioEls.current.clear();
    mutedRef.current = false;
    pttRef.current = false;
    setConnecting(false);
    setConnected(false);
    setMuted(false);
    setSpeakingIds(new Set());
    return room;
  }, []);

  const join = useCallback(async () => {
    if (lkRoom.current || joining.current || !userId) return;
    joining.current = true;
    const operation = ++generation.current;
    const current = () => generation.current === operation;
    let room: Room | null = null;
    setConnecting(true);
    setVoiceError(null);

    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!current()) return;
      if (!session) throw new Error('Not logged in');

      const res = await fetch('/api/livekit/token', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ roomId, identity: userId, name: displayName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Failed to get voice token');
      }
      const { token, url } = await res.json() as { token: string; url: string };

      if (!current()) return;
      room = new Room({ adaptiveStream: true, dynacast: true });
      lkRoom.current = room;

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (!current()) return;
        setSpeakingIds(new Set(speakers.map((s) => s.identity)));
      });

      // Auto-attach remote audio tracks
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (!current()) return;
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach() as HTMLAudioElement;
        el.style.display = 'none';
        document.body.appendChild(el);
        if (track.sid) audioEls.current.set(track.sid, el);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (!current()) return;
        if (track.sid) {
          const el = audioEls.current.get(track.sid);
          if (el) { el.remove(); audioEls.current.delete(track.sid); }
        }
        track.detach();
      });

      room.on(RoomEvent.Disconnected, () => {
        if (!current()) return;
        generation.current++;
        joining.current = false;
        setConnecting(false);
        setConnected(false);
        setMuted(false);
        setSpeakingIds(new Set());
        lkRoom.current = null;
        // Clean up all audio elements
        audioEls.current.forEach((el) => el.remove());
        audioEls.current.clear();
      });

      await room.connect(url, token);
      if (!current()) { await room.disconnect(); return; }
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!current()) { await room.disconnect(); return; }
      setConnected(true);
      setMuted(false);
    } catch (err) {
      if (!current()) { void room?.disconnect(); return; }
      const msg = err instanceof Error ? err.message : 'Could not join voice chat';
      setVoiceError(msg);
      void cancelConnection()?.disconnect();
    } finally {
      if (current()) { joining.current = false; setConnecting(false); }
    }
  }, [roomId, userId, displayName, cancelConnection]);

  const leave = useCallback(async () => {
    await cancelConnection()?.disconnect();
  }, [cancelConnection]);

  const toggleMute = useCallback(() => {
    if (!lkRoom.current || !connected) return;
    const next = !mutedRef.current;
    lkRoom.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [connected]);

  // Push-to-talk: Space unmutes while held (only when muted)
  useEffect(() => {
    if (!connected) return;

    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).tagName !== 'BODY') return;
      if (!mutedRef.current || pttRef.current) return;
      e.preventDefault();
      pttRef.current = true;
      lkRoom.current?.localParticipant.setMicrophoneEnabled(true);
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !pttRef.current) return;
      pttRef.current = false;
      if (mutedRef.current) lkRoom.current?.localParticipant.setMicrophoneEnabled(false);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
    };
  }, [connected]);

  // Cleanup also invalidates work when the room or authenticated user changes.
  useEffect(() => () => {
    void cancelConnection()?.disconnect();
  }, [roomId, userId, cancelConnection]);

  const disconnectImmediate = useCallback(() => {
    void cancelConnection()?.disconnect();
  }, [cancelConnection]);

  return { connected, connecting, muted, speakingIds, voiceError, join, leave, toggleMute, disconnectImmediate };
}
