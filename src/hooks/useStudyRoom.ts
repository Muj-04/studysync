'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useStudyRoom(
  roomId: string,
  onIncomingDrawing: (pageNumber: number, data: string) => void,
) {
  const [memberCount, setMemberCount] = useState(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onDrawingRef = useRef(onIncomingDrawing);
  useEffect(() => { onDrawingRef.current = onIncomingDrawing; });

  useEffect(() => {
    const channel = createClient().channel(`room:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'drawing' }, ({ payload }: { payload: { pageNumber: number; data: string } }) => {
        onDrawingRef.current(payload.pageNumber, payload.data);
      })
      .on('presence', { event: 'sync' }, () => {
        const count = Object.keys(channel.presenceState()).length;
        setMemberCount(count || 1);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ ts: Date.now() });
        }
      });

    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId]);

  const broadcastDrawing = useCallback((pageNumber: number, data: string) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'drawing',
      payload: { pageNumber, data },
    });
  }, []);

  return { broadcastDrawing, memberCount };
}
