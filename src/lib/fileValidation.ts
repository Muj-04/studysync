export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// Magic bytes
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 — PPTX is a ZIP

// Executable / script extensions that must not appear as a secondary extension
const DANGEROUS_SECONDARY = /\.(exe|bat|cmd|sh|ps1|vbs|php|py|rb|jar|dll|so|dylib|dmg|pkg|msi|com|scr|hta|wsf|wsh)$/i;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export async function validatePdfOrPptx(file: File): Promise<FileValidationResult> {
  const lower = file.name.toLowerCase();

  // 1. Size limit
  if (file.size > MAX_FILE_BYTES) {
    return { valid: false, error: 'File exceeds the 50 MB size limit.' };
  }

  // 2. Extension must be exactly .pdf or .pptx
  const isPdf  = lower.endsWith('.pdf');
  const isPptx = lower.endsWith('.pptx');
  if (!isPdf && !isPptx) {
    return { valid: false, error: 'Only PDF and PPTX files are allowed.' };
  }

  // 3. Double-extension check: strip the final extension, check for dangerous inner extension
  const nameWithoutExt = file.name.slice(0, file.name.lastIndexOf('.'));
  if (DANGEROUS_SECONDARY.test(nameWithoutExt)) {
    return { valid: false, error: 'File has a suspicious double extension.' };
  }

  // 4. Magic bytes — confirm actual file format
  try {
    const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const magic = isPdf ? PDF_MAGIC : ZIP_MAGIC;
    if (!magic.every((b, i) => bytes[i] === b)) {
      return {
        valid: false,
        error: isPdf
          ? 'File does not appear to be a valid PDF.'
          : 'File does not appear to be a valid PPTX.',
      };
    }
  } catch {
    return { valid: false, error: 'Could not read file.' };
  }

  return { valid: true };
}
