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

export interface RoomBlankPagePayload {
  id: string;
  insertAfterPage: number;
  bgTheme: 'white' | 'dark';
  createdAt: number;
}

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export function useStudyRoom(
  roomId: string,
  onIncomingDrawing: (pageNumber: number, data: string) => void,
  onReconnect?: () => void,
  onIncomingVoiceNoteAdded?: (noteId: string) => void,
  onIncomingVoiceNoteDelete?: (noteId: string) => void,
  onIncomingBlankPage?: (page: RoomBlankPagePayload) => void,
  myDisplayName?: string,
  onIncomingBlankDrawing?: (pageId: string, data: string) => void,
) {
  const [memberCount, setMemberCount] = useState(1);
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const channelRef           = useRef<RealtimeChannel | null>(null);
  const onDrawingRef         = useRef(onIncomingDrawing);
  const onReconnectRef       = useRef(onReconnect);
  const onVoiceNoteAddedRef  = useRef(onIncomingVoiceNoteAdded);
  const onVoiceNoteDeleteRef = useRef(onIncomingVoiceNoteDelete);
  const onBlankPageRef       = useRef(onIncomingBlankPage);
  const onBlankDrawingRef    = useRef(onIncomingBlankDrawing);
  const myDisplayNameRef     = useRef(myDisplayName);
  const retryRef             = useRef(0);
  const timerRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadRef              = useRef(false);
  const connectedOnceRef     = useRef(false);
  const generationRef        = useRef(0);

  useEffect(() => { onDrawingRef.current = onIncomingDrawing; });
  useEffect(() => { onReconnectRef.current = onReconnect; });
  useEffect(() => { onVoiceNoteAddedRef.current = onIncomingVoiceNoteAdded; });
  useEffect(() => { onVoiceNoteDeleteRef.current = onIncomingVoiceNoteDelete; });
  useEffect(() => { onBlankPageRef.current = onIncomingBlankPage; });
  useEffect(() => { onBlankDrawingRef.current = onIncomingBlankDrawing; });
  useEffect(() => { myDisplayNameRef.current = myDisplayName; });

  // Re-track presence when the display name becomes available (loads async after connect)
  useEffect(() => {
    if (!myDisplayName) return;
    const ch = channelRef.current;
    if (!ch) return;
    ch.track({ ts: Date.now(), name: myDisplayName }).catch(() => {});
  }, [myDisplayName]);

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

      // No presence.key override — let Supabase assign a unique key per client
      const channel = createClient().channel(channelName, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'drawing' }, ({ payload }: { payload: { pageNumber: number; data: string } }) => {
          if (generation !== generationRef.current) return;
          onDrawingRef.current(payload.pageNumber, payload.data);
        })
        .on('broadcast', { event: 'blank_drawing' }, ({ payload }: { payload: { pageId: string; data: string } }) => {
          if (generation !== generationRef.current) return;
          onBlankDrawingRef.current?.(payload.pageId, payload.data);
        })
        .on('broadcast', { event: 'voice_note_added' }, ({ payload }: { payload: { noteId: string } }) => {
          if (generation !== generationRef.current) return;
          console.log('[StudyRoom] received voice_note_added event:', payload);
          onVoiceNoteAddedRef.current?.(payload.noteId);
        })
        .on('broadcast', { event: 'voice_note_deleted' }, ({ payload }: { payload: { noteId: string } }) => {
          if (generation !== generationRef.current) return;
          onVoiceNoteDeleteRef.current?.(payload.noteId);
        })
        .on('broadcast', { event: 'blank_page_added' }, ({ payload }: { payload: RoomBlankPagePayload }) => {
          if (generation !== generationRef.current) return;
          onBlankPageRef.current?.(payload);
        })
        .on('presence', { event: 'sync' }, () => {
          if (generation !== generationRef.current) return;
          type PresenceEntry = { ts: number; name?: string };
          const state = channel.presenceState<PresenceEntry>();
          const entries = Object.values(state).flat();
          const names = entries.map((e) => e.name ?? '').filter(Boolean);
          setMemberNames(names);
          setMemberCount(entries.length || 1);
        })
        .subscribe(async (status) => {
          if (deadRef.current || generation !== generationRef.current) return;

          console.log(`[StudyRoom] channel status="${status}" gen=${generation}`);

          if (status === 'SUBSCRIBED') {
            retryRef.current = 0;
            // Track with whatever name we have now; re-tracked via the myDisplayName effect
            await channel.track({ ts: Date.now(), name: myDisplayNameRef.current ?? '' });
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

  const broadcastBlankDrawing = useCallback((pageId: string, data: string) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'blank_drawing', payload: { pageId, data } })
      .catch((err) => console.error('[StudyRoom] broadcast blank_drawing error:', err));
  }, []);

  const broadcastVoiceNoteAdded = useCallback((noteId: string) => {
    const ch = channelRef.current;
    const state = (ch as unknown as { state?: string })?.state ?? 'no channel';
    console.log('[StudyRoom] broadcastVoiceNoteAdded — channel state:', state, 'noteId:', noteId);
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'voice_note_added', payload: { noteId } })
      .catch((err) => console.error('[StudyRoom] broadcast voice_note_added error:', err));
  }, []);

  const broadcastVoiceNoteDelete = useCallback((noteId: string) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'voice_note_deleted', payload: { noteId } })
      .catch((err) => console.error('[StudyRoom] broadcast voice_note_deleted error:', err));
  }, []);

  const broadcastBlankPageAdded = useCallback((page: RoomBlankPagePayload) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'blank_page_added', payload: page })
      .catch((err) => console.error('[StudyRoom] broadcast blank_page_added error:', err));
  }, []);

  return {
    broadcastDrawing, broadcastBlankDrawing,
    broadcastVoiceNoteAdded, broadcastVoiceNoteDelete,
    broadcastBlankPageAdded,
    memberCount, memberNames,
  };
}
