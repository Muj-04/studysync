'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Hydration = { complete(): void; cancel(): void };
/** Certification follows the render applying the queued annotation seeds. */
export function useDocumentHydrationCommit() {
  const pending = useRef(new Set<Hydration>());
  const [committed, setCommitted] = useState<Hydration[]>([]);
  useEffect(() => {
    // Use this render's tokens, not every pending token: another event may have
    // queued more seeds since this render, before its passive effects run.
    for (const hydration of committed) {
      if (pending.current.delete(hydration)) hydration.complete();
    }
  }, [committed]);
  useEffect(() => () => { for (const hydration of pending.current) hydration.cancel(); pending.current.clear(); }, []);
  return useCallback((hydration: Hydration) => {
    pending.current.add(hydration);
    setCommitted(previous => [...previous.filter(entry => pending.current.has(entry)), hydration]);
  }, []);
}
