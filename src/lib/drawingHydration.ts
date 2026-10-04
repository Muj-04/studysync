/** Cancel decoded images when a canvas changes page or receives a new edit. */
export function createDrawingHydration() {
  let generation = 0;
  return {
    invalidate() { generation += 1; },
    load(data: string, paint: (image: HTMLImageElement) => void) {
      const current = ++generation;
      const image = new Image();
      image.onload = () => { if (current === generation) paint(image); };
      image.src = data;
    },
  };
}
