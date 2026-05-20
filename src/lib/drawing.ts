export type Tool = 'pen' | 'line' | 'eraser' | 'text';
export type PenType = 'normal' | 'marker' | 'highlighter';

const CUR_PEN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M 0 32 L 3 22 L 18 4 L 22 8 L 7 26 Z' fill='white' stroke='black' stroke-width='1'/%3E%3Cpath d='M 0 32 L 3 22 L 6 25 Z' fill='%23333'/%3E%3Ccircle cx='0' cy='32' r='1.2' fill='black'/%3E%3C/svg%3E\") 0 32, crosshair";

const CUR_HIGHLIGHTER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M 6 12 L 12 6 L 26 20 L 20 26 Z' fill='%23FFD700' stroke='black' stroke-width='1'/%3E%3Cpolygon points='20,26 26,20 28,28' fill='%23333'/%3E%3Ccircle cx='27' cy='27' r='1.2' fill='black'/%3E%3C/svg%3E\") 27 27, crosshair";

const CUR_ERASER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect x='6' y='12' width='20' height='11' rx='2' fill='%23ffb3b3' stroke='black' stroke-width='1'/%3E%3Crect x='6' y='12' width='8' height='11' rx='2' fill='%23ff6b6b' stroke='black' stroke-width='1'/%3E%3C/svg%3E\") 16 18, crosshair";

const CUR_MARKER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M 6 10 L 10 6 L 24 20 L 20 24 Z' fill='%234A90E2' stroke='black' stroke-width='1'/%3E%3Cpolygon points='20,24 24,20 27,27' fill='%23333'/%3E%3Ccircle cx='26' cy='26' r='1.5' fill='black'/%3E%3C/svg%3E\") 26 26, crosshair";

/** Returns the CSS cursor value for a given drawing tool + pen type. */
export function getDrawingCursor(tool: Tool, penType: PenType): string {
  if (tool === 'text')   return 'text';
  if (tool === 'eraser') return CUR_ERASER;
  // pen or line
  if (penType === 'highlighter') return CUR_HIGHLIGHTER;
  if (penType === 'marker')      return CUR_MARKER;
  return CUR_PEN;
}

export const PRESET_COLORS = [
  '#111111', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899',
] as const;

export const SIZES = [
  { label: 'S', value: 2 },
  { label: 'M', value: 5 },
  { label: 'L', value: 10 },
  { label: 'XL', value: 20 },
] as const;
