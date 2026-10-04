// Minimal queued-state/effect harness. Deliberately does not eagerly run state updaters.
exports.createHookHarness = function () {
  const slots = []; let cursor = 0; let pending = []; let effects = [];
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
        slots[i] = deps; effects.push(fn);
      }
    },
  };
  return { react, render(fn) { const queued = pending; pending = []; queued.forEach(fn => fn()); cursor = 0; const result = fn(); const scheduled = effects; effects = []; scheduled.forEach(fn => fn()); return result; } };
};
