export interface TwoFingerGestureState {
  lastCenterX: number | null;
  lastCenterY: number | null;
  lastDistance: number | null;
  mode: 'undecided' | 'pan' | 'pinch';
}

export function createTwoFingerGestureState(): TwoFingerGestureState {
  return {
    lastCenterX: null,
    lastCenterY: null,
    lastDistance: null,
    mode: 'undecided',
  };
}

export function resetTwoFingerGesture(state: TwoFingerGestureState) {
  state.lastCenterX = null;
  state.lastCenterY = null;
  state.lastDistance = null;
  state.mode = 'undecided';
}

function readTouchPair(e: TouchEvent) {
  if (e.touches.length !== 2) return null;
  const a = e.touches[0];
  const b = e.touches[1];
  const centerX = (a.clientX + b.clientX) / 2;
  const centerY = (a.clientY + b.clientY) / 2;
  const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  return { centerX, centerY, distance };
}

export function seedTwoFingerGesture(e: TouchEvent, state: TwoFingerGestureState) {
  const pair = readTouchPair(e);
  if (!pair) {
    resetTwoFingerGesture(state);
    return;
  }
  state.lastCenterX = pair.centerX;
  state.lastCenterY = pair.centerY;
  state.lastDistance = pair.distance;
  state.mode = 'undecided';
}

export function handleTwoFingerPanZoom(
  e: TouchEvent,
  state: TwoFingerGestureState,
  options: {
    scrollEl: HTMLElement;
    getZoom: () => number;
    onZoomChange?: (zoom: number) => void;
    clampZoom: (zoom: number) => number;
    allowPinchZoom?: boolean;
  },
) {
  const pair = readTouchPair(e);
  if (!pair) {
    resetTwoFingerGesture(state);
    return;
  }

  if (
    state.lastCenterX == null ||
    state.lastCenterY == null ||
    state.lastDistance == null
  ) {
    seedTwoFingerGesture(e, state);
    return;
  }

  const dx = pair.centerX - state.lastCenterX;
  const dy = pair.centerY - state.lastCenterY;
  const panDelta = Math.hypot(dx, dy);
  const distanceDelta = pair.distance - state.lastDistance;
  const absDistanceDelta = Math.abs(distanceDelta);
  const allowPinchZoom = options.allowPinchZoom === true;

  if (state.mode === 'undecided') {
    if (!allowPinchZoom) {
      state.mode = 'pan';
    } else if (absDistanceDelta >= 6 && absDistanceDelta > panDelta * 0.65) {
      state.mode = 'pinch';
    } else if (panDelta >= 2) {
      state.mode = 'pan';
    }
  }

  if (state.mode === 'pinch') {
    e.preventDefault();
    if (state.lastDistance > 0 && options.onZoomChange) {
      const next = options.clampZoom(options.getZoom() * (pair.distance / state.lastDistance));
      options.onZoomChange(next);
    }
  } else if (state.mode === 'pan') {
    e.preventDefault();
    options.scrollEl.scrollLeft -= dx;
    options.scrollEl.scrollTop -= dy;
  }

  state.lastCenterX = pair.centerX;
  state.lastCenterY = pair.centerY;
  state.lastDistance = pair.distance;
}
