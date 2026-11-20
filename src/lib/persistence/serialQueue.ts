/** Serialize writes to the same resource without blocking unrelated documents. */
export function createSerialQueue() {
  const pending = new Map<string, Promise<unknown>>();
  return function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    pending.set(key, next);
    void next.finally(() => {
      if (pending.get(key) === next) pending.delete(key);
    }).catch(() => undefined);
    return next;
  };
}
