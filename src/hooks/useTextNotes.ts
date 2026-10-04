'use client';
import { useEffect, useRef, useState } from 'react';
import type { TextNote } from '@/types';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import { saveTextNotes } from '@/lib/supabase/db';

type NotesByPage = Record<string, TextNote[]>;

/** Hydrate before saving; keep local notes available when a remote write fails. */
export function useTextNotes(userId: string | null) {
  const [notes, setNotes] = useState<NotesByPage>({});
  const [ready, setReady] = useState(false);
  const previous = useRef<NotesByPage>({});

  useEffect(() => {
    // Browser storage is restored after hydration to keep server/client markup consistent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(storageGet<NotesByPage>(KEYS.TEXT_NOTES) ?? {});
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    storageSet(KEYS.TEXT_NOTES, notes);
    if (!userId) return;
    for (const [key, pageNotes] of Object.entries(notes)) {
      if (previous.current[key] === pageNotes) continue;
      const separator = key.indexOf(':');
      if (separator < 0) continue;
      previous.current[key] = pageNotes;
      void saveTextNotes(key.slice(0, separator), key.slice(separator + 1), pageNotes)
        .catch((error: unknown) => {
          if (previous.current[key] === pageNotes) delete previous.current[key];
          console.error('Text notes could not be synced; local copy retained', error);
        });
    }
  }, [notes, ready, userId]);

  return [notes, setNotes] as const;
}
