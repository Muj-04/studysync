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

  // Presence payloads are controlled by the sender. Resolve identities from
  // RLS-protected room membership instead of trusting websocket metadata.
  const loadAuthorizedMembers = useCallback(async () => {
    const client = createClient();
    const { data: memberRows, error: memberError } = await client
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId);
    if (memberError || deadRef.current) return;

    const userIds = [...new Set((memberRows ?? []).map((row) => String(row.user_id)))];
    if (userIds.length === 0) {
      setMembers([]);
      setMemberCount(1);
      return;
    }

    const { data: profiles } = await client
      .from('profiles')
      .select('id, username, avatar_url, is_vip')
      .in('id', userIds);
    if (deadRef.current) return;

    const profileById = new Map((profiles ?? []).map((profile) => [String(profile.id), profile]));
    const authorized = userIds.map((userId) => {
      const profile = profileById.get(userId);
      return {
        userId,
        name: String(profile?.username ?? 'Member'),
        avatarUrl: profile?.avatar_url ? String(profile.avatar_url) : undefined,
        isVip: profile?.is_vip === true,
      };
    });
    setMembers(authorized);
    setMemberCount(Math.max(1, authorized.length));
  }, [roomId]);

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
      timerRef.current = setTimeout(() => { void connect(); }, delay);
    }

    async function connect() {
      if (deadRef.current) return;

      const generation = ++generationRef.current;

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      const channelName = `room:${roomId}`;
      console.log(`[StudyRoom] connecting — channel="${channelName}" gen=${generation}`);

      // No presence.key override — let Supabase assign a unique key per client
      const client = createClient();
      const { data: { session } } = await client.auth.getSession();
      if (deadRef.current || generation !== generationRef.current) return;
      if (!session?.access_token) {
        console.warn('[StudyRoom] realtime authentication unavailable');
        scheduleReconnect();
        return;
      }
      await client.realtime.setAuth(session.access_token);
      if (deadRef.current || generation !== generationRef.current) return;

      const channel = client.channel(channelName, {
        config: { private: true, broadcast: { self: false } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          if (generation !== generationRef.current) return;
          void loadAuthorizedMembers();
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_strokes',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (generation !== generationRef.current) return;
            const row = payload.new as { page_key?: string; stroke?: RoomStrokePayload } | undefined;
            if (!row?.page_key || !row.stroke) return;
            onStrokeRef.current?.(row.page_key, row.stroke);
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'room_voice_notes', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (generation !== generationRef.current) return;
            const noteId = (payload.new as { id?: string } | undefined)?.id;
            if (noteId) onVoiceNoteAddedRef.current?.(noteId);
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'room_voice_notes', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (generation !== generationRef.current) return;
            const noteId = (payload.old as { id?: string } | undefined)?.id;
            if (noteId) onVoiceNoteDeleteRef.current?.(noteId);
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'room_blank_pages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (generation !== generationRef.current) return;
            const row = payload.new as {
              id?: string; insert_after_page?: number; bg_theme?: string; created_at?: number;
            } | undefined;
            if (!row?.id) return;
            onBlankPageRef.current?.({
              id: row.id,
              insertAfterPage: Number(row.insert_after_page ?? 0),
              bgTheme: row.bg_theme === 'dark' ? 'dark' : 'white',
              createdAt: Number(row.created_at ?? Date.now()),
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'room_document_events', filter: `room_id=eq.${roomId}` },
          async (payload) => {
            if (generation !== generationRef.current) return;
            const row = payload.new as { user_id?: string; file_name?: string } | undefined;
            if (!row?.user_id || !row.file_name || row.user_id === myPresenceRef.current?.userId) return;
            const { data: profile } = await client
              .from('profiles')
              .select('username')
              .eq('id', row.user_id)
              .maybeSingle();
            if (generation !== generationRef.current) return;
            onDocChangeRef.current?.(String(profile?.username ?? 'A room member'), row.file_name);
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'study_rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            if (generation !== generationRef.current) return;
            const nextStatus = (payload.new as { status?: string } | undefined)?.status;
            const prevStatus = (payload.old as { status?: string } | undefined)?.status;
            if (nextStatus === 'closed' && prevStatus !== 'closed') {
              onRoomClosedRef.current?.();
            }
          },
        )
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
            event: '*',
            schema: 'public',
            table: 'room_members',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            if (generation !== generationRef.current) return;
            void loadAuthorizedMembers();
          },
        )
        .subscribe(async (status) => {
          if (deadRef.current || generation !== generationRef.current) return;

          console.log(`[StudyRoom] channel status="${status}" gen=${generation}`);

          if (status === 'SUBSCRIBED') {
            retryRef.current = 0;
            await channel.track({ onlineAt: new Date().toISOString() });
            await loadAuthorizedMembers();
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

    void connect();

    return () => {
      deadRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId, loadAuthorizedMembers]);

  const broadcastDrawing = useCallback((pageNumber: number, data: string) => {
    void pageNumber; void data;
    return Promise.resolve(true);
  }, []);

  const broadcastBlankDrawing = useCallback((pageId: string, data: string) => {
    void pageId; void data;
    return Promise.resolve(true);
  }, []);

  // Stroke delta — sent on every completed stroke. Recipients dedupe by
  // stroke.id, so a stroke that arrives both via realtime and via the
  // reconnect reconciliation fetch is applied only once.
  const broadcastStroke = useCallback((pageKey: string, stroke: RoomStrokePayload) => {
    void pageKey; void stroke;
    return Promise.resolve(true);
  }, []);

  const broadcastVoiceNoteAdded = useCallback((noteId: string) => {
    void noteId;
    return Promise.resolve(true);
  }, []);

  const broadcastVoiceNoteDelete = useCallback((noteId: string) => {
    void noteId;
    return Promise.resolve(true);
  }, []);

  const broadcastBlankPageAdded = useCallback((page: RoomBlankPagePayload) => {
    void page;
    return Promise.resolve(true);
  }, []);

  const broadcastRoomClosed = useCallback(() => {
    return Promise.resolve(true);
  }, []);

  const broadcastDocChanged = useCallback((uploaderName: string, fileName: string) => {
    void uploaderName;
    return (async () => {
      const client = createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user || !fileName.trim()) return false;
      const { error } = await client.from('room_document_events').insert({
        room_id: roomId,
        user_id: user.id,
        file_name: fileName.trim().slice(0, 255),
      });
      if (error) console.error('[StudyRoom] document event error:', error.message);
      return !error;
    })();
  }, [roomId]);

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
