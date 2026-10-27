'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextNote } from '@/types';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import { saveTextNotes } from '@/lib/supabase/db';

type NotesByPage = Record<string, TextNote[]>;

/** Hydrate before saving; keep local notes available when a remote write fails. */
export function useTextNotes(userId: string | null) {
  const [notes, setNotes] = useState<NotesByPage>({});
  const [ready, setReady] = useState(false);
  const previous = useRef<NotesByPage>({});
  const pending = useRef<NotesByPage>({});
  const pendingOwner = useRef<string | null>(null);
  const inFlight = useRef<Record<string, TextNote[]>>({});
  const seeded = useRef(new WeakSet<TextNote[]>());

  const seedNotes = useCallback((remote: NotesByPage) => {
    for (const pageNotes of Object.values(remote)) seeded.current.add(pageNotes);
    setNotes((local) => ({ ...remote, ...local }));
  }, []);

  useEffect(() => {
    // Browser storage is restored after hydration to keep server/client markup consistent.
    const stored = storageGet<NotesByPage>(KEYS.TEXT_NOTES) ?? {};
    previous.current = stored;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    storageSet(KEYS.TEXT_NOTES, notes);
    const pendingKey = `${KEYS.TEXT_NOTES}_pending_${encodeURIComponent(userId ?? '')}`;
    if (userId && pendingOwner.current !== userId) {
      const storedPending = storageGet<NotesByPage>(pendingKey) ?? {};
      pending.current = {
        // The main local snapshot is written first and may be newer if the
        // browser closed before the outbox update completed.
        ...Object.fromEntries(Object.keys(storedPending).filter((key) => key in notes).map((key) => [key, notes[key]])),
        ...(pendingOwner.current === null ? pending.current : {}),
      };
      pendingOwner.current = userId;
      inFlight.current = {};
    }
    for (const [key, pageNotes] of Object.entries(notes)) {
      if (previous.current[key] === pageNotes || seeded.current.has(pageNotes)) continue;
      pending.current[key] = pageNotes;
    }
    previous.current = notes;
    if (!userId) return;
    for (const key of Object.keys(pending.current)) {
      if (!(key in notes)) delete pending.current[key];
    }
    // Restored snapshots are clean. Only edits (including failed offline writes)
    // belong in the outbox, so opening an old device cannot replace cloud data.
    storageSet(pendingKey, pending.current);
    for (const [key, pageNotes] of Object.entries(pending.current)) {
      if (inFlight.current[key] === pageNotes) continue;
      const separator = key.indexOf(':');
      if (separator < 0) continue;
      inFlight.current[key] = pageNotes;
      void saveTextNotes(key.slice(0, separator), key.slice(separator + 1), pageNotes)
        .then(() => {
          const stored = storageGet<NotesByPage>(pendingKey) ?? {};
          if (JSON.stringify(stored[key]) === JSON.stringify(pageNotes)) {
            delete stored[key];
            storageSet(pendingKey, stored);
          }
          if (pending.current[key] === pageNotes) delete pending.current[key];
        })
        .catch((error: unknown) => {
          console.error('Text notes could not be synced; local copy retained', error);
        })
        .finally(() => {
          if (inFlight.current[key] === pageNotes) delete inFlight.current[key];
        });
    }
  }, [notes, ready, userId]);

  return [notes, setNotes, seedNotes] as const;
}
