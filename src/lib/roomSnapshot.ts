/** Order authoritative room snapshots against mutations and newer reads. */
export function createRoomSnapshotGate<T extends { id: string }>() {
  let revision = 0;
  let request = 0;
  const changed = new Map<string, number>();
  return {
    touch(id: string) { changed.set(id, ++revision); },
    invalidate() { request++; },
    begin(protectedIds: Iterable<string> = []) {
      const token = ++request;
      const since = revision;
      const protectedAtStart = new Set(protectedIds);
      return (local: T[], remote: T[], protectedNow: Iterable<string> = [], merge = (_local: T, next: T) => next): T[] => {
        if (token !== request) return local;
        const keep = new Set([...protectedAtStart, ...protectedNow]);
        for (const [id, at] of changed) if (at > since) keep.add(id);
        const incoming = new Map(remote.map(item => [item.id, item]));
        const result: T[] = [];
        for (const item of local) {
          const next = incoming.get(item.id);
          if (keep.has(item.id)) result.push(item);
          else if (next) result.push(merge(item, next));
          incoming.delete(item.id);
        }
        // A deletion during the read must not be resurrected either.
        for (const item of incoming.values()) if (!keep.has(item.id)) result.push(item);
        return result;
      };
    },
  };
}
