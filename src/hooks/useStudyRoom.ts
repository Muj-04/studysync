'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export function useStudyRoom(
  roomId: string,
  onIncomingDrawing: (pageNumber: number, data: string) => void,
  onReconnect?: () => void,
) {
  const [memberCount, setMemberCount] = useState(1);
  const channelRef       = useRef<RealtimeChannel | null>(null);
  const onDrawingRef     = useRef(onIncomingDrawing);
  const onReconnectRef   = useRef(onReconnect);
  const retryRef         = useRef(0);
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadRef          = useRef(false);       // true once cleanup has run
  const connectedOnceRef = useRef(false);       // false on very first SUBSCRIBED
  const generationRef    = useRef(0);           // incremented each connect() call

  // Keep callback refs fresh without causing the effect to re-run.
  useEffect(() => { onDrawingRef.current = onIncomingDrawing; });
  useEffect(() => { onReconnectRef.current = onReconnect; });

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

      // Stamp this attempt so callbacks from the previous channel are ignored.
      const generation = ++generationRef.current;

      // Tear down the previous channel before creating a new one so we don't
      // accumulate duplicate subscriptions. The old channel's status callback
      // may still fire with CLOSED; the generation check below will discard it.
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
          console.log(`[StudyRoom] received drawing — page=${payload.pageNumber} dataLen=${payload.data.length}`);
          onDrawingRef.current(payload.pageNumber, payload.data);
        })
        .on('presence', { event: 'sync' }, () => {
          if (generation !== generationRef.current) return;
          const count = Object.keys(channel.presenceState()).length;
          setMemberCount(count || 1);
        })
        .subscribe(async (status) => {
          // Discard callbacks from superseded or cleaned-up channels.
          if (deadRef.current || generation !== generationRef.current) return;

          console.log(`[StudyRoom] channel status="${status}" gen=${generation}`);

          if (status === 'SUBSCRIBED') {
            retryRef.current = 0;
            await channel.track({ ts: Date.now() });
            if (connectedOnceRef.current) {
              // This is a reconnect — tell the caller to re-sync drawing state.
              console.log('[StudyRoom] reconnected — calling onReconnect');
              onReconnectRef.current?.();
            }
            connectedOnceRef.current = true;
          } else if (
            status === 'TIMED_OUT' ||
            status === 'CLOSED' ||
            status === 'CHANNEL_ERROR'
          ) {
            const delay = BACKOFF_MS[Math.min(retryRef.current, BACKOFF_MS.length - 1)];
            console.warn(`[StudyRoom] disconnected (${status}) — reconnecting in ${delay}ms (attempt ${retryRef.current + 1})`);
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
    if (!ch) {
      console.warn('[StudyRoom] broadcastDrawing called but channel is null — not connected yet');
      return;
    }
    console.log(`[StudyRoom] broadcasting drawing — page=${pageNumber} dataLen=${data.length}`);
    ch.send({
      type: 'broadcast',
      event: 'drawing',
      payload: { pageNumber, data },
    }).then((result) => {
      if (result !== 'ok') {
        console.warn('[StudyRoom] broadcast send result:', result);
      }
    }).catch((err) => {
      console.error('[StudyRoom] broadcast send error:', err);
    });
  }, []);

  return { broadcastDrawing, memberCount };
}
