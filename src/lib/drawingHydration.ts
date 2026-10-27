/** Cancel decoded images when a canvas changes page or receives a new edit. */
export function createDrawingHydration() {
  let generation = 0;
  let pending = false;
  return {
    invalidate() { generation += 1; pending = false; },
    beginEdit() {
      // A cleared canvas has no saved pixels until decoding completes.
      if (pending) return false;
      generation += 1;
      return true;
    },
    load(data: string, paint: (image: HTMLImageElement) => void) {
      const current = ++generation;
      pending = true;
      const image = new Image();
      image.onload = () => {
        if (current !== generation) return;
        pending = false;
        paint(image);
      };
      image.onerror = () => { if (current === generation) pending = false; };
      image.src = data;
    },
  };
}
