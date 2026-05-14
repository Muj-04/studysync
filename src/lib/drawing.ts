export type Tool = 'pen' | 'eraser';
export type PenType = 'normal' | 'marker' | 'highlighter';

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
