'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirectMessage } from '@/lib/supabase/db';
import { getConversation, markMessagesRead, mergeMessages } from '@/lib/supabase/messages';

export function useConversationHistory(friendId: string, onRead?: (friendId: string) => void) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; }, [onRead]);

  const read = useCallback(async (rows: DirectMessage[]) => {
    const ids = rows.filter((row) => row.senderId === friendId && !row.read).map((row) => row.id);
    if (ids.length) {
      await markMessagesRead(friendId, ids);
      onReadRef.current?.(friendId);
    }
  }, [friendId]);

  useEffect(() => {
    const current = ++generation.current;
    // Reset when switching the external conversation being synchronized.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadingOlder(false); setMessages([]); setError(null); setHasOlder(false);
    void getConversation(friendId).then(async (rows) => {
      if (generation.current !== current) return;
      setMessages((previous) => mergeMessages(rows, previous));
      setHasOlder(rows.length === 100); setLoading(false);
      await read(rows);
    }).catch((failure: unknown) => {
      if (generation.current !== current) return;
      console.error(failure); setLoading(false); setError('Could not load messages. Please try again.');
    });
    return () => { generation.current += 1; };
  }, [friendId, read]);

  const loadOlder = useCallback(async (beforePrepend: () => void) => {
    if (loadingOlder || !hasOlder || !messages.length) return;
    const current = generation.current;
    setLoadingOlder(true);
    try {
      const first = messages[0];
      const rows = await getConversation(friendId, 100, { createdAt: first.createdAt, id: first.id });
      if (generation.current !== current) return;
      beforePrepend();
      setMessages((previous) => mergeMessages(previous, rows));
      setHasOlder(rows.length === 100);
      await read(rows);
    } catch (failure) {
      if (generation.current === current) { console.error(failure); setError('Could not load older messages.'); }
    } finally { if (generation.current === current) setLoadingOlder(false); }
  }, [friendId, hasOlder, loadingOlder, messages, read]);

  return { messages, setMessages, loading, loadingOlder, hasOlder, loadOlder, error };
}
