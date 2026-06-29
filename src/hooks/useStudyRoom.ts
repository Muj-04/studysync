'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RoomStrokePayload } from '@/lib/supabase/db';

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

export interface RoomMember {
  userId: string;
  name: string;
  avatarUrl?: string;
  isVip?: boolean;
}

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export function useStudyRoom(
  roomId: string,
  onIncomingDrawing: (pageNumber: number, data: string) => void,
  onReconnect?: () => void,
  onIncomingVoiceNoteAdded?: (noteId: string) => void,
  onIncomingVoiceNoteDelete?: (noteId: string) => void,
  onIncomingBlankPage?: (page: RoomBlankPagePayload) => void,
  myPresence?: { userId?: string; name?: string; avatarUrl?: string; isVip?: boolean },
  onIncomingBlankDrawing?: (pageId: string, data: string) => void,
  onRoomClosed?: () => void,
  onIncomingDocChange?: (uploaderName: string, fileName: string) => void,
  // New stroke-event broadcast (append-only). Coexists with the legacy
  // 'drawing' / 'blank_drawing' PNG-snapshot events for back-compat during
  // rollout. Rooms using the new model should set this and ignore the
  // legacy ones.
  onIncomingStroke?: (pageKey: string, stroke: RoomStrokePayload) => void,
) {
  const [memberCount, setMemberCount] = useState(1);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const channelRef           = useRef<RealtimeChannel | null>(null);
  const onDrawingRef         = useRef(onIncomingDrawing);
  const onReconnectRef       = useRef(onReconnect);
  const onVoiceNoteAddedRef  = useRef(onIncomingVoiceNoteAdded);
  const onVoiceNoteDeleteRef = useRef(onIncomingVoiceNoteDelete);
  const onBlankPageRef       = useRef(onIncomingBlankPage);
  const onStrokeRef          = useRef(onIncomingStroke);
  const onBlankDrawingRef    = useRef(onIncomingBlankDrawing);
  const onRoomClosedRef      = useRef(onRoomClosed);
  const onDocChangeRef       = useRef(onIncomingDocChange);
  const myPresenceRef        = useRef(myPresence);
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
  useEffect(() => { onStrokeRef.current = onIncomingStroke; });
  useEffect(() => { onBlankDrawingRef.current = onIncomingBlankDrawing; });
  useEffect(() => { onRoomClosedRef.current = onRoomClosed; });
  useEffect(() => { onDocChangeRef.current = onIncomingDocChange; });
  useEffect(() => { myPresenceRef.current = myPresence; });

  // Re-track presence when name or avatar becomes available (loads async after connect)
  useEffect(() => {
    if (!myPresence?.name) return;
    const ch = channelRef.current;
    if (!ch) return;
    ch.track({
      ts: Date.now(),
      userId: myPresence.userId ?? '',
      name: myPresence.name,
      avatarUrl: myPresence.avatarUrl ?? '',
      isVip: myPresence.isVip ?? false,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPresence?.name, myPresence?.avatarUrl, myPresence?.isVip]);

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
        .on('broadcast', { event: 'stroke' }, ({ payload }: { payload: { pageKey: string; stroke: RoomStrokePayload } }) => {
          if (generation !== generationRef.current) return;
          onStrokeRef.current?.(payload.pageKey, payload.stroke);
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
        .on('broadcast', { event: 'room_closed' }, () => {
          if (generation !== generationRef.current) return;
          onRoomClosedRef.current?.();
        })
        .on('broadcast', { event: 'doc_changed' }, ({ payload }: { payload: { uploaderName: string; fileName: string } }) => {
          if (generation !== generationRef.current) return;
          onDocChangeRef.current?.(payload.uploaderName, payload.fileName);
        })
        .on('presence', { event: 'sync' }, () => {
          if (generation !== generationRef.current) return;
          type PresenceEntry = { ts: number; userId?: string; name?: string; avatarUrl?: string; isVip?: boolean };
          const state = channel.presenceState<PresenceEntry>();
          const entries = Object.values(state).flat();
          // Deduplicate by userId — same user in multiple tabs counts once
          const byUserId = new Map<string, PresenceEntry>();
          for (const e of entries) {
            const uid = e.userId || `anon-${Math.random()}`;
            if (!byUserId.has(uid) || (e.ts ?? 0) > (byUserId.get(uid)!.ts ?? 0)) {
              byUserId.set(uid, e);
            }
          }
          const unique = [...byUserId.values()];
          setMembers(
            unique
              .filter((e) => e.name)
              .map((e) => ({ userId: e.userId ?? '', name: e.name!, avatarUrl: e.avatarUrl || undefined, isVip: e.isVip ?? false }))
          );
          setMemberCount(unique.length || 1);
        })
        // Postgres Changes DELETE on room_members — DB row existence is the
        // source of truth for "is this user still here". Presence-untrack
        // from a closing tab can fail to flush before the runtime dies
        // (same unload-timing class as the original fetch() bug). By
        // listening to the row delete here, remaining members see the
        // departure as soon as ANY mechanism deletes the row (sendBeacon,
        // fetch+keepalive, explicit Leave button, server-side reaper).
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'room_members',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (generation !== generationRef.current) return;
            const removedUserId = (payload.old as { user_id?: string } | undefined)?.user_id;
            if (!removedUserId) return;
            setMembers((prev) => {
              const next = prev.filter((m) => m.userId !== removedUserId);
              if (next.length !== prev.length) setMemberCount((c) => Math.max(1, c - 1));
              return next;
            });
          },
        )
        .subscribe(async (status) => {
          if (deadRef.current || generation !== generationRef.current) return;

          console.log(`[StudyRoom] channel status="${status}" gen=${generation}`);

          if (status === 'SUBSCRIBED') {
            retryRef.current = 0;
            // Track with whatever presence we have now; re-tracked via the myPresence effect
            const p = myPresenceRef.current;
            await channel.track({
              ts: Date.now(),
              userId: p?.userId ?? '',
              name: p?.name ?? '',
              avatarUrl: p?.avatarUrl ?? '',
              isVip: p?.isVip ?? false,
            });
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

  // Stroke delta — sent on every completed stroke. Recipients dedupe by
  // stroke.id, so a stroke that arrives both via realtime and via the
  // reconnect reconciliation fetch is applied only once.
  const broadcastStroke = useCallback((pageKey: string, stroke: RoomStrokePayload) => {
    const ch = channelRef.current;
    const chState = (ch as unknown as { state?: string })?.state ?? 'no channel';
    if (!ch) {
      console.warn('[StudyRoom] broadcastStroke — channel not ready', { pageKey, strokeId: stroke.id, chState });
      return;
    }
    console.log('[StudyRoom] broadcastStroke send', { pageKey, strokeId: stroke.id, chState });
    ch.send({ type: 'broadcast', event: 'stroke', payload: { pageKey, stroke } })
      .then(() => console.log('[StudyRoom] broadcastStroke OK', { strokeId: stroke.id }))
      .catch((err) => console.error('[StudyRoom] broadcastStroke error', { strokeId: stroke.id, err }));
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

  const broadcastRoomClosed = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'room_closed', payload: {} })
      .catch(() => {});
  }, []);

  const broadcastDocChanged = useCallback((uploaderName: string, fileName: string) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event: 'doc_changed', payload: { uploaderName, fileName } })
      .catch((err) => console.error('[StudyRoom] broadcast doc_changed error:', err));
  }, []);

  // Synchronous, fire-and-forget channel teardown for tab-close paths.
  // Untrack first so other members' presence-sync sees us leave promptly
  // (rather than waiting for Realtime's keepalive timeout), then
  // unsubscribe. Flips deadRef so the auto-reconnect loop doesn't bring
  // the channel back up after we've torn it down.
  const disconnectChannel = useCallback(() => {
    const ch = channelRef.current;
    deadRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!ch) return;
    ch.untrack().catch(() => {});
    ch.unsubscribe();
    channelRef.current = null;
  }, []);

  return {
    broadcastDrawing, broadcastBlankDrawing, broadcastStroke,
    broadcastVoiceNoteAdded, broadcastVoiceNoteDelete,
    broadcastBlankPageAdded, broadcastRoomClosed,
    broadcastDocChanged,
    memberCount, members,
    disconnectChannel,
  };
}
