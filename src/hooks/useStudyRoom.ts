'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RoomVoiceNotePayload {
  id: string;
  pageNumber: number | string;
  duration: number;
  audioUrl: string;
  timestamp: string;
  title?: string;
}

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export function useStudyRoom(
  roomId: string,
  onIncomingDrawing: (pageNumber: number, data: string) => void,
  onReconnect?: () => void,
  onIncomingVoiceNote?: (payload: RoomVoiceNotePayload) => void,
  onIncomingVoiceNoteDelete?: (noteId: string) => void,
) {
  const [memberCount, setMemberCount] = useState(1);
  const channelRef             = useRef<RealtimeChannel | null>(null);
  const onDrawingRef           = useRef(onIncomingDrawing);
  const onReconnectRef         = useRef(onReconnect);
  const onVoiceNoteRef         = useRef(onIncomingVoiceNote);
  const onVoiceNoteDeleteRef   = useRef(onIncomingVoiceNoteDelete);
  const retryRef               = useRef(0);
  const timerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadRef                = useRef(false);
  const connectedOnceRef       = useRef(false);
  const generationRef          = useRef(0);

  useEffect(() => { onDrawingRef.current = onIncomingDrawing; });
  useEffect(() => { onReconnectRef.current = onReconnect; });
  useEffect(() => { onVoiceNoteRef.current = onIncomingVoiceNote; });
  useEffect(() => { onVoiceNoteDeleteRef.current = onIncomingVoiceNoteDelete; });

  useEffect(() => {
    deadRef.current = false;
    connectedOnceRef.current = false;
    retryRef.current = 0;
    generationRef.current = 0;

    function scheduleReconnect() {
      if (deadRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const delay = BACKOFF_MS[Math.min(retryRef.current, BACKOFF_MS.length - 1)];
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    }

    function connect() {
      if (deadRef.current) return;

      const generation = ++generationRef.current;

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      const channelName = `room:${roomId}`;
      console.log(`[StudyRoom] connecting — channel="${channelName}" gen=${generation}`);

      const channel = createClient().channel(channelName, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'drawing' }, ({ payload }: { payload: { pageNumber: number; data: string } }) => {
          if (generation !== generationRef.current) return;
          onDrawingRef.current(payload.pageNumber, payload.data);
        })
        .on('broadcast', { event: 'voice_note' }, ({ payload }: { payload: RoomVoiceNotePayload }) => {
          if (generation !== generationRef.current) return;
          onVoiceNoteRef.current?.(payload);
        })
        .on('broadcast', { event: 'voice_note_deleted' }, ({ payload }: { payload: { noteId: string } }) => {
          if (generation !== generationRef.current) return;
          onVoiceNoteDeleteRef.current?.(payload.noteId);
        })
        .on('presence', { event: 'sync' }, () => {
          if (generation !== generationRef.current) return;
          const count = Object.keys(channel.presenceState()).length;
          setMemberCount(count || 1);
        })
        .subscribe(async (status) => {
          if (deadRef.current || generation !== generationRef.current) return;

          console.log(`[StudyRoom] channel status="${status}" gen=${generation}`);

          if (status === 'SUBSCRIBED') {
            retryRef.current = 0;
            await channel.track({ ts: Date.now() });
            if (connectedOnceRef.current) {
              console.log('[StudyRoom] reconnected — calling onReconnect');
              onReconnectRef.current?.();
            }
            connectedOnceRef.current = true;
          } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            const delay = BACKOFF_MS[Math.min(retryRef.current, BACKOFF_MS.length - 1)];
            console.warn(`[StudyRoom] disconnected (${status}) — reconnecting in ${delay}ms`);
            scheduleReconnect();
          }
        });

      channelRef.current = channel;
    }

    connect();

    return () => {
      deadRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId]);

  const broadcastDrawing = useCallback((pageNumber: number, data: string) => {
    const ch = channelRef.current;
    if (!ch) { console.warn('[StudyRoom] broadcastDrawing — channel not ready'); return; }
    ch.send({ type: 'broadcast', event: 'drawing', payload: { pageNumber, data } })
      .catch((err) => console.error('[StudyRoom] broadcast drawing error:', err));
  }, []);

  const broadcastVoiceNote = useCallback((payload: RoomVoiceNotePayload) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'voice_note', payload })
      .catch((err) => console.error('[StudyRoom] broadcast voice_note error:', err));
  }, []);

  const broadcastVoiceNoteDelete = useCallback((noteId: string) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'voice_note_deleted', payload: { noteId } })
      .catch((err) => console.error('[StudyRoom] broadcast voice_note_deleted error:', err));
  }, []);

  return { broadcastDrawing, broadcastVoiceNote, broadcastVoiceNoteDelete, memberCount };
}
