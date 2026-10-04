// Minimal queued-state/effect harness. Deliberately does not eagerly run state updaters.
exports.createHookHarness = function () {
  const slots = []; let cursor = 0; let pending = []; let effects = []; const cleanups = new Map();
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value) => pending.push(() => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; })];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, j) => !Object.is(value, slots[i][j]))) {
        slots[i] = deps; effects.push(() => { cleanups.get(i)?.(); const cleanup = fn(); if (cleanup) cleanups.set(i, cleanup); });
      }
    },
  };
  return { react, unmount() { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); }, render(fn) { const queued = pending; pending = []; queued.forEach(fn => fn()); cursor = 0; const result = fn(); const scheduled = effects; effects = []; scheduled.forEach(fn => fn()); return result; } };
};
