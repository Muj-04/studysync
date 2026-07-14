'use client';

import { useCallback, useState } from 'react';
import type { PenType, Tool } from '@/lib/drawing';

export type StrokeSizeMode = 'pen' | 'marker' | 'highlighter' | 'line' | 'eraser';

export const DEFAULT_TOOL_STROKE_SIZES: Record<StrokeSizeMode, number> = {
  pen: 3,
  marker: 5,
  highlighter: 4,
  line: 3,
  eraser: 6,
};

export function getStrokeSizeMode(tool: Tool, penType: PenType): StrokeSizeMode {
  if (tool === 'eraser') return 'eraser';
  if (tool === 'line') return 'line';
  if (penType === 'marker') return 'marker';
  if (penType === 'highlighter') return 'highlighter';
  return 'pen';
}

/** Keeps an independent, remembered stroke size for every drawing tool. */
export function useToolStrokeSize(tool: Tool, penType: PenType) {
  const [sizes, setSizes] = useState<Record<StrokeSizeMode, number>>(DEFAULT_TOOL_STROKE_SIZES);
  const mode = getStrokeSizeMode(tool, penType);

  const setStrokeSize = useCallback((size: number) => {
    setSizes((current) => current[mode] === size ? current : { ...current, [mode]: size });
  }, [mode]);

  return { strokeSize: sizes[mode], setStrokeSize, strokeSizeMode: mode };
}
