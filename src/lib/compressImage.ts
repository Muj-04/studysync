/**
 * Client-side image downscaling before anything is saved.
 *
 * Images placed on PDF/blank pages are stored as data URLs inside database
 * rows, and avatars go to Storage. A raw phone photo is 3–8 MB (and ~33% more
 * as base64), so every image is resized and re-encoded here first.
 */

export interface CompressOptions {
  /** Longest side in pixels after resizing. */
  maxDimension: number;
  /** Encoder quality for WebP/JPEG (0–1). */
  quality: number;
}

export const PAGE_IMAGE_OPTIONS: CompressOptions = { maxDimension: 1600, quality: 0.8 };
export const AVATAR_OPTIONS: CompressOptions = { maxDimension: 512, quality: 0.85 };

/** Largest data URL we will put into a page (after compression). */
export const MAX_PAGE_IMAGE_DATA_URL_CHARS = 2_000_000; // ≈1.5 MB of image bytes

export function scaledSize(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension || longest <= 0) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Applies EXIF rotation so phone photos aren't sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read this image.'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resize to `maxDimension` and re-encode as WebP (keeps transparency).
 * Browsers that can't encode WebP fall back to JPEG for photos and PNG for
 * images that may be transparent.
 */
export async function compressImage(file: Blob, options: CompressOptions): Promise<Blob> {
  const loaded = await loadImage(file);
  try {
    const { width, height } = scaledSize(loaded.width, loaded.height, options.maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process this image.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(loaded.source, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, 'image/webp', options.quality);
    if (!blob || blob.type !== 'image/webp') {
      const mayBeTransparent = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
      blob = mayBeTransparent
        ? await canvasToBlob(canvas, 'image/png', 1)
        : await canvasToBlob(canvas, 'image/jpeg', options.quality);
    }
    if (!blob) throw new Error('Could not process this image.');

    // Small images can grow when re-encoded; keep the original then.
    const unchangedSize = width === loaded.width && height === loaded.height;
    return unchangedSize && file.size <= blob.size ? file : blob;
  } finally {
    loaded.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this image.')));
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(blob);
  });
}

/** Compress an image for placing on a page; returns a data URL. */
export async function compressImageToDataUrl(file: Blob, options: CompressOptions = PAGE_IMAGE_OPTIONS): Promise<string> {
  const dataUrl = await blobToDataUrl(await compressImage(file, options));
  if (dataUrl.length > MAX_PAGE_IMAGE_DATA_URL_CHARS) {
    throw new Error('This image is too large. Please use a smaller image.');
  }
  return dataUrl;
}

export function extensionForImageType(type: string): string {
  switch (type) {
    case 'image/webp': return 'webp';
    case 'image/png': return 'png';
    case 'image/gif': return 'gif';
    default: return 'jpg';
  }
}
